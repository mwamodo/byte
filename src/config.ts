import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";

import type { PromptMode } from "./prompt.js";

export type SessionTarget =
    | { kind: "new" }
    | { kind: "memory" }
    | { kind: "resume-recent" }
    | { kind: "resume-id"; sessionId: string };
export type ThinkingLevel = "off" | "low" | "medium" | "high";
export type ToolSummaryMode = "off" | "compact";

type RuntimeTelegramConfigFile = {
    allowFrom?: number[];
    botToken?: string;
    replyDebounceMs?: number;
};

type DesktopAccountConfig = {
    hotkey?: string;
    position?: string;
};

export type DesktopAccountPosition =
    | "bottom-right"
    | "bottom-left"
    | "top-right"
    | "top-left";

type AgentDefinition = {
    id: string;
    workspace?: string;
    provider?: string;
    model?: string;
    thinking?: string;
    toolSummaries?: string;
    promptMode?: string;
    apiKeys?: Record<string, string>;
};
type BindingDefinition = { agentId: string; match: { channel: string; accountId: string } };
type TelegramAccountConfig = { botToken: string; allowFrom?: number[]; replyDebounceMs?: number };

type RuntimeConfigFile = {
    apiKeys?: Record<string, string>;
    cli?: { workspace?: string };
    model?: string;
    promptMode?: string;
    provider?: string;
    thinking?: string;
    toolSummaries?: string;
    telegram?: RuntimeTelegramConfigFile;
    agents?: { list: AgentDefinition[] };
    bindings?: BindingDefinition[];
    channels?: {
        telegram?: { accounts: Record<string, TelegramAccountConfig> };
        desktop?: { accounts: Record<string, DesktopAccountConfig> };
    };
};

export type CliMode = "tui" | "print";

export type WorkspaceMode = "local" | "global";

export type CliConfig = {
    apiKey: string | undefined;
    apiKeys: Record<string, string> | undefined;
    help: boolean;
    listModels: boolean;
    mode: CliMode;
    modelId: string | undefined;
    prompt: string | undefined;
    promptMode: PromptMode;
    provider: string | undefined;
    sessionTarget: SessionTarget;
    thinkingLevel: ThinkingLevel | undefined;
    toolSummaryMode: ToolSummaryMode;
    workspaceMode: WorkspaceMode;
};

export type GatewayConfig = {
    allowFrom: number[];
    apiKeys: Record<string, string> | undefined;
    botToken: string;
    modelId: string | undefined;
    promptMode: PromptMode;
    provider: string | undefined;
    replyDebounceMs: number;
    thinkingLevel: ThinkingLevel | undefined;
};

export type ResolvedAgent = {
    id: string;
    workspace: string;
    sessionsDir: string;
    provider: string | undefined;
    modelId: string | undefined;
    promptMode: PromptMode;
    thinkingLevel: ThinkingLevel | undefined;
    toolSummaryMode: ToolSummaryMode;
    apiKeys: Record<string, string> | undefined;
};
export type ResolvedTelegramAccount = {
    accountId: string;
    botToken: string;
    allowFrom: number[];
    replyDebounceMs: number;
};
export type ResolvedDesktopAccount = {
    accountId: string;
    hotkey: string;
    position: DesktopAccountPosition;
};
export type ResolvedBinding = { agentId: string; channel: string; accountId: string };

export type MultiAgentGatewayConfig = {
    agents: ResolvedAgent[];
    telegramAccounts: ResolvedTelegramAccount[];
    desktopAccounts: ResolvedDesktopAccount[];
    bindings: ResolvedBinding[];
};

const TOOL_SUMMARY_MODES: ToolSummaryMode[] = ["off", "compact"];

export const PROJECT_ROOT = process.cwd();
export const RUNTIME_DIR = resolve(homedir(), ".byte");
export const CONFIG_PATH = resolve(RUNTIME_DIR, "byte.config.json");
export const AGENT_DIR = resolve(RUNTIME_DIR, "agent");
export const AUTH_PATH = resolve(AGENT_DIR, "auth.json");
export const MODELS_PATH = resolve(AGENT_DIR, "models.json");
export const WORKSPACE_DIR = resolve(RUNTIME_DIR, "workspace");
export const SESSIONS_DIR = resolve(RUNTIME_DIR, "sessions");
export const CLI_SESSIONS_DIR = resolve(SESSIONS_DIR, "cli");
export const TELEGRAM_SESSION_INDEX_PATH = resolve(
    RUNTIME_DIR,
    "telegram-session-index.json",
);
export const DEFAULT_DESKTOP_HOTKEY = "CommandOrControl+Shift+Space";
export const DEFAULT_DESKTOP_POSITION: DesktopAccountPosition = "bottom-right";

