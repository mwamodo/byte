# Byte

Byte is a macOS AI desktop assistant whose primary distribution is the Electron app. When `Byte.app` launches, it runs the desktop overlay and any configured Telegram bots in the same process, while the CLI remains a separate Node.js entrypoint for terminal use.

## Quick start

```bash
git clone <repo> && cd byte
npm install
npm run dev                              # Launch TUI (interactive mode)
npm run dev -- "list files in this dir"  # Print mode (one-shot)
npm run dev -- --list-models             # Show available models
npm run dev:app                          # Launch Electron desktop app in dev mode
npm run dev -- --gateway                 # Start headless Telegram gateway
```

On first run, Byte creates `~/.byte/` with default workspace files. Use `/login` in the TUI to authenticate with a provider, then `/model` to select a model.

After building and linking:

```bash
npm run build
npm link
byte                                     # TUI mode
byte "explain this error"                # Print mode
byte --app                               # Launch the Electron app and configured channels
byte --gateway                           # Headless Telegram gateway
byte --help                              # Show all options
```

### Runtime paths

| Path | Purpose |
|---|---|
| `~/.byte/byte.config.json` | Runtime config (provider, model, thinking, apiKeys, agents, channels, bindings) |
| `~/.byte/agent/auth.json` | API key storage (managed by `/login`) |
| `~/.byte/agent/models.json` | Cached model registry |
| `~/.byte/workspace/` | Workspace files: `AGENTS.md`, `IDENTITY.md`, `USER.md`, `TOOLS.md` |
| `~/.byte/sessions/cli/` | Persisted CLI sessions |
| `~/.byte/sessions/<agent>/` | Per-agent channel sessions (`desktop-session-index.json`, `telegram-session-index.json`) |

### CLI options

```
byte                          Launch TUI (interactive mode)
byte [prompt]                 Print mode — one-shot, final text to stdout
byte --prompt "..."           Same as above
byte --list-models            Print available models and exit
byte --resume [id]            Resume latest session, or by ID
byte --memory                 Use in-memory session (no persistence)
byte --provider <name>        Provider override (anthropic, openai, etc.)
byte --model <id>             Model override
byte --api-key <key>          Runtime API key (not persisted)
byte --prompt-mode <mode>     full | minimal | none
byte --thinking <level>       off | low | medium | high
byte --tool-summaries <mode>  off | compact
byte --gateway                Start headless Telegram gateway
byte --app                    Launch the Electron app (desktop + configured channels)
byte --help                   Show help
```

### Desktop overlay

`byte --app` starts the Electron app and boots all configured channels in one process. If a desktop binding exists, it opens the floating widget window; if Telegram accounts are configured, it also starts the Telegram bots. The app reads `channels.desktop.accounts`, `channels.telegram.accounts`, and `bindings` from `~/.byte/byte.config.json`.

Desktop account config fields:

| Key | Required | Default | Notes |
|---|---|---|---|
| `hotkey` | No | `CommandOrControl+Shift+Space` | Electron global shortcut string |
| `position` | No | `bottom-right` | One of `top-left`, `top-right`, `bottom-left`, `bottom-right` |

Example:

```json
{
  "channels": {
    "desktop": {
      "accounts": {
        "byte": {
          "hotkey": "Control+Option+Command+Space",
          "position": "bottom-left"
        }
      }
    }
  },
  "bindings": [
    {
      "agentId": "byte",
      "match": { "channel": "desktop", "accountId": "byte" }
    }
  ]
}
```

Important: the renderer uses the configured desktop `accountId` from the main process. Do not assume `default` unless your config actually defines a desktop account named `default`.

### Telegram gateway

