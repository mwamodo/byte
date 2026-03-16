# Byte

Byte is a macOS AI desktop assistant with three entrypoints built on the same runtime:

- `byte` for the terminal TUI and one-shot prompts
- `byte --app` for the Electron desktop overlay
- `byte --gateway` for the headless Telegram gateway

This repo started as an MVP for Byte. The product-facing overview lives here; the implementation phases, MVP scope, and feature status now live in [docs/mvp.md](/Users/mwamodo/code/byte/docs/mvp.md).

## Current status

- CLI foundation is implemented
- Telegram gateway is implemented
- Desktop overlay is implemented
- Packaging, richer desktop context, and later MVP polish are still in progress

## Quick start

```bash
git clone <repo> && cd byte
npm install

npm run dev                              # TUI
npm run dev -- "list files in this dir"  # one-shot print mode
npm run dev -- --list-models             # available models
npm run dev:app                          # Electron app in dev mode
npm run dev -- --gateway                 # headless Telegram gateway
```

On first run, Byte creates `~/.byte/` and seeds the default workspace files. In the TUI, use `/login` to authenticate and `/model` to choose a model.

After building:

```bash
npm run build
npm link

byte
byte "explain this error"
byte --app
byte --gateway
```

## Runtime paths

| Path | Purpose |
|---|---|
| `~/.byte/byte.config.json` | Runtime config |
| `~/.byte/agent/auth.json` | Auth storage |
| `~/.byte/agent/models.json` | Cached model registry |
| `~/.byte/workspace/` | Default CLI workspace |
| `~/.byte/sessions/cli/` | CLI sessions |
| `~/.byte/sessions/<agent>/` | Per-agent channel sessions |

## Main commands

```text
byte                          Launch TUI
byte [prompt]                 One-shot print mode
byte --list-models            Print available models and exit
byte --resume [id]            Resume latest or specific session
byte --memory                 Use in-memory session
byte --local                  Use cwd as workspace
byte --provider <name>        Provider override
byte --model <id>             Model override
byte --api-key <key>          Runtime API key override
byte --prompt-mode <mode>     full | minimal | none
byte --thinking <level>       off | low | medium | high
byte --tool-summaries <mode>  off | compact
byte --app                    Launch Electron desktop app
byte --gateway                Start headless Telegram gateway
byte --help                   Show help
```

## Config shape

Byte reads `~/.byte/byte.config.json`. Minimal example:

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4",
  "channels": {
    "desktop": {
      "accounts": {
        "byte": {
          "hotkey": "CommandOrControl+Shift+Space",
          "position": "bottom-right"
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

For multi-agent or Telegram setups, add `agents`, `channels.telegram.accounts`, and `bindings`.

## Docs

- [docs/cli.md](/Users/mwamodo/code/byte/docs/cli.md): CLI usage, workspace modes, runtime config
- [docs/mvp.md](/Users/mwamodo/code/byte/docs/mvp.md): MVP scope, phases, completed work, incomplete work
- [docs/notes/phase-1-cli-foundation-for-byte.md](/Users/mwamodo/code/byte/docs/notes/phase-1-cli-foundation-for-byte.md): original phase 1 implementation notes
