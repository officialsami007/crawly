#!/usr/bin/env python3
"""Tiny local server that lets the Crawly extension ask Laya a typed question.

  pip install laya
  python3 scripts/laya_server.py          # listens on http://127.0.0.1:8765

POST /v1/systemone  {"state": {...}, "questions": {...}}  ->  Laya's answer JSON.
Bound to loopback only; nothing leaves your machine. The first start downloads
the model weights (about 800 MB) and loads them, which can take a few minutes.
"""
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from laya import Router

HOST = os.environ.get("LAYA_HOST", "127.0.0.1")
PORT = int(os.environ.get("LAYA_PORT", "8765"))
DEBUG = bool(os.environ.get("LAYA_DEBUG"))  # print each question and answer

print("Loading Laya (first run downloads the weights)...", flush=True)
router = Router(preload=True)
print(f"Laya ready on http://{HOST}:{PORT}/v1/systemone", flush=True)


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body):
        data = json.dumps(body, default=str).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        if self.path != "/v1/systemone":
            return self._send(404, {"error": "not found"})
        try:
            size = int(self.headers.get("Content-Length", "0"))
            req = json.loads(self.rfile.read(size) or b"{}")
            out = router.predict(req["state"], req["questions"])
            if DEBUG:
                print(json.dumps({"request": req, "answers": out.get("answers")}, default=str), flush=True)
        except Exception as e:  # bad request or model error: the extension falls back
            return self._send(400, {"error": str(e)})
        self._send(200, out)

    def log_message(self, *args):
        pass


ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