function injectResumeSentinel(): void {
    const idx = process.argv.indexOf("--resume");
    if (idx === -1) return;
    const next = process.argv[idx + 1];
    if (next === undefined || next.startsWith("-")) {
        process.argv.splice(idx + 1, 0, "__latest__");
    }
}

export function loadCliConfig(): CliConfig {
    injectResumeSentinel();
    const runtimeConfig = loadRuntimeConfig();
    const { values, positionals } = parseArgs({
        allowPositionals: true,
        options: {
            help: { type: "boolean", short: "h" },
            "api-key": { type: "string" },
            prompt: { type: "string", short: "p" },
            interactive: { type: "boolean" },
            provider: { type: "string" },
            model: { type: "string" },
            "prompt-mode": { type: "string" },
            thinking: { type: "string" },
            resume: { type: "string" },
            memory: { type: "boolean" },
            "tool-summaries": { type: "string" },
            local: { type: "boolean" },
            "list-models": { type: "boolean" },
            app: { type: "boolean" },
            gateway: { type: "boolean" },
        },
    });

    const provider = values.provider ?? runtimeConfig.provider;
    const modelId = values.model ?? runtimeConfig.model;
    const apiKey = values["api-key"];

    validateConfiguredModel(provider, modelId);

    if (apiKey && !provider) {
        throw new Error("Provide --provider when using --api-key.");
    }

    const prompt = resolvePrompt(values.prompt, positionals);
    const mode: CliMode = prompt === undefined ? "tui" : "print";

    if (values.interactive && prompt !== undefined) {
        throw new Error("Cannot combine --interactive with a prompt. Use one or the other.");
    }

    const resumeValue = values.resume as string | undefined;
    const memoryFlag = values.memory as boolean | undefined;

    if (resumeValue !== undefined && memoryFlag) {
        throw new Error("Cannot combine --resume with --memory.");
    }

    let sessionTarget: SessionTarget;
    if (memoryFlag) {
        sessionTarget = { kind: "memory" };
    } else if (resumeValue !== undefined) {
        sessionTarget = resumeValue === "__latest__"
            ? { kind: "resume-recent" }
            : { kind: "resume-id", sessionId: resumeValue };
    } else {
        sessionTarget = mode === "print" ? { kind: "memory" } : { kind: "new" };
    }

    const workspaceMode: WorkspaceMode = values.local
        ? "local"
        : resolveWorkspaceMode(runtimeConfig.cli?.workspace);

    return {
        apiKey,
        apiKeys: runtimeConfig.apiKeys,
        help: values.help ?? false,
        listModels: values["list-models"] ?? false,
        mode,
        modelId,
        prompt,
        promptMode: resolvePromptMode(values["prompt-mode"] ?? runtimeConfig.promptMode),
        provider,
        sessionTarget,
        thinkingLevel: resolveThinkingLevel(values.thinking ?? runtimeConfig.thinking),
        toolSummaryMode: resolveToolSummaryMode(
            values["tool-summaries"] ?? runtimeConfig.toolSummaries,
        ),
        workspaceMode,
    };
}

export function loadGatewayConfig(): GatewayConfig {
    const runtimeConfig = loadRuntimeConfig();
    const provider = runtimeConfig.provider;
    const modelId = runtimeConfig.model;
    const botToken = runtimeConfig.telegram?.botToken;

    validateConfiguredModel(provider, modelId);

    return {
        allowFrom: runtimeConfig.telegram?.allowFrom ?? [],
        apiKeys: runtimeConfig.apiKeys,
        promptMode: resolvePromptMode(runtimeConfig.promptMode),
        botToken: readRequiredString(
            botToken,
            'Runtime config key "telegram.botToken"',
        ),
        modelId,
        provider,
        replyDebounceMs: resolveInteger(
            runtimeConfig.telegram?.replyDebounceMs,
            'Runtime config key "telegram.replyDebounceMs"',
            { minimum: 0 },
            200,
        ),
        thinkingLevel: resolveThinkingLevel(runtimeConfig.thinking),
    };
}