`byte --gateway` starts a headless multi-agent Telegram bot. Configure agents, Telegram accounts, and bindings in `~/.byte/byte.config.json`:

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4",
  "telegram": {
    "botToken": "123456:ABC...",
    "allowFrom": [123456789]
  }
}
```

For multi-agent setups, use the full agents/channels/bindings config (see [Multi-agent routing](#multi-agent-routing) below).

The gateway supports:
- Session persistence — conversations resume across restarts
- Streaming via Telegram drafts with edit-message fallback
- Message chunking for responses exceeding Telegram's 4096-char limit
- Typing indicators during processing
- Follow-up queuing when the agent is busy
- Graceful shutdown on SIGINT/SIGTERM

### Current non-goals

- Desktop context injection
- Multiple desktop windows / multiple active desktop accounts at once

---

## Build plan

**Name**: Byte
**CLI command**: `byte`
**Runtime directory**: `~/.byte/`
**Config file**: `~/.byte/byte.config.json`
**Package name**: `byte`

## Architecture overview

### Three entrypoints, one codebase

```
byte                          → CLI (TUI mode or print mode)
byte "explain this error"     → CLI (print mode, one-shot)
byte --app                    → Electron app with desktop + configured channels
byte --gateway                → Headless Telegram gateway (no Electron window)
```

The Electron app is the primary product: when `Byte.app` launches, it runs the desktop overlay and any configured Telegram channels in the same process. The CLI is a separate Node.js entrypoint that does not import Electron during normal terminal use; `byte --gateway` stays headless Telegram-only, and `byte --app` remains available as a convenience way to launch the app during development.

### Unified runtime

All three entrypoints bootstrap the same shared runtime:

- **Config loader** — reads `~/.byte/byte.config.json`
- **Auth storage** — `~/.byte/agent/auth.json` (pi-mono's `AuthStorage`)
- **Model registry** — `~/.byte/agent/models.json` (pi-mono's `ModelRegistry`)
- **Workspace files** — `AGENTS.md`, `IDENTITY.md`, `USER.md`, `TOOLS.md` per agent
- **Session manager** — persistent conversations per agent per channel
- **Prompt builder** — system prompt with workspace files + optional desktop context

### Multi-agent routing

Directly adapted from pi-claw's multi-agent system. The config defines agents, channels, and bindings:

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4",
  "thinking": "medium",
  "agents": {
    "list": [
      { "id": "byte" },
      { "id": "pi", "provider": "openai", "model": "gpt-4.1-mini" }
    ]
  },
  "channels": {
    "desktop": {
      "accounts": {
        "default": {
          "hotkey": "CommandOrControl+Shift+Space",
          "position": "bottom-right"
        }
      }
    },
    "telegram": {
      "accounts": {
        "default": {
          "botToken": "123456:ABC...",
          "allowFrom": [123456789]
        }
      }
    }
  },
  "bindings": [
    { "agentId": "byte", "match": { "channel": "desktop", "accountId": "default" } },
    { "agentId": "pi", "match": { "channel": "telegram", "accountId": "default" } }
  ]
}
```

### Channel abstraction

Each channel type implements the same pattern: receive user input, route to the bound agent, stream the response back. The desktop channel currently provides Electron IPC and persistent per-account desktop sessions. macOS context injection is planned later.

```
Channel interface:
  - receive(message) → route to agent
  - stream(response) → deliver to user
DesktopChannel   — Electron IPC, overlay window, per-account desktop sessions
TelegramChannel  — grammY bot, long polling, message editing/drafts
CLIChannel       — stdin/stdout, TUI or print mode (uses pi-mono InteractiveMode)
```

### Runtime directory layout

```
~/.byte/
├── byte.config.json
├── agent/
│   ├── auth.json
│   └── models.json
├── workspace/                    # Agent: byte (default desktop agent)
│   ├── AGENTS.md
│   ├── IDENTITY.md
│   ├── USER.md
│   └── TOOLS.md
├── workspace-pi/                 # Agent: pi (default telegram agent)
│   ├── AGENTS.md
│   ├── IDENTITY.md
│   ├── USER.md
│   └── TOOLS.md
└── sessions/
    ├── cli/                      # CLI sessions (shared workspace with byte)
    ├── byte/                     # Desktop agent sessions
    │   └── desktop-session-index.json
    └── pi/                       # Telegram agent sessions
        └── telegram-session-index.json
```

## Source structure

