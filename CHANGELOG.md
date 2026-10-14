# Changelog

All notable changes to Crawly will be documented in this file.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Self-healing replays: when a recorded element can no longer be found, the
  spider ranks the visible candidates with a local scorer and continues if it
  is confident (60% or more), announcing the match. Otherwise the run fails as
  before.
- Optional AI second opinion for the cases the local scorer is unsure about.
  Off by default; pick Laya (free, runs locally via `laya-serve`) or Jev
  (hosted, bring your own API key) in the popup.

### Changed

- A missing click target is no longer replaced by whatever sits at the recorded
  coordinates until self-healing has had a chance to find it.

## [1.3.0] - 2025

Initial public open source release under the Apache 2.0 license.

### Added

- Record clicks, typed values, select choices, and mouse waypoints on any
  webpage; replay them with a spider that walks to each target.
- Per-origin consent gate for every non-`localhost` domain, with a comic
  consent panel and a revoke button in the popup.
- Multi-page crawls that survive same-origin navigation, with `nav` steps
  acting as assertions on the landing path.
- Auto-run on page load, with a per-tab 60 s brake to prevent loops.
- Import and export of crawls as `.crawly.json` files, with schema validation
  and safety scrubbing of the auto-run flag on import.
- NOIR and HERO themes for the spider.
- Local demo page under `demo/` with chaos controls to simulate app changes.
