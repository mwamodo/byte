# Byte MVP

This document tracks the original MVP framing for Byte: what the product is, which phases were planned, what is complete, and what is still incomplete.

## MVP goal

Byte's MVP is a macOS AI assistant with:

- a usable terminal CLI
- a desktop overlay launched through Electron
- an optional Telegram gateway
- one shared runtime for config, workspaces, sessions, and prompt construction

The intent was to get a daily-driver version working first, then layer in desktop context, packaging, and polish.

## Product shape

### Entrypoints

```text
byte                          CLI TUI or one-shot print mode
byte --app                    Electron app with desktop overlay
byte --gateway                Headless Telegram gateway
```

### Shared runtime

- Config loader for `~/.byte/byte.config.json`
- Auth storage in `~/.byte/agent/auth.json`
- Model registry in `~/.byte/agent/models.json`
- Workspace files per agent
- Session persistence per channel
- Shared prompt builder and runtime bootstrap

## Status summary

| Phase | Deliverable | Status |
|---|---|---|
| 1. CLI foundation | TUI, print mode, auth, model selection | Complete |
| 2. Telegram gateway | `byte --gateway` with multi-agent routing | Complete |
| 3. Desktop foundation | Electron overlay and desktop account routing | Complete |
| 4. Unified app runtime | Desktop app boots configured channels together | Implemented, still needs packaging-level validation |
| 5. Context engine | Active app, clipboard, working-directory awareness | Planned |
| 6. Streaming and polish | UX refinement, richer rendering, polish | Partially complete |
| 7. Packaging and distribution | `.dmg`, first-run flow, CLI install path | Planned |
| 8. Proactive mode | Suggestions and quick actions | Planned |

## Complete features

### CLI

- Interactive TUI via `byte`
- One-shot print mode via `byte "prompt"` and `byte --prompt`
- `/login` and `/model` flows through the shared runtime
- Model listing, session resume, memory mode, prompt mode, thinking level, tool summary options
- Local workspace mode with `--local`
- Runtime seeding under `~/.byte/`

### Telegram

- Headless Telegram gateway via `byte --gateway`
- Multi-agent configuration through `agents`, `channels`, and `bindings`
- Session persistence and reopening
- Streaming transport with edits/drafts and chunking behavior

### Desktop

- Electron app entrypoint via `byte --app`
- Desktop account config under `channels.desktop.accounts`
- Overlay window and IPC bridge
- Persistent desktop sessions per bound agent/account
- Renderer uses the active desktop `accountId` from the main process

### Shared architecture

- Shared runtime bootstrap across CLI, desktop, and gateway
- Per-agent workspaces and per-channel session isolation
- Config-driven agent/channel binding model

## Incomplete features

### Context engine

These were part of the MVP direction but are not complete yet:

- active app and window-title gathering
- clipboard-aware prompt injection
- working-directory discovery from Terminal/iTerm
- desktop permission handling and degraded fallback messaging
- visible context bar in the renderer

### Polish

- smoother first-token and streaming UX in the overlay
- richer markdown rendering in desktop responses
- overlay animations and stronger visual polish
- tray/status refinements
- more thorough long-response validation across channels

### Distribution

- `npm run dist` validation as the main install path
- `.dmg` install flow and first-run onboarding
- optional CLI install from the packaged app
- login-item / start-at-login support

### Post-MVP / future

- proactive suggestions based on clipboard changes
- quick actions
- selected-text support
- multiple desktop overlays/accounts at once
- more channels beyond Telegram

## Phase details

### Phase 1: CLI foundation

Goal: make Byte useful immediately from the terminal.

Delivered:

- Node/TypeScript CLI scaffold
- runtime/config/workspace/session modules
- Byte-branded workspace defaults
- tests for config, prompt building, and workspace seeding

Milestone: `byte` became usable as the daily-driver terminal entrypoint.

### Phase 2: Telegram gateway

Goal: port the pi-claw gateway capabilities under the Byte runtime.

Delivered:

- Telegram channel implementation
- session registry persistence
- agent bootstrap
- multi-agent router
- gateway tests

Milestone: `byte --gateway` reached feature parity for the Telegram use case.

### Phase 3: Desktop foundation

Goal: add a real desktop channel with an Electron overlay.

Delivered:

- Electron app entrypoint
- overlay window
- desktop account config
- IPC transport between renderer and agent runtime
- persistent desktop sessions

Milestone: the desktop overlay became usable for prompt/response flows.

### Phase 4: Unified runtime

Goal: one app process that can run desktop and Telegram together.

Current state:

- the architecture is implemented around one shared runtime
- desktop and configured channels can be booted together
- more end-to-end validation still belongs in packaging/distribution work

Milestone: the Electron app is the primary product path, with the CLI remaining separate.

### Phase 5: Context engine

Goal: make the desktop channel aware of what the user is doing on macOS.

Planned work:

- AppleScript-based active-app and window-title gathering
- clipboard capture
- working-directory capture for terminal apps
- prompt injection and renderer display

Milestone: Byte should know enough desktop context to answer contextual questions naturally.

### Phase 6: Streaming and polish

Goal: move the overlay from functional MVP to something that feels finished.

Partially done:

- streaming exists

Still needed:

- streaming UX refinement
- richer rendering
- overlay animation
- avatar/character states
- keyboard shortcuts and tray polish

### Phase 7: Packaging and distribution

Goal: make `Byte.app` the normal installation path.

Planned work:

- `.dmg` build and install flow
- CLI availability from the packaged app
- first-run setup
- login-item support

### Phase 8: Proactive mode and future

Goal: push beyond the MVP once the installable desktop app is solid.

Planned work:

- clipboard-triggered suggestions
- content classification
- selected text support
- quick actions
- more channels

## Risks carried by the MVP plan

| Risk | Why it matters |
|---|---|
| Electron/runtime compatibility | Desktop packaging depends on Node/Electron compatibility with the shared runtime dependencies |
| macOS permission friction | Context-aware features depend on permissions that may fail or degrade UX |
| Packaging quality | The product goal depends on a clean install and first-run path, not just dev-mode success |