```
byte/
├── package.json
├── tsconfig.json
├── tsconfig.test.json
├── eslint.config.mjs
├── .prettierrc.json
├── electron-builder.yml          # macOS .dmg packaging config
│
├── src/
│   ├── cli.ts                    # CLI entrypoint — TUI, print mode, and --gateway dispatch
│   ├── app.ts                    # Electron app entrypoint (Phase 3)
│   ├── gateway.ts                # Gateway bot creation (grammY bot, streaming, drafts)
│   │
│   ├── config.ts                 # Config loader (byte.config.json)
│   ├── runtime.ts                # Shared runtime bootstrap
│   ├── prompt.ts                 # System prompt builder
│   ├── workspace.ts              # Workspace seeding
│   ├── render.ts                 # Error formatting helpers
│   ├── agents.ts                 # Multi-agent initialization
│   ├── agent-session.ts          # Session factory (wraps pi-mono)
│   ├── session.ts                # CLI session manager helpers
│   ├── resource-loader.ts        # Prompt resource loader
│   │
│   ├── router/
│   │   └── multi-gateway.ts      # Multi-agent router (binds Telegram accounts to agents)
│   │
│   ├── channels/
│   │   ├── telegram.ts           # Telegram channel (chunking, sending, editing, drafts)
│   │   ├── desktop.ts            # Desktop channel (Phase 3 — Electron IPC bridge)
│   │   └── types.ts              # Channel interface (Phase 3)
│   │
│   ├── context/
│   │   └── engine.ts             # macOS context engine (Phase 5 — AppleScript, clipboard)
│   │
│   ├── sessions/
│   │   └── registry.ts           # Telegram session registry (index-based persistence)
│   │
│   ├── desktop/                  # Phase 3
│   │   ├── ipc.ts                # Desktop IPC payload types
│   │   ├── main.ts               # Electron main process + IPC handlers
│   │   ├── preload.ts            # Context bridge bootstrap
│   │   ├── preload-api.ts        # Typed preload API surface
│   │   ├── tray.ts               # System tray setup
│   │   └── window.ts             # Overlay window creation
│   │
│   └── renderer/
│       ├── index.html            # Vite renderer entry
│       └── src/
│           ├── App.tsx           # Overlay UI
│           ├── main.tsx          # React bootstrap
│           └── styles.css        # Overlay styles
│
├── test/
│   ├── config.test.ts
│   ├── prompt.test.ts
│   ├── gateway.test.ts
│   ├── context.test.ts
│   ├── sessions.test.ts
│   └── workspace.test.ts
│
├── assets/
│   ├── icon.icns                 # macOS app icon
│   └── tray-icon.png             # Menu bar icon (template image)
│
└── docs/
    ├── architecture.md           # Technical design reference
    └── pi-claw-mapping.md        # What was ported from pi-claw and how
```

## What carries over from pi-claw

These modules are adapted from pi-claw (local pi-claw path `/Users/mwamodo/code/pi-claw`). "Adapted" means the logic is the same but paths, names, and imports change from `pi-claw` to `byte`.

| pi-claw module | Byte module | Changes |
|---|---|---|
| `src/config.ts` | `src/config.ts` | Paths change to `~/.byte/`, add desktop channel config, add `--app` / `--gateway` flags |
| `src/runtime.ts` | `src/runtime.ts` | Paths change, otherwise identical |
| `src/prompt.ts` | `src/prompt.ts` | Add `desktopContext` parameter to `buildSystemPrompt()` |
| `src/workspace.ts` | `src/workspace.ts` | Different default content for IDENTITY.md (Byte personality) |
| `src/render.ts` | `src/render.ts` | Identical |
| `src/agents.ts` | `src/agents.ts` | Identical (ported in Phase 2) |
| `src/agent-session.ts` | `src/agent-session.ts` | Identical |
| `src/session.ts` | `src/session.ts` | Paths change to `~/.byte/sessions/cli/` |
| `src/sessions.ts` | `src/sessions/registry.ts` | Import paths updated, moved to sessions dir (ported in Phase 2) |
| `src/channels/telegram.ts` | `src/channels/telegram.ts` | Identical (ported in Phase 2) |
| `src/gateway.ts` | `src/gateway.ts` | Bot creation logic, import paths updated (ported in Phase 2) |
| `src/multi-gateway.ts` | `src/router/multi-gateway.ts` | Import paths updated, moved to router dir (ported in Phase 2) |
| `src/cli.ts` | `src/cli.ts` | Command name changes, `--gateway` dispatches to headless gateway startup |
| `src/index.ts` | `src/app.ts` | Becomes Electron main — starts overlay + gateway together (Phase 3) |

