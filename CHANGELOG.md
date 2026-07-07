# Changelog

All notable changes to this project will be documented in this file.

## [1.0.1] - 2026-07-07

- Fix AI Router baseURL path mismatch (provider-inject.js)
- Enable bundled OpenCode CLI upgrade at runtime (download, replace, restart)
- Remove bundled-mode shortcut in upgrade-status check

## [1.0.0] - 2026-07-07

- Forked from [openchamber](https://github.com/btriapitsyn/openchamber)
- Added AI Router to unify `thinking` parameter handling across different providers
- Added automatic failover in AI Router to prevent workflows from stopping when an API endpoint fails
