# Phase 1 CLI Foundation for Byte

## Summary
- Objective: turn `byte` into a working daily-driver terminal assistant by porting the proven CLI/runtime pieces from `pi-claw` into this repo with minimal behavioral drift.
- Strategy: build the Node/TypeScript CLI stack first, keep the runtime directory and prompt ownership model from `pi-claw`, and make the config shape future-ready for desktop/Telegram without implementing those channels yet.
- Done when: `byte` runs in TUI mode with no prompt, runs one-shot print mode with a prompt, supports `/login` and `/model`, persists CLI sessions under `~/.byte/`, and exposes a real `byte` bin entry after build/install.

## Scope
- In scope: package scaffold, CLI entrypoint, runtime bootstrap, prompt builder, workspace seeding, session handling, config loading, help text, model listing, tests, and phase-appropriate docs.
- In scope: parse future `agents` / `channels` / `bindings` keys now so the config file shape is stable from day one.
- Out of scope: Telegram transport, Electron app, desktop context injection, streaming UI work, background services, and actual multi-agent startup flows.

## Implementation Plan
1. Create the repository scaffold.
- Add `package.json` with `type: "module"`, `name: "byte"`, `bin.byte = "./dist/cli.js"`, and Node `>=20.6.0`.
- Add scripts matching the `pi-claw` model: `dev`, `build`, `prepare`, `lint`, `format`, `start`, and `test`.
- Add `tsconfig.json`, `tsconfig.test.json`, and `eslint.config.mjs` by porting the `pi-claw` setup with ignores updated for `.byte`.
- Install CLI/runtime dependencies only: `@mariozechner/pi-ai` and `@mariozechner/pi-coding-agent`.
- Install dev dependencies matching the donor setup: TypeScript, tsx, eslint, `@eslint/js`, `typescript-eslint`, `globals`, Prettier, `eslint-config-prettier`, and `@types/node`.
- Do not install `grammy` in phase 1 because no gateway code will be imported or tested yet.

2. Port the runtime and prompt ownership modules.
- Create `src/render.ts`, `src/workspace.ts`, `src/prompt.ts`, `src/resource-loader.ts`, `src/runtime.ts`, `src/session.ts`, and `src/agent-session.ts` as direct ports from `pi-claw`.
- Rename all project strings from `pi-claw` to `byte`.
- Change all runtime paths from `~/.pi-claw/` to `~/.byte/`.
- Keep the phase 1 runtime layout to:
  - `~/.byte/byte.config.json`
  - `~/.byte/agent/auth.json`
  - `~/.byte/agent/models.json`
  - `~/.byte/workspace/`
  - `~/.byte/sessions/cli/`
- Keep prompt behavior identical to `pi-claw` for `full`, `minimal`, and `none`.
- Add the placeholder `desktopContext?: DesktopContext` parameter shape to `buildSystemPrompt()` now, but do not render or populate it in phase 1.

3. Implement a future-ready config layer.
- Create `src/config.ts` as the central config/CLI parser.
- Implement `loadCliConfig()` for phase 1 execution.
- Implement shared runtime config parsing for:
  - top-level CLI/runtime keys: `provider`, `model`, `promptMode`, `thinking`, `toolSummaries`, `apiKeys`
  - future keys: `agents`, `channels`, `bindings`
- Validate CLI-relevant keys fully now.
- Validate future sections structurally when present, but do not require them for CLI usage and do not start any channels from them.
- Keep the same precedence model as `pi-claw`: CLI flags override config; config overrides built-in defaults.
- Keep the same CLI session targeting semantics: default TUI uses a new persisted session; default print mode uses in-memory unless `--resume` is supplied.
- Recognize these CLI flags in phase 1: `--help`, `--prompt`, `--interactive`, `--provider`, `--model`, `--api-key`, `--prompt-mode`, `--thinking`, `--resume`, `--memory`, `--tool-summaries`, `--list-models`, `--app`, `--gateway`.
- Make `--app` and `--gateway` explicit stubs that print a clear “not implemented yet” message to `stderr` and exit non-zero without touching runtime startup.

4. Implement the CLI entrypoint.
- Create `src/cli.ts` as the only executable entrypoint for phase 1.
- Keep the execution model from `pi-claw`:
  - `byte` with no prompt launches `InteractiveMode`
  - `byte "prompt"` or `byte --prompt "..."` runs `runPrintMode`
  - `byte --list-models` prints models and exits
- Preserve the existing error model:
  - final assistant text only to `stdout` in print mode
  - startup/runtime errors to `stderr`
  - non-zero exit on failure
- Keep the no-model behavior aligned with `pi-claw`: TUI can be used to `/login` or `/model`; print mode fails fast with guidance if no model is available.