### What is new (not in pi-claw)

| Module | Purpose |
|---|---|
| `src/context/engine.ts` | macOS context gathering — active app, clipboard, window title, working directory via AppleScript and pbpaste |
| `src/channels/desktop.ts` | Desktop channel — bridges Electron IPC to agent sessions, injects context |
| `src/desktop/main.ts` | Electron main process lifecycle — window, tray, hotkey registration |
| `src/desktop/preload.ts` | Electron preload — secure IPC bridge via contextBridge |
| `src/desktop/window.ts` | Overlay window config — frameless, transparent, always-on-top, vibrancy |
| `src/desktop/tray.ts` | System tray — agent status, model info, toggle overlay, quit |
| `src/renderer/index.html` | Overlay UI — chat interface, context bar, Byte character |
| `src/gateway.ts` | Gateway bot creation logic — grammY bot with streaming, draft transport, error recovery (ported from pi-claw in Phase 2) |

## Build phases

### Phase 1: CLI foundation

**Goal**: `byte` works from the terminal with pi-mono's TUI and print modes. Auth via `/login`, model selection via `/model`. This is your daily driver immediately.

**Tasks**:
1. Initialize repo: `package.json`, `tsconfig.json`, eslint, prettier
2. `npm install @mariozechner/pi-ai @mariozechner/pi-coding-agent grammy`
3. Port `config.ts` — change all paths from `~/.pi-claw/` to `~/.byte/`, change CLI command name, add `--app` and `--gateway` flags (stub them to print "not yet implemented")
4. Port `runtime.ts`, `workspace.ts`, `render.ts`, `agent-session.ts`, `session.ts` — path changes only
5. Port `prompt.ts` — add `desktopContext?: DesktopContext` parameter to `buildSystemPrompt()`, leave it unused for now
6. Write `src/cli.ts` as the entrypoint: `#!/usr/bin/env node`, same logic as pi-claw's CLI
7. Write default workspace content — Byte personality in `IDENTITY.md`
8. Wire up `npm run dev` → `tsx src/cli.ts` and `npm run build` → `tsc`
9. Test: `npm run dev`, run `/login`, authenticate, run `/model`, select a model, have a conversation
10. Test: `npm run dev -- "list files in this directory"` (print mode)
11. Port `test/config.test.ts`, `test/prompt.test.ts`, `test/workspace.test.ts` with updated paths

**Milestone**: You can `byte` into TUI, `byte "prompt"` for one-shot, authenticate with any provider, and switch models. This replaces pi-claw for daily terminal use.

---

### Phase 2: Telegram gateway (complete)

**Goal**: `byte --gateway` starts the Telegram multi-agent gateway. Same functionality as pi-claw's gateway, running headless (no Electron yet).

**What was built**:
- `src/channels/telegram.ts` — Telegram message channel (chunking, sending, editing, draft transport)
- `src/sessions/registry.ts` — Session registry with index-based persistence and session resumption
- `src/agents.ts` — Multi-agent initialization (workspace + runtime bootstrap per agent)
- `src/gateway.ts` — grammY bot with streaming, draft/edit transport, typing heartbeat, error recovery
- `src/router/multi-gateway.ts` — Multi-agent router that binds Telegram accounts to agents
- `src/cli.ts` — `--gateway` flag dispatches to headless gateway startup
- `test/gateway.test.ts` — 17 tests covering session creation, busy queueing, streaming, draft/edit fallback, chunking, error handling, auth filtering
- `test/sessions.test.ts` — Session registry index-based reopening

**Milestone**: `byte --gateway` starts Telegram bots. Multi-agent config with bindings works. Full pi-claw gateway feature parity under the Byte name.

---

### Phase 3: Desktop channel foundation

**Status**: implemented

**What exists now**:
1. `byte --app` launches an Electron overlay window
2. Desktop accounts are configured via `channels.desktop.accounts`
3. The renderer streams assistant text over IPC
4. Each desktop account has its own persistent session index under the bound agent's sessions directory
5. The renderer reads the active desktop `accountId` from the main process instead of hardcoding it

