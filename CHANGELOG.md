# Changelog

All notable changes to this project will be documented in this file.

## [1.0.2] - 2026-07-08

- Fix AI Router causing OpenCode to compact context every few messages
- Fix AI Router models missing context/input/output limits in OpenCode config
- Fix AI Router provider requiring API key in settings despite being a local proxy
- Improve AI Router fallback logging to show target route and endpoint

## [1.0.1] - 2026-07-07

- Fix AI Router baseURL path mismatch (provider-inject.js)
- Enable bundled OpenCode CLI upgrade at runtime (download, replace, restart)
- Remove bundled-mode shortcut in upgrade-status check

## [1.0.0] - 2026-07-07

- Forked from [openchamber](https://github.com/btriapitsyn/openchamber)
- Added AI Router to unify `thinking` parameter handling across different providers
- Added automatic failover in AI Router to prevent workflows from stopping when an API endpoint fails