export function loadMultiAgentGatewayConfig(): MultiAgentGatewayConfig {
    const runtimeConfig = loadRuntimeConfig();
    const provider = runtimeConfig.provider;
    const modelId = runtimeConfig.model;

    const promptMode = resolvePromptMode(runtimeConfig.promptMode);
    const thinkingLevel = resolveThinkingLevel(runtimeConfig.thinking);
    const toolSummaryMode = resolveToolSummaryMode(runtimeConfig.toolSummaries);
    const apiKeys = runtimeConfig.apiKeys;

    if (!runtimeConfig.agents) {
        validateConfiguredModel(provider, modelId);

        const agent: ResolvedAgent = {
            id: "byte",
            workspace: WORKSPACE_DIR,
            sessionsDir: SESSIONS_DIR,
            provider,
            modelId,
            promptMode,
            thinkingLevel,
            toolSummaryMode,
            apiKeys,
        };

        const telegramAccounts: ResolvedTelegramAccount[] = [];
        const desktopAccounts: ResolvedDesktopAccount[] = [
            {
                accountId: "default",
                hotkey: DEFAULT_DESKTOP_HOTKEY,
                position: DEFAULT_DESKTOP_POSITION,
            },
        ];
        const bindings: ResolvedBinding[] = [
            {
                agentId: "byte",
                channel: "desktop",
                accountId: "default",
            },
        ];

        if (runtimeConfig.telegram?.botToken) {
            telegramAccounts.push({
                accountId: "default",
                botToken: readRequiredString(
                    runtimeConfig.telegram.botToken,
                    'Runtime config key "telegram.botToken"',
                ),
                allowFrom: runtimeConfig.telegram.allowFrom ?? [],
                replyDebounceMs: resolveInteger(
                    runtimeConfig.telegram.replyDebounceMs,
                    'Runtime config key "telegram.replyDebounceMs"',
                    { minimum: 0 },
                    200,
                ),
            });
            bindings.push({
                agentId: "byte",
                channel: "telegram",
                accountId: "default",
            });
        }

        return { agents: [agent], telegramAccounts, desktopAccounts, bindings };
    }

    // Multi-agent mode
    const agentList = runtimeConfig.agents.list;
    if (!Array.isArray(agentList) || agentList.length === 0) {
        throw new Error('Runtime config key "agents.list" must be a non-empty array.');
    }

    const agents: ResolvedAgent[] = agentList.map((def) => {
        if (!def.id || typeof def.id !== "string") {
            throw new Error('Each agent in "agents.list" must have a string "id".');
        }
        const workspace = def.workspace
            ? resolve(def.workspace.replace(/^~/, homedir()))
            : def.id === "byte"
              ? WORKSPACE_DIR
              : resolve(RUNTIME_DIR, `workspace-${def.id}`);
        const sessionsDir = resolve(RUNTIME_DIR, "sessions", def.id);

        const agentProvider = def.provider ?? provider;
        const agentModelId = def.model ?? modelId;
        validateConfiguredModel(agentProvider, agentModelId);

        return {
            id: def.id,
            workspace,
            sessionsDir,
            provider: agentProvider,
            modelId: agentModelId,
            promptMode: resolvePromptMode(def.promptMode ?? runtimeConfig.promptMode),
            thinkingLevel: resolveThinkingLevel(def.thinking ?? runtimeConfig.thinking),
            toolSummaryMode: resolveToolSummaryMode(def.toolSummaries ?? runtimeConfig.toolSummaries),
            apiKeys: def.apiKeys ?? apiKeys,
        };
    });

    const seenAgentIds = new Set<string>();
    for (const agent of agents) {
        if (seenAgentIds.has(agent.id)) {
            throw new Error(`Duplicate agent id "${agent.id}".`);
        }
        seenAgentIds.add(agent.id);
    }

    const telegramAccountsRaw = runtimeConfig.channels?.telegram?.accounts ?? {};
    const desktopAccountsRaw = runtimeConfig.channels?.desktop?.accounts ?? {};

    const telegramAccounts: ResolvedTelegramAccount[] = Object.entries(telegramAccountsRaw).map(
        ([accountId, acct]) => {
            if (!acct.botToken || typeof acct.botToken !== "string") {
                throw new Error(`Telegram account "${accountId}" must have a string "botToken".`);
            }
            return {
                accountId,
                botToken: acct.botToken,
                allowFrom: acct.allowFrom ?? [],
                replyDebounceMs: resolveInteger(
                    acct.replyDebounceMs,
                    `Telegram account "${accountId}" replyDebounceMs`,
                    { minimum: 0 },
                    200,
                ),
            };
        },
    );
    const desktopAccounts: ResolvedDesktopAccount[] = Object.entries(desktopAccountsRaw).map(
        ([accountId, acct]) => ({
            accountId,
            hotkey: acct.hotkey?.trim() || DEFAULT_DESKTOP_HOTKEY,
            position: resolveDesktopPosition(acct.position, accountId),
        }),
    );

    const bindings: ResolvedBinding[] = (runtimeConfig.bindings ?? []).map((b) => {
        if (!b.agentId || !b.match?.channel || !b.match?.accountId) {
            throw new Error("Each binding must have agentId, match.channel, and match.accountId.");
        }
        if (!seenAgentIds.has(b.agentId)) {
            throw new Error(`Binding references unknown agent "${b.agentId}".`);
        }
        if (b.match.channel === "telegram") {
            const accountExists = telegramAccounts.some((a) => a.accountId === b.match.accountId);
            if (!accountExists) {
                throw new Error(`Binding references unknown telegram account "${b.match.accountId}".`);
            }
        } else if (b.match.channel === "desktop") {
            const accountExists = desktopAccounts.some((a) => a.accountId === b.match.accountId);
            if (!accountExists) {
                throw new Error(`Binding references unknown desktop account "${b.match.accountId}".`);
            }
        } else {
            throw new Error(`Unsupported binding channel "${b.match.channel}".`);
        }
        return { agentId: b.agentId, channel: b.match.channel, accountId: b.match.accountId };
    });

    return { agents, telegramAccounts, desktopAccounts, bindings };
}