**Current limitations**:
1. No desktop context gathering yet
2. One overlay window only
3. `--app` does not also start Telegram

**Milestone**: Press `Cmd+Shift+Space`, type a question, get an AI response in the floating panel. The overlay shows/hides cleanly. The bound agent's workspace personality comes through.

---

### Phase 4: Desktop + Telegram unified

**Status**: implemented

**Goal**: The Electron app runs both the desktop overlay AND Telegram bots simultaneously. One process, all channels live.

**Tasks**:
1. Update `src/app.ts` — after Electron is ready, start the multi-gateway which boots all channel types. Telegram bots start long-polling. Desktop channel binds to the overlay window. Both coexist in the same Node.js event loop
2. Add startup logging — same pattern as pi-claw: log each agent, each channel account, each binding
3. Handle graceful shutdown — `SIGINT`/`SIGTERM` stop Telegram polling, dispose sessions, close Electron windows
4. Test: send a Telegram message to the `pi` agent while simultaneously using the desktop overlay with the `byte` agent. Verify they use separate workspaces and sessions
5. Test: config with only `desktop` channel (no Telegram) — Electron app works, no Telegram errors
6. Test: config with only `telegram` channel — runs like headless gateway, overlay is dormant
7. Keep the `--gateway` entrypoint as a true headless mode: it must not import Electron at all

**Milestone**: One `.dmg` app runs everything. Desktop overlay for quick asks, Telegram bots for mobile access, all sharing the same agent infrastructure. The headless gateway mode works without Electron for server use.

**Risk**: The main risk is Electron's Node.js version compatibility with pi-mono's dependencies. Test this early in Phase 3 — if there's a version conflict, you'll know before investing in the desktop UI.

---

### Phase 5: Context engine

**Status**: planned

**Goal**: The desktop overlay is context-aware. It sees which app you're in, what's on your clipboard, and uses that to give better answers.

**Tasks**:
1. Write `src/context/engine.ts` — `ContextEngine` class with:
   - `getActiveApp()` — AppleScript via `osascript` to get frontmost app name + window title
   - `getClipboard()` — `pbpaste` for current clipboard text
   - `getWorkingDirectory()` — AppleScript to get CWD from Terminal/iTerm
   - `gather()` — collects all signals, returns a `DesktopContext` object
   - `hasClipboardChanged()` / `hasActiveAppChanged()` — change detection for future proactive mode
2. Update `src/channels/desktop.ts` — before each prompt, call `contextEngine.gather()` and pass the result to `buildSystemPrompt()`. The context is injected as a `## Current Desktop Context` section in the system prompt
3. Update `src/prompt.ts` — render the `desktopContext` into the system prompt (active app, window title, clipboard content truncated to 2000 chars, working directory)
4. Update the renderer — add a context bar below the header showing the current app name and window title. Update it when the overlay appears
5. Update `src/desktop/main.ts` — when the overlay is shown (hotkey pressed), gather fresh context and send it to the renderer via `webContents.send("context-update", context)`
6. Handle macOS permissions — the Accessibility API requires permission. Detect when permission is missing, show a helpful message in the overlay, link to System Settings
7. Test: open VS Code, press hotkey, ask "what file am I working on?" — Byte should know
8. Test: copy an error message, press hotkey, Byte should proactively mention the clipboard content
9. Write `test/context.test.ts` — test formatting, truncation, change detection (mock the AppleScript calls)

**Milestone**: Byte knows what you're doing. The desktop experience feels genuinely intelligent compared to a generic chatbot.

**Risk**: macOS permissions are the main friction. AppleScript calls can be slow (~200ms each). Run them asynchronously and cache results. If `osascript` fails silently on some apps (which it does for sandboxed apps), degrade gracefully — missing context is fine, a crash is not.

---

### Phase 6: Streaming and polish

**Status**: partially done, additional polish planned

**Goal**: Responses stream token-by-token in the overlay. The UI feels responsive and polished.

