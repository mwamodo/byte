# Byte

Byte is a macOS AI desktop assistant with three interfaces: a desktop overlay (Electron), a Telegram gateway, and a CLI. All three share a unified multi-agent runtime built on pi-mono.

## Quick start (Phase 1 — CLI)

```bash
git clone <repo> && cd byte
npm install
npm run dev                              # Launch TUI (interactive mode)
npm run dev -- "list files in this dir"  # Print mode (one-shot)
npm run dev -- --list-models             # Show available models
```

On first run, Byte creates `~/.byte/` with default workspace files. Use `/login` in the TUI to authenticate with a provider, then `/model` to select a model.

After building and linking:

```bash
npm run build
npm link
byte                                     # TUI mode
byte "explain this error"                # Print mode
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
byte --app                    (not yet implemented)
byte --gateway                (not yet implemented)
byte --help                   Show help
```

### Current non-goals (Phase 1)

- Telegram gateway (`--gateway`) — Phase 2
- Electron desktop app (`--app`) — Phase 3
- Desktop context injection — Phase 5
- Streaming UI, packaging — Phase 6–7

---

## Build plan

**Name**: Byte
**CLI command**: `byte`
**Runtime directory**: `~/.byte/`
**Config file**: `~/.byte/byte.config.json`
**Package name**: `byte`

## Decisions locked in

| Decision | Answer | Rationale |
|---|---|---|
| Product name | Byte | Short, memorable, `byte` is fast to type |
| Repo strategy | Fresh repo, import pi-mono SDK packages | Clean start, no pi-claw baggage |
| Business context | Personal tool first, productize later | No premature pricing/packaging work |
| MVP scope | Desktop + Telegram + CLI, all three | Full vision from the start |
| Auth/onboarding | pi-mono `/login` and `/model` flows | Multi-provider out of the box, no custom auth |
| CLI priority | Essential — daily driver | CLI ships in Phase 1, not an afterthought |
| Default agents | `byte` (desktop) + `pi` (telegram) | Created on first run |
| macOS only | Yes, Electron but target macOS exclusively | Vibrancy, AppleScript context, native feel |

## Architecture overview

### Three entrypoints, one codebase

```
byte                          → CLI (TUI mode or print mode)
byte "explain this error"     → CLI (print mode, one-shot)
byte --app                    → Electron desktop app + Telegram gateway
byte --gateway                → Headless Telegram gateway (no Electron window)
```

The Electron app is the primary distribution. When the `.dmg` app launches, it starts the desktop overlay AND the Telegram gateway in the same process. The CLI is a separate Node.js entrypoint that can run independently — it doesn't need Electron.

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

Each channel type implements the same pattern: receive user input, route to the bound agent, stream the response back. The desktop channel adds macOS context injection. The Telegram channel carries over from pi-claw unchanged.