export function printHelp(): void {
    console.log(`byte — AI desktop assistant

Usage:
  byte                                        Launch the TUI (interactive mode)
  byte [prompt text]                          Run prompt and print final response
  byte --prompt "List the files"              Same as above
  byte --list-models                          Print available models and exit

No prompt launches the TUI. A prompt runs one shot and prints only the final
assistant text to stdout.

Development:
  npm run dev
  npm run dev -- [prompt text]
  npm run dev -- --prompt "List the files in this directory"
  npm run dev -- --list-models

Options:
  --provider <name>   Provider name, for example openai or anthropic
  --model <id>        Explicit model id, used with --provider
  --api-key <key>     Runtime API key override for --provider (not persisted)
  --prompt-mode       full | minimal | none
  --thinking <level>  off | low | medium | high
  --resume [id]       Resume latest session, or a specific session by ID
  --memory            Use in-memory session (no persistence)
  --local             Use current directory as workspace (no global workspace fallback)
  --tool-summaries    off | compact
  --interactive       Compatibility alias for TUI mode; cannot be combined with a prompt
  --list-models       Print currently available models and exit
  --app               Launch the Electron desktop app
  --gateway           Start the headless Telegram gateway
  -h, --help          Show this help text

Runtime config:
  ${CONFIG_PATH}
  Supports JSON keys: provider, model, promptMode, thinking, toolSummaries, apiKeys,
  cli.workspace ("local" | "global"), agents, channels, bindings`);
}