5. Seed Byte-specific workspace defaults.
- Seed `AGENTS.md`, `IDENTITY.md`, `USER.md`, and `TOOLS.md` under `~/.byte/workspace/` on first run.
- Keep `AGENTS.md`, `USER.md`, and `TOOLS.md` structurally similar to the donor project.
- Replace `IDENTITY.md` with Byte-specific baseline language that frames Byte as the user’s pragmatic personal coding/desktop assistant without embedding desktop-only promises that phase 1 cannot fulfill.
- Preserve existing files exactly if the user has already customized them.

6. Ship the real command path.
- Ensure `npm run build` emits `dist/cli.js`.
- Ensure the built file retains the `#!/usr/bin/env node` shebang behavior.
- Make `npm link` or package install expose a working `byte` command.
- Keep `npm run dev` mapped to `tsx src/cli.ts` for local development.

7. Add tests and minimal docs updates.
- Port `test/config.test.ts`, `test/prompt.test.ts`, and `test/workspace.test.ts` with path/name updates from `pi-claw` to `byte`.
- Add config tests for the new stub flags so `--app` and `--gateway` are covered.
- Add a CLI smoke test for help output naming (`byte`, `~/.byte/byte.config.json`) and for print-mode vs TUI-mode resolution.
- Update the repo README so phase 1 usage is concrete and runnable instead of roadmap-only at the top: install/build, runtime paths, key commands, and current non-goals.

## Public APIs / Interfaces / Types
- Runtime config file: `~/.byte/byte.config.json`.
- CLI public contract:
  - `byte`
  - `byte [prompt text]`
  - `byte --prompt "..."`.
  - `byte --list-models`
  - `byte --resume [id]`
  - `byte --memory`
  - `byte --app`
  - `byte --gateway`
- Type surface to expose internally:
  - `CliMode = "tui" | "print"`
  - `SessionTarget = { kind: "new" | "memory" | "resume-recent" } | { kind: "resume-id"; sessionId: string }`
  - `ThinkingLevel = "off" | "low" | "medium" | "high"`
  - `ToolSummaryMode = "off" | "compact"`
  - `PromptMode = "full" | "minimal" | "none"`
  - `CliConfig` including the resolved mode, prompt, provider/model overrides, session target, and stub entrypoint flags
  - future-ready config types for `agents`, `channels`, and `bindings` so later phases do not need a breaking config rewrite

## Test Cases And Scenarios
- `loadCliConfig()` resolves TUI mode with no prompt and print mode with positional or `--prompt` input.
- `--resume` with and without an ID resolves correctly; `--resume` and `--memory` conflict cleanly.
- `--interactive` combined with a prompt fails with a clear error.
- `--prompt-mode` resolves from config and can be overridden by flags.
- Invalid config values produce clear validation errors.
- Prompt generation includes workspace files, tool list, and runtime date/time in `full` mode, and strips those sections in `none` mode.
- Prompt bootstrap excludes ancestor/global `AGENTS.md` files and includes only the owned workspace files.
- Workspace seeding creates missing files and preserves existing files unchanged.
- `byte --help` prints Byte-specific usage and points to `~/.byte/byte.config.json`.
- `byte --app` and `byte --gateway` fail fast with the expected placeholder message.
- Manual acceptance:
  - `npm run dev` launches the TUI.
  - `/login` works in the TUI.
  - `/model` works in the TUI.
  - `npm run dev -- "list files in this directory"` prints only final assistant text.
  - `npm run build && npm link` exposes a working `byte` command.

## Acceptance Criteria
- The repo builds, lints, and runs tests cleanly.
- A fresh machine with no `~/.byte/` directory can run `byte`, get seeded workspace files, authenticate, select a model, and converse.
- Print mode behaves shell-cleanly and does not emit extra framing text to `stdout`.
- Existing behavior from `pi-claw` is preserved unless Byte-specific naming or phase-1 stubs require a deliberate change.
- The config file path and command name are fully Byte-branded across help text, errors, tests, and docs.

## Assumptions And Defaults
- Porting should favor behavioral parity with `pi-claw` over refactoring in phase 1.
- `minimal` prompt mode will remain behaviorally identical to `full` for now, matching the donor implementation.
- Future `agents` / `channels` / `bindings` config is parsed now for stability, but no non-CLI runtime is started in phase 1.
- `grammy`, Telegram tests, and gateway runtime modules are intentionally deferred to phase 2.
- The CLI uses the default workspace at `~/.byte/workspace/` and isolated CLI sessions at `~/.byte/sessions/cli/`.
- `--app` and `--gateway` are placeholders only in phase 1 and should fail clearly rather than silently no-op.