```
Channel interface:
  - receive(message) → route to agent
  - stream(response) → deliver to user
  - Desktop adds: gather context before each prompt

DesktopChannel   — Electron IPC, overlay window, macOS context engine
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
│   ├── cli.ts                    # CLI entrypoint (#!/usr/bin/env node)
│   ├── app.ts                    # Electron app entrypoint
│   ├── gateway.ts                # Headless gateway entrypoint (no Electron)
│   │
│   ├── config.ts                 # Config loader (byte.config.json)
│   ├── runtime.ts                # Shared runtime bootstrap
│   ├── prompt.ts                 # System prompt builder
│   ├── workspace.ts              # Workspace seeding
│   ├── render.ts                 # Error formatting helpers
│   ├── agents.ts                 # Agent initialization
│   ├── agent-session.ts          # Session factory (wraps pi-mono)
│   ├── session.ts                # CLI session manager helpers
│   │
│   ├── router/
│   │   ├── multi-gateway.ts      # Multi-agent router (starts all channels)
│   │   └── types.ts              # Shared routing types
│   │
│   ├── channels/
│   │   ├── telegram.ts           # Telegram channel (from pi-claw)
│   │   ├── desktop.ts            # Desktop channel (Electron IPC bridge)
│   │   └── types.ts              # Channel interface
│   │
│   ├── context/
│   │   └── engine.ts             # macOS context engine (AppleScript, clipboard)
│   │
│   ├── sessions/
│   │   ├── registry.ts           # Session registry (from pi-claw, generalized)
│   │   └── types.ts              # Session types
│   │
│   ├── desktop/
│   │   ├── main.ts               # Electron main process setup
│   │   ├── preload.ts            # Context bridge for renderer
│   │   ├── tray.ts               # System tray setup
│   │   └── window.ts             # Overlay window creation
│   │
│   └── renderer/
│       ├── index.html            # Overlay UI
│       └── styles.css            # (optional, could be inline)
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
| `src/agents.ts` | `src/agents.ts` | Identical |
| `src/agent-session.ts` | `src/agent-session.ts` | Identical |
| `src/session.ts` | `src/session.ts` | Paths change to `~/.byte/sessions/cli/` |
| `src/sessions.ts` | `src/sessions/registry.ts` | Generalized — works for both Telegram and desktop sessions |
| `src/channels/telegram.ts` | `src/channels/telegram.ts` | Identical |
| `src/gateway.ts` | Part of `src/router/multi-gateway.ts` | Merged into unified router |
| `src/multi-gateway.ts` | `src/router/multi-gateway.ts` | Extended to handle desktop channel type alongside telegram |
| `src/cli.ts` | `src/cli.ts` | Command name changes, add `--app` and `--gateway` flags |
| `src/index.ts` | `src/app.ts` | Becomes Electron main — starts overlay + gateway together |

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
| `src/gateway.ts` | Headless entrypoint — runs multi-gateway without Electron |

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

**Milestone**: You can `byte` into TUI, `byte "prompt"` for one-shot, authenticate with any provider, and switch models. This replaces pi-claw for your daily terminal use.

**Risk**: None. This is a well-understood port of working code.

---

### Phase 2: Telegram gateway

**Goal**: `byte --gateway` starts the Telegram multi-agent gateway. Same functionality as pi-claw's gateway, running headless (no Electron yet).

**Tasks**:
1. Port `src/channels/telegram.ts` — identical to pi-claw
2. Port `src/sessions/registry.ts` — generalize `TelegramSessionRegistry` into a pattern that will also work for desktop sessions later. For now, it's the same Telegram-specific logic with the type parameters cleaned up
3. Port `src/agents.ts` — identical
4. Port `src/router/multi-gateway.ts` — adapted from pi-claw's `multi-gateway.ts`. For now, only handles Telegram channel type. The desktop channel branch is a TODO
5. Write `src/gateway.ts` — the headless entrypoint. Same as pi-claw's `src/index.ts` but invoked via `byte --gateway`
6. Update `src/cli.ts` to dispatch: no flags → TUI, prompt → print mode, `--gateway` → start headless gateway
7. Update `src/config.ts` — add `loadMultiAgentGatewayConfig()` (ported from pi-claw) with `channels.telegram` support
8. Test manually with a real Telegram bot
9. Port `test/gateway.test.ts`, `test/sessions.test.ts`, `test/multi-gateway.test.ts`

**Milestone**: `byte --gateway` starts Telegram bots. Multi-agent config with bindings works. You have the full pi-claw gateway feature set under the Byte name.

**Risk**: Low. Proven code, straight port.

---

### Phase 3: Desktop channel foundation

**Goal**: `byte --app` opens an Electron window with the overlay UI. The overlay can send a prompt and receive a response via IPC. No context engine yet — just a floating chat panel wired to an agent.

**Tasks**:
1. `npm install electron` as a dependency, `electron-builder` as devDependency
2. Write `src/desktop/window.ts` — frameless, transparent, always-on-top BrowserWindow with macOS vibrancy. Positioned based on config. Starts hidden
3. Write `src/desktop/preload.ts` — `contextBridge.exposeInMainWorld("byte", { prompt, hide, getContext, onResponse })`
4. Write `src/desktop/tray.ts` — system tray icon with menu: show/hide, current model info, quit
5. Write `src/desktop/main.ts` — Electron app lifecycle: `app.whenReady()`, create window, create tray, register global hotkey, set up IPC handlers
6. Write `src/channels/desktop.ts` — `DesktopChannel` that handles IPC `prompt` calls by routing to the bound agent's session, streaming text deltas back via `webContents.send()`
7. Write `src/renderer/index.html` — the overlay UI: header with Byte branding, message list, input field, send button. Calls `window.byte.prompt(text)` and listens for streamed responses
8. Update `src/router/multi-gateway.ts` — add the `desktop` channel type branch alongside `telegram`. When a binding maps to `channel: "desktop"`, create a `DesktopChannel` instead of a Telegram bot
9. Update `src/app.ts` — the Electron entrypoint. Bootstraps runtime, initializes agents, creates the multi-gateway (which now starts both desktop and telegram channels), then opens the Electron window
10. Update `src/cli.ts` — `--app` flag spawns the Electron process via `electron .` or similar
11. Wire up `npm run dev:app` → launch Electron in dev mode

**Milestone**: Press `Cmd+Shift+Space`, type a question, get an AI response in the floating panel. The overlay shows/hides cleanly. The bound agent's workspace personality comes through.

**Risk**: Medium. Electron setup has friction — frameless transparent windows, vibrancy, and global hotkeys need per-platform testing. Keep the renderer simple (no React, no bundler) to reduce moving parts.

---

### Phase 4: Desktop + Telegram unified

**Goal**: The Electron app runs both the desktop overlay AND Telegram bots simultaneously. One process, all channels live.

**Tasks**:
1. Update `src/app.ts` — after Electron is ready, start the multi-gateway which boots all channel types. Telegram bots start long-polling. Desktop channel binds to the overlay window. Both coexist in the same Node.js event loop
2. Add startup logging — same pattern as pi-claw: log each agent, each channel account, each binding
3. Handle graceful shutdown — `SIGINT`/`SIGTERM` stop Telegram polling, dispose sessions, close Electron windows
4. Test: send a Telegram message to the `pi` agent while simultaneously using the desktop overlay with the `byte` agent. Verify they use separate workspaces and sessions
5. Test: config with only `desktop` channel (no Telegram) — Electron app works, no Telegram errors
6. Test: config with only `telegram` channel — runs like headless gateway, overlay is dormant
7. Add the `--gateway` entrypoint as a true headless mode: imports the multi-gateway and agent initialization but does NOT import Electron at all. This is important for server deployment where Electron isn't installed

**Milestone**: One `.dmg` app runs everything. Desktop overlay for quick asks, Telegram bots for mobile access, all sharing the same agent infrastructure. The headless gateway mode works without Electron for server use.

**Risk**: The main risk is Electron's Node.js version compatibility with pi-mono's dependencies. Test this early in Phase 3 — if there's a version conflict, you'll know before investing in the desktop UI.

---

### Phase 5: Context engine

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

**Goal**: Responses stream token-by-token in the overlay. The UI feels responsive and polished.

**Tasks**:
1. Update `src/channels/desktop.ts` — subscribe to the agent session's streaming events. On `text_delta`, send incremental text to the renderer via IPC. Debounce at ~50ms to avoid overwhelming the renderer
2. Update the renderer — instead of waiting for the full response, append text as it streams in. Show a typing indicator while the first token is pending. Render markdown in responses (bold, code, inline code) — use a lightweight markdown-to-HTML function, not a full library
3. Add smooth show/hide animations for the overlay window — fade + slight slide from the edge
4. Add the Byte character/avatar — a small animated element (CSS-only) that shows idle, thinking, and responding states
5. Add keyboard shortcuts within the overlay — `Escape` to hide, `Cmd+K` to clear conversation
6. Add response streaming for the Telegram channel — verify the existing draft/edit transport from pi-claw works correctly with the unified router
7. Test streaming with long responses — verify chunking works for both channels
8. Polish the tray menu — show which agents are running, which models they're using, connection status for Telegram bots

**Milestone**: The desktop overlay feels like a real app, not a prototype. Responses appear smoothly, the character is charming, and the whole thing feels fast.

---

### Phase 7: Packaging and distribution

**Goal**: `npm run dist` produces a `.dmg` that installs Byte as a native macOS app with a CLI accessible from the terminal.

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

The Electron main process runs both the overlay UI and the Telegram gateway. This works because grammY's long polling is non-blocking (it uses `fetch` under the hood), and pi-mono's streaming is also async. The only CPU-intensive work is the AI inference, which happens on the provider's servers. The local process is just I/O coordination.

If this becomes a problem (unlikely), the Telegram gateway could move to a forked child process. But start simple.

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

Electron is added in Phase 3:
```bash
npm install electron@^33.0.0
npm install -D electron-builder@^25.0.0
```

## Timeline summary

| Phase | Week | Deliverable | Status |
|---|---|---|---|
| 1. CLI foundation | 1 | `byte` TUI + print mode, `/login`, `/model` | Daily driver |
| 2. Telegram gateway | 2 | `byte --gateway` with multi-agent routing | Feature parity with pi-claw |
| 3. Desktop foundation | 3 | `byte --app` opens overlay, single prompt/response | Electron works |
| 4. Unified process | 4 | Desktop + Telegram in one Electron process | Full architecture |
| 5. Context engine | 5 | Active app, clipboard, CWD awareness | The differentiator |
| 6. Streaming + polish | 6 | Token streaming, animations, markdown | Feels like a product |
| 7. Packaging | 7-8 | `.dmg`, CLI install, first-run experience | Distributable |
| 8. Proactive mode | 9+ | Clipboard triggers, quick actions | Post-MVP |