function loadRuntimeConfig(): RuntimeConfigFile {
    let rawConfig: string;

    try {
        rawConfig = readFileSync(CONFIG_PATH, "utf8");
    } catch (error) {
        if (isMissingFileError(error)) {
            return {};
        }

        throw new Error(`Could not read runtime config at ${CONFIG_PATH}: ${formatError(error)}`, {
            cause: error,
        });
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(rawConfig);
    } catch (error) {
        throw new Error(`Could not parse JSON in ${CONFIG_PATH}: ${formatError(error)}`, {
            cause: error,
        });
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error(`Runtime config at ${CONFIG_PATH} must contain a JSON object.`);
    }

    const telegram = readOptionalObject(parsed, "telegram");
    const apiKeys = readOptionalStringRecord(parsed, "apiKeys");
    const cliRaw = readOptionalObject(parsed, "cli");
    const cliWorkspace = cliRaw !== undefined ? readOptionalString(cliRaw, "workspace") : undefined;

    // Parse multi-agent fields
    const agentsRaw = readOptionalObject(parsed, "agents");
    const bindingsRaw = (parsed as Record<string, unknown>).bindings;
    const channelsRaw = readOptionalObject(parsed, "channels");

    let agents: RuntimeConfigFile["agents"];
    if (agentsRaw !== undefined) {
        const list = agentsRaw.list;
        if (!Array.isArray(list)) {
            throw new Error(`Runtime config key "agents.list" in ${CONFIG_PATH} must be an array.`);
        }
        agents = {
            list: (list as Record<string, unknown>[]).map((entry) => ({
                id: entry.id as string,
                workspace: entry.workspace as string | undefined,
                provider: readOptionalString(entry, "provider"),
                model: readOptionalString(entry, "model"),
                thinking: readOptionalString(entry, "thinking"),
                toolSummaries: readOptionalString(entry, "toolSummaries"),
                promptMode: readOptionalString(entry, "promptMode"),
                apiKeys: readOptionalStringRecord(entry, "apiKeys"),
            })),
        };
    }

    let bindings: BindingDefinition[] | undefined;
    if (bindingsRaw !== undefined) {
        if (!Array.isArray(bindingsRaw)) {
            throw new Error(`Runtime config key "bindings" in ${CONFIG_PATH} must be an array.`);
        }
        bindings = bindingsRaw as BindingDefinition[];
    }

    let channels: RuntimeConfigFile["channels"];
    if (channelsRaw !== undefined) {
        const telegramChannelRaw = readOptionalObject(channelsRaw, "telegram");
        const desktopChannelRaw = readOptionalObject(channelsRaw, "desktop");

        if (telegramChannelRaw !== undefined || desktopChannelRaw !== undefined) {
            channels = {};
            if (telegramChannelRaw !== undefined) {
                const accountsRaw = readOptionalObject(telegramChannelRaw, "accounts");
                if (accountsRaw !== undefined) {
                    channels.telegram = { accounts: accountsRaw as Record<string, TelegramAccountConfig> };
                }
            }
            if (desktopChannelRaw !== undefined) {
                const accountsRaw = readOptionalObject(desktopChannelRaw, "accounts");
                if (accountsRaw !== undefined) {
                    channels.desktop = { accounts: accountsRaw as Record<string, DesktopAccountConfig> };
                }
            }
        }
    }

    return {
        agents,
        apiKeys,
        bindings,
        channels,
        cli: cliWorkspace !== undefined ? { workspace: cliWorkspace } : undefined,
        model: readOptionalString(parsed, "model"),
        promptMode: readOptionalString(parsed, "promptMode"),
        provider: readOptionalString(parsed, "provider"),
        thinking: readOptionalString(parsed, "thinking"),
        toolSummaries: readOptionalString(parsed, "toolSummaries"),
        telegram:
            telegram === undefined
                ? undefined
                : {
                      allowFrom: readOptionalNumberArray(telegram, "allowFrom"),
                      botToken: readOptionalString(telegram, "botToken"),
                      replyDebounceMs: readOptionalNumber(telegram, "replyDebounceMs"),
                  },
    };
}

function resolvePrompt(
    flagPrompt: string | undefined,
    positionalArgs: string[],
): string | undefined {
    if (flagPrompt !== undefined) {
        return validatePrompt(flagPrompt, "--prompt");
    }

    if (positionalArgs.length > 0) {
        return validatePrompt(positionalArgs.join(" "), "positional prompt");
    }

    return undefined;
}

function validatePrompt(prompt: string, source: string): string {
    if (prompt.trim().length === 0) {
        throw new Error(`Prompt must not be empty when provided via ${source}.`);
    }

    return prompt;
}

function validateConfiguredModel(
    provider: string | undefined,
    modelId: string | undefined,
): void {
    if (!provider && modelId) {
        throw new Error(
            "Provide --provider together with --model when selecting a model explicitly.",
        );
    }
}

function resolveThinkingLevel(rawLevel: string | undefined): ThinkingLevel | undefined {
    switch (rawLevel) {
        case undefined:
        case "off":
        case "low":
        case "medium":
        case "high":
            return rawLevel;
        default:
            throw new Error(
                `Unsupported thinking level "${rawLevel}". Use off, low, medium, or high.`,
            );
    }
}