**Tasks**:
1. Improve the existing streaming UX — debounce deltas if needed and smooth out the first-token state
2. Update the renderer — render richer markdown in responses (bold, code, inline code) without overcomplicating the stack
3. Add smooth show/hide animations for the overlay window — fade + slight slide from the edge
4. Add the Byte character/avatar — a small animated element (CSS-only) that shows idle, thinking, and responding states
5. Add keyboard shortcuts within the overlay — `Escape` to hide, `Cmd+K` to clear conversation
6. Add response streaming for the Telegram channel — verify the existing draft/edit transport from pi-claw works correctly with the unified router
7. Test streaming with long responses — verify chunking works for both channels
8. Polish the tray menu — show which agents are running, which models they're using, connection status for Telegram bots

**Milestone**: The desktop overlay feels like a real app, not a prototype. Responses appear smoothly, the character is charming, and the whole thing feels fast.

---

### Phase 7: Packaging and distribution

**Status**: planned

**Goal**: `npm run dist` produces a `.dmg` that installs Byte as a native macOS app, with the app as the primary entrypoint and the CLI available separately from the terminal.

**Tasks**:
1. Configure `electron-builder.yml` — target macOS `.dmg`, set app category, icon, code signing (if you have an Apple Developer cert, otherwise unsigned for now)
2. The `.dmg` should install `Byte.app` to `/Applications`
3. On first launch, offer to install the `byte` CLI command — symlink from `/usr/local/bin/byte` to the Node.js binary bundled inside `Byte.app/Contents/Resources/`
4. Handle auto-launch on login — add a "Start at login" toggle in the tray menu, implemented via macOS login items API
5. First-run experience — if no `~/.byte/byte.config.json` exists, the overlay shows a welcome screen: "Welcome to Byte. Use `/login` in the CLI or enter your API key here." with a text field for the key and provider selector
6. Test the full install flow — download `.dmg`, drag to Applications, launch, set up API key, use desktop overlay, use CLI, send a Telegram message
7. Create a minimal landing page (could be a page on xsavo.com or a standalone)

**Milestone**: Someone can download the `.dmg`, install it, and be using Byte in under 2 minutes.

---

### Phase 8: Proactive mode and future

**Status**: planned

This is post-MVP. Included here for completeness, not committed to a timeline.

- **Proactive suggestions** — clipboard change detection triggers a subtle animation on the Byte character. "Looks like you copied an error. Want me to explain it?" Gated by `proactiveMode: true` in config
- **Clipboard classification** — detect if clipboard content is an error stack trace, code snippet, URL, or plain text. Tailor the proactive suggestion accordingly
- **Selected text** — use macOS Accessibility API to read the currently selected text in any app. Requires more invasive permissions
- **Quick actions** — context-dependent buttons in the overlay. "Explain this error", "Refactor this code", "Summarize this page"
- **Multiple desktop accounts** — more than one overlay window, each bound to a different agent. Useful for separating work and personal contexts
- **Additional channels** — Slack, Discord, or a web widget, using the same agent/binding pattern
- **Auto-update** — electron-updater for seamless version bumps

## Key technical decisions

### Electron + Node.js in one process

Active in the current implementation. `byte --app` starts the Electron app and boots all configured channels in one process. `byte --gateway` remains the headless Telegram-only entrypoint and does not import Electron.

### CLI as a separate entrypoint

The CLI (`src/cli.ts`) does NOT import Electron. It's a plain Node.js script that imports the shared runtime, config, and session modules. This means:
- `byte` works in any terminal without Electron overhead
- The CLI binary can run on Linux/Windows if you ever want to, since it doesn't depend on macOS-specific code (the context engine is only used by the desktop channel)
- For development, `npm run dev` uses `tsx src/cli.ts` — fast startup, no Electron wait

### Session isolation

