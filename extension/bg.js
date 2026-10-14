// Crawly background worker: defaults on install, REC badge while recording,
// and dynamic content-script registration keyed to origins the user has granted
// via chrome.permissions.request from the popup.

const SCRIPT_ID = origin => 'crawly-' + origin;

async function registerForOrigin(pattern) {
  const id = SCRIPT_ID(pattern);
  try {
    const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [id] });
    if (existing && existing.length) return;
  } catch (e) {}
  try {
    await chrome.scripting.registerContentScripts([{
      id,
      matches: [pattern],
      js: ['content/crawly.js'],
      runAt: 'document_idle',
      allFrames: false,
    }]);
  } catch (e) {}
}

async function unregisterForOrigin(pattern) {
  const id = SCRIPT_ID(pattern);
  try { await chrome.scripting.unregisterContentScripts({ ids: [id] }); } catch (e) {}
}

async function syncRegistered() {
  const perms = await chrome.permissions.getAll();
  const desired = new Set(perms.origins || []);
  let registered = [];
  try { registered = await chrome.scripting.getRegisteredContentScripts(); } catch (e) {}
  const desiredIds = new Set([...desired].map(SCRIPT_ID));
  for (const s of registered) {
    if (s.id.startsWith('crawly-') && !desiredIds.has(s.id)) {
      try { await chrome.scripting.unregisterContentScripts({ ids: [s.id] }); } catch (e) {}
    }
  }
  const registeredIds = new Set(registered.map(s => s.id));
  for (const origin of desired) {
    if (!registeredIds.has(SCRIPT_ID(origin))) await registerForOrigin(origin);
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  const cur = await chrome.storage.local.get(['settings', 'automations']);
  const patch = {};
  if (!cur.settings) patch.settings = { theme: 'noir' };
  if (!cur.automations) patch.automations = [];
  if (Object.keys(patch).length) await chrome.storage.local.set(patch);
  await syncRegistered();
});

chrome.runtime.onStartup.addListener(syncRegistered);

chrome.permissions.onAdded.addListener(perms => {
  (perms.origins || []).forEach(o => registerForOrigin(o));
});
chrome.permissions.onRemoved.addListener(perms => {
  (perms.origins || []).forEach(o => unregisterForOrigin(o));
});

// Typed-decision models for self-healing replays (Laya, local; or Jev, hosted).
// Both speak the same "system one" request: a state plus typed questions in,
// typed answers with probabilities out. Opt-in: needs settings.ai.enabled and the
// host permission the popup requests when the switch is turned on. Any problem
// resolves to { ok: false } so the caller falls back to its local answer.
const AI_ENDPOINTS = {
  // free, open weights, runs on this machine: pip install laya && python3 scripts/laya_server.py
  laya: { url: 'http://127.0.0.1:8765/v1/systemone', model: null, keyed: false, timeout: 8000, wrapState: true },
  typesafe: { url: 'https://api.typesafe.ai/v1/systemone', model: 'jev-latest', keyed: true, timeout: 3000 },
  vercel: { url: 'https://ai-gateway.vercel.sh/typesafe/v1/systemone', model: 'typesafe-ai/jev', keyed: true, timeout: 3000 },
};

async function aiDecide(state, questions) {
  const { settings = {} } = await chrome.storage.local.get('settings');
  const ai = settings.ai || {};
  const ep = AI_ENDPOINTS[ai.endpoint] || AI_ENDPOINTS.laya;
  if (!ai.enabled || (ep.keyed && !ai.key)) return { ok: false, reason: 'off' };
  const body = { state: ep.wrapState ? { document: state } : state, questions };
  if (ep.model) body.model = ep.model;
  const headers = { 'Content-Type': 'application/json' };
  if (ep.keyed) headers.Authorization = 'Bearer ' + ai.key;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ep.timeout);
  try {
    const res = await fetch(ep.url, { method: 'POST', headers, body: JSON.stringify(body), signal: ctl.signal });
    if (!res.ok) return { ok: false, reason: 'http-' + res.status };
    const out = await res.json();
    return { ok: true, answers: out.answers || {} };
  } catch (e) {
    return { ok: false, reason: 'network' };
  } finally {
    clearTimeout(timer);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;
  if (msg.cmd === 'AI_DECIDE' && sender.tab) {
    aiDecide(String(msg.state || ''), msg.questions || {}).then(sendResponse);
    return true;
  }
  if (msg.cmd === 'REC_BADGE' && sender.tab && sender.tab.id != null) {
    chrome.action.setBadgeText({ tabId: sender.tab.id, text: msg.on ? 'REC' : '' });
    chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: '#111111' });
    chrome.action.setBadgeTextColor({ tabId: sender.tab.id, color: '#ffffff' });
    return;
  }
  if (msg.cmd === 'INJECT_TAB' && typeof msg.tabId === 'number') {
    chrome.scripting.executeScript({
      target: { tabId: msg.tabId },
      files: ['content/crawly.js'],
    }).then(() => sendResponse({ ok: true }))
      .catch(e => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
});
