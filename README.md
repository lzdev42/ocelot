# Ocelot

A fork of [OpenChamber](https://github.com/btriapitsyn/openchamber) with an **AI Router** layer for robust, provider-agnostic AI workflows.

---

## What's Different

This fork adds an **AI Router** that solves two practical problems when chaining multiple AI providers:

1. **Unified `thinking` parameter** — Different providers expose "reasoning/thinking" mode via incompatible parameter names and formats. The AI Router normalizes these so you can switch providers without rewriting prompts or API calls.

2. **Automatic failover** — If an API endpoint goes down or returns an error, the AI Router automatically reroutes the request to a backup provider, preventing automated workflows from silently stopping mid-task.

The AI Router **only supports the OpenAI-compatible protocol**. Any provider that exposes an OpenAI-compatible endpoint can be configured directly in the AI Router — including Claude (via Anthropic's OpenAI-compatible endpoint or OpenRouter), DeepSeek, Kimi, Zhipu, Ollama, vLLM, and others. There is no plan to support the Claude native API, since the OpenAI-compatible protocol already covers those models and keeps the failover logic simple and robust.

Everything else stays identical to upstream OpenChamber.

---

## Quick Start

### **Desktop (macOS + Windows)**
Download from [Releases](https://github.com/lzdev42/openchamber/releases).

---

## Features

### Core

- Branchable chat timeline with `/undo`, `/redo`, and one-click forks from earlier turns
- Smart tool UIs for diffs, file operations, permissions, and long-running task progress
- Voice mode with speech input and read-aloud responses for hands-free workflows
- Multi-agent runs from one prompt with isolated worktrees for safe side-by-side comparisons
- Git workflows in-app: identities, commits, PR creation, checks, and merge actions
- GitHub-native workflows: start sessions from issues and pull requests with context already attached
- Plan/Build mode with a dedicated plan view for drafting and iterating implementation steps
- Inline comment drafts on diffs, files, and plans that can be sent back to the agent
- Context visibility tools (token/cost breakdowns, raw message inspection, and activity summaries)
- Integrated terminal with per-directory sessions and stable performance on heavy output
- Built-in skills catalog and local skill management for reusable automation workflows
- **AI Router** — unified thinking parameter handling and automatic provider failover

### Web / PWA

- Provider-aware tunnel access model with Cloudflare `quick`, `managed-remote`, and `managed-local` modes
- One-scan onboarding with tunnel QR + password URL helpers
- Mobile-first experience: optimized chat controls, keyboard-safe layouts, and attachment-friendly UI
- Background notifications plus reliable cross-tab session activity tracking
- Built-in self-update + restart flow that keeps your server settings intact

### Desktop (macOS + Windows)

- Floating Mini Chat: keep a small always-on-top assistant beside your editor, browser, or terminal
- Multiple native windows for separate projects or sessions
- Native notifications for task alerts while Ocelot is hidden
- One-click open in VS Code, Cursor, Terminal, Finder, Explorer, and more
- Desktop host switcher for local and remote Ocelot instances
- Convenient tunnel management without manual setup
- Deep-link connections for joining remote Ocelot from a link
- SSH remote access with host import, connection management, and port forwarding

---

## License

MIT