Sessions are isolated per-agent, per-channel-type:
- CLI: `~/.byte/sessions/cli/` (uses the `byte` agent's workspace by default)
- Desktop: `~/.byte/sessions/byte/desktop-session-index.json`
- Telegram: `~/.byte/sessions/pi/telegram-session-index.json`

The CLI shares the `byte` agent's workspace but keeps its own sessions, so CLI conversations don't appear in the desktop overlay and vice versa. You can override with `byte --agent pi` to use a different agent's workspace from the terminal.

### Desktop context is channel-specific

Only the desktop channel gathers macOS context. When a Telegram message comes in for the `byte` agent, it uses the same workspace and personality but does NOT inject desktop context (because it makes no sense — the user isn't at the computer looking at it).

If you later bind the `byte` agent to both desktop and Telegram, the agent behaves slightly differently depending on the channel — context-aware on desktop, pure conversational on Telegram. This is correct behavior, not a bug.

### Config backward compatibility with pi-claw

The config format is a superset of pi-claw's. If someone has a working pi-claw config, they could copy it to `~/.byte/byte.config.json` and the Telegram gateway would work identically. The only additions are the `channels.desktop` section and the desktop-specific fields.

## Default workspace content

### Agent: byte (IDENTITY.md)

```markdown
# Identity

You are Byte, a macOS desktop AI assistant.

## Personality

- Technically competent — assume the user knows what they're doing.
- Helpful but never patronizing. You're a peer, not a teacher.
- Brief by default. You're in a small floating panel, not a full-page editor.
- Direct: "That's a port conflict on 3000" not "It appears you may be experiencing..."
- You have context about what the user is doing. Use it naturally, don't be creepy about it.
- You know your way around macOS, dev tools, and the terminal.
```

### Agent: pi (IDENTITY.md)

```markdown
# Identity

You are Pi, a conversational AI assistant available via Telegram.

## Personality

- Thoughtful and conversational — Telegram messages allow more space than a desktop overlay.
- Technical when the question is technical, casual when it's casual.
- You don't have desktop context, so ask clarifying questions when needed.
```

## Risk register

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Electron Node.js version conflicts with pi-mono deps | High — blocks desktop entirely | Low | Test in Phase 3, day 1. If broken, pin Electron version or use `electron-rebuild` |
| macOS Accessibility permission friction | Medium — context engine partially broken | Medium | Degrade gracefully. Context is nice-to-have, not required for basic operation |
| AppleScript calls slow (>500ms) | Low — overlay feels laggy on show | Medium | Cache context, gather async, show overlay immediately with stale context then update |
| `byte` name collision (npm, CLI) | Low — rename required | Low | Check npm registry. Use scoped package `@xsavo/byte` if needed. CLI name can differ from package name |
| grammY and Electron main thread contention | Low — Telegram delays | Very low | Move Telegram to worker thread only if measured problem appears |
| Unsigned .dmg triggers macOS Gatekeeper | Medium — bad first impression | High (until you sign) | Ship unsigned for personal use. Sign when productizing. Document the right-click > Open workaround |

## Development setup

```bash
mkdir byte && cd byte
npm init -y
npm install @mariozechner/pi-ai@0.58.1 @mariozechner/pi-coding-agent@^0.58.1 grammy@^1.41.1
npm install -D typescript@^5.9.2 tsx@^4.20.5 @types/node@^24.3.0
npm install -D eslint@^10.0.3 eslint-config-prettier@^10.1.8 prettier@^3.8.1
npm install -D @eslint/js@^10.0.1 typescript-eslint@^8.57.0 globals@^17.4.0
```

Electron desktop dependencies:
```bash
npm install electron
npm install -D electron-builder vite @vitejs/plugin-react react react-dom concurrently wait-on @types/react @types/react-dom
```

## Timeline summary

| Phase | Week | Deliverable | Status |
|---|---|---|---|
| 1. CLI foundation | 1 | `byte` TUI + print mode, `/login`, `/model` | Complete |
| 2. Telegram gateway | 2 | `byte --gateway` with multi-agent routing | Complete |
| 3. Desktop foundation | 3 | `byte --app` overlay with config-driven desktop account routing | Complete |
| 4. Unified process | 4 | Desktop + Telegram in one Electron process | Planned |
| 5. Context engine | 5 | Active app, clipboard, CWD awareness | Planned |
| 6. Streaming + polish | 6 | Streaming refinements, animations, richer rendering | In progress / planned |
| 7. Packaging | 7-8 | `.dmg`, CLI install, first-run experience | Planned |
| 8. Proactive mode | 9+ | Clipboard triggers, quick actions | Planned |