function resolvePromptMode(rawMode: string | undefined): PromptMode {
    switch (rawMode) {
        case undefined:
        case "full":
        case "minimal":
        case "none":
            return rawMode ?? "full";
        default:
            throw new Error(
                `Unsupported prompt mode "${rawMode}". Use full, minimal, or none.`,
            );
    }
}

function resolveToolSummaryMode(rawMode: string | undefined): ToolSummaryMode {
    switch (rawMode) {
        case undefined:
        case "compact":
            return "compact";
        case "off":
            return "off";
        default:
            throw new Error(
                `Unsupported tool summary mode "${rawMode}". Use ${TOOL_SUMMARY_MODES.join(" or ")}.`,
            );
    }
}

function resolveWorkspaceMode(rawMode: string | undefined): WorkspaceMode {
    switch (rawMode) {
        case undefined:
        case "global":
            return "global";
        case "local":
            return "local";
        default:
            throw new Error(
                `Unsupported workspace mode "${rawMode}". Use local or global.`,
            );
    }
}

function readRequiredString(
    value: string | undefined,
    name: string,
): string {
    if (!value || value.trim().length === 0) {
        throw new Error(`${name} is required.`);
    }
    return value;
}

function resolveInteger(
    value: number | string | undefined,
    name: string,
    bounds: { minimum: number },
    defaultValue: number,
): number {
    if (value === undefined) {
        return defaultValue;
    }

    const parsed =
        typeof value === "number" ? value : Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed < bounds.minimum) {
        throw new Error(`${name} must be an integer greater than or equal to ${bounds.minimum}.`);
    }

    return parsed;
}

function resolveDesktopPosition(
    rawPosition: string | undefined,
    accountId: string,
): DesktopAccountPosition {
    switch (rawPosition) {
        case undefined:
        case "":
            return DEFAULT_DESKTOP_POSITION;
        case "bottom-right":
        case "bottom-left":
        case "top-right":
        case "top-left":
            return rawPosition;
        default:
            throw new Error(
                `Desktop account "${accountId}" position must be one of top-left, top-right, bottom-left, or bottom-right.`,
            );
    }
}

function readOptionalString(source: object, key: string): string | undefined {
    const value = (source as Record<string, unknown>)[key];

    if (value === undefined) {
        return undefined;
    }

    if (typeof value !== "string") {
        throw new Error(`Runtime config key "${key}" in ${CONFIG_PATH} must be a string.`);
    }

    return value;
}

function readOptionalNumber(source: object, key: string): number | undefined {
    const value = (source as Record<string, unknown>)[key];

    if (value === undefined) {
        return undefined;
    }

    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`Runtime config key "${key}" in ${CONFIG_PATH} must be a number.`);
    }

    return value;
}

function readOptionalNumberArray(source: object, key: string): number[] | undefined {
    const value = (source as Record<string, unknown>)[key];

    if (value === undefined) {
        return undefined;
    }

    if (!Array.isArray(value)) {
        throw new Error(`Runtime config key "${key}" in ${CONFIG_PATH} must be an array.`);
    }

    for (let i = 0; i < value.length; i++) {
        const entry = value[i];
        if (typeof entry !== "number" || !Number.isInteger(entry) || entry <= 0) {
            throw new Error(
                `Runtime config key "${key}[${i}]" in ${CONFIG_PATH} must be a positive integer.`,
            );
        }
    }

    return value as number[];
}

function readOptionalObject(source: object, key: string): Record<string, unknown> | undefined {
    const value = (source as Record<string, unknown>)[key];

    if (value === undefined) {
        return undefined;
    }

    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`Runtime config key "${key}" in ${CONFIG_PATH} must be an object.`);
    }

    return value as Record<string, unknown>;
}

function readOptionalStringRecord(source: object, key: string): Record<string, string> | undefined {
    const obj = readOptionalObject(source, key);
    if (obj === undefined) {
        return undefined;
    }

    for (const [k, v] of Object.entries(obj)) {
        if (typeof v !== "string") {
            throw new Error(`Runtime config key "${key}.${k}" in ${CONFIG_PATH} must be a string.`);
        }
        if (v.trim().length === 0) {
            throw new Error(`Runtime config key "${key}.${k}" in ${CONFIG_PATH} must not be empty.`);
        }
    }

    return obj as Record<string, string>;
}

function isMissingFileError(error: unknown): boolean {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function formatError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
