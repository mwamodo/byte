# Byte CLI

Byte is a terminal-based AI coding assistant. It runs in two modes: an interactive TUI for conversational sessions and a one-shot print mode for scripting.

## Installation

```bash
npm run build
npm link
```

This exposes the `byte` command globally. For development, use `npm run dev` which runs via `tsx` without a build step.

## Usage

```bash
byte                                # Launch the interactive TUI
byte "list files in this directory" # One-shot: run prompt, print response, exit
byte --prompt "explain main.ts"     # Same as above, explicit flag
byte --list-models                  # Print available models and exit
byte --help                         # Show help text
```

No prompt launches the TUI. A prompt (positional or via `--prompt`) runs one-shot print mode — only the final assistant text goes to stdout, making it safe for shell pipelines.

## Options

| Flag | Description |
|------|-------------|
| `--provider <name>` | Provider name (e.g. `openai`, `anthropic`) |
| `--model <id>` | Model ID, used with `--provider` |
| `--api-key <key>` | Runtime API key override for `--provider` (not persisted) |
| `--prompt-mode <mode>` | `full` \| `minimal` \| `none` |
| `--thinking <level>` | `off` \| `low` \| `medium` \| `high` |
| `--resume [id]` | Resume latest session, or a specific session by ID |
| `--memory` | Use in-memory session (no persistence) |
| `--local` | Use current directory as workspace instead of the global `~/.byte/workspace/` |
| `--tool-summaries <mode>` | `off` \| `compact` |
| `--interactive` | Compatibility alias for TUI mode; cannot combine with a prompt |
| `--list-models` | Print available models and exit |
| `--app` | Launch the Electron desktop app |
| `--gateway` | Start the headless Telegram gateway |
| `-h`, `--help` | Show help text |

## Workspace Modes

Byte supports two workspace modes that control where context files are loaded from and where tool operations are scoped.

### Global mode (default)

The default. Byte uses `~/.byte/workspace/` as the workspace directory. On first run, it seeds this directory with default context files (`AGENTS.md`, `IDENTITY.md`, `USER.md`, `TOOLS.md`). All file tool operations (read, write, edit) are scoped to this directory.

```bash
byte                    # global mode, uses ~/.byte/workspace/
```

### Local mode

In local mode, Byte uses the current working directory as the workspace. This is useful for working directly on a repository — Byte will load any `AGENTS.md`, `IDENTITY.md`, `USER.md`, or `TOOLS.md` found in the current directory and scope tool operations to it.

Activate local mode in two ways:

**CLI flag** (per-invocation):

```bash
byte --local            # uses cwd as workspace
byte --local "explain this project"
```

**Config default** (persistent):

```json
{
  "cli": {
    "workspace": "local"
  }
}
```

The `--local` flag always takes precedence over the config value.

Key behaviors in local mode:
- No files are created or seeded in the current directory. Byte only reads what already exists.
- Context files (`AGENTS.md`, etc.) are loaded from cwd if present; missing files are silently skipped.
- There is no fallback to the global `~/.byte/workspace/` — only cwd files are used.
- Tool operations (read, write, edit, bash) are scoped to cwd.
- Sessions still persist to `~/.byte/sessions/cli/` regardless of workspace mode.

## Runtime Directory

Byte stores all persistent state under `~/.byte/`:

```
~/.byte/
├── byte.config.json          # Runtime configuration
├── agent/
│   ├── auth.json             # Provider authentication tokens
│   └── models.json           # Cached model registry
├── workspace/                # Global workspace (default mode)
│   ├── AGENTS.md             # Agent instructions and constraints
│   ├── IDENTITY.md           # Personality and behavior
│   ├── USER.md               # User-specific preferences
│   └── TOOLS.md              # Tool usage guidance
└── sessions/
    └── cli/                  # Persisted CLI sessions
```

## Configuration

Runtime configuration lives at `~/.byte/byte.config.json`. All fields are optional.

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4",
  "promptMode": "full",
  "thinking": "medium",
  "toolSummaries": "compact",
  "apiKeys": {
    "anthropic": "sk-ant-...",
    "openai": "sk-..."
  },
  "cli": {
    "workspace": "local"
  }
}
```

### Config keys

| Key | Type | Description |
|-----|------|-------------|
| `provider` | `string` | Default provider name |
| `model` | `string` | Default model ID |
| `promptMode` | `"full"` \| `"minimal"` \| `"none"` | System prompt verbosity |
| `thinking` | `"off"` \| `"low"` \| `"medium"` \| `"high"` | Thinking/reasoning level |
| `toolSummaries` | `"off"` \| `"compact"` | Tool call summary display |
| `apiKeys` | `Record<string, string>` | Provider API keys |
| `cli.workspace` | `"local"` \| `"global"` | Default workspace mode |
| `agents` | `object` | Multi-agent definitions (gateway) |
| `channels` | `object` | Channel configurations (gateway) |
| `bindings` | `object` | Agent-to-channel bindings (gateway) |

CLI flags override config values. Config values override built-in defaults.

## Context Files

These markdown files customize Byte's behavior. In global mode, they live in `~/.byte/workspace/`. In local mode, Byte reads them from the current directory.

| File | Purpose |
|------|---------|
| `AGENTS.md` | Project instructions, goals, and constraints |
| `IDENTITY.md` | Personality and conversational style |
| `USER.md` | User-specific preferences and context |
| `TOOLS.md` | Guidance on how tools should be used |

Files are optional. Missing files are silently skipped. Each file is capped at 20,000 characters in the system prompt, with a total cap of 150,000 characters across all context.

## Sessions

Sessions persist conversation history across invocations.

- **TUI mode**: Creates a new persisted session by default.
- **Print mode**: Uses an in-memory session by default (no persistence).
- `--resume`: Resume the most recent session, or a specific one by ID.
- `--memory`: Force an in-memory session (no persistence).
- `--resume` and `--memory` cannot be combined.

Sessions are stored in `~/.byte/sessions/cli/` regardless of workspace mode.

## Development

```bash
npm run dev                              # Launch TUI via tsx
npm run dev -- "list files"              # One-shot via tsx
npm run dev -- --local                   # Local workspace via tsx
npm run dev -- --list-models             # List models via tsx
npm run build                            # Compile TypeScript to dist/
```
