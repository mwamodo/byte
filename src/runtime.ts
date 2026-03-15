import { mkdirSync } from "node:fs";

import {
    AuthStorage,
    createCodingTools,
    ModelRegistry,
    type CreateAgentSessionOptions,
} from "@mariozechner/pi-coding-agent";

import { AGENT_DIR, AUTH_PATH, CLI_SESSIONS_DIR, MODELS_PATH, WORKSPACE_DIR } from "./config.js";
import type { PromptMode } from "./prompt.js";
import { createPromptResourceLoader } from "./resource-loader.js";
import { resolveModel } from "./session.js";
import { ensureWorkspaceStructure, seedWorkspaceFiles } from "./workspace.js";

export type RuntimeBootstrapOptions = {
    apiKey?: string;
    apiKeys?: Record<string, string>;
    modelId?: string;
    promptMode?: PromptMode;
    provider?: string;
    workspaceDir?: string;
};

export type SharedSessionFactoryInputs = Pick<
    CreateAgentSessionOptions,
    | "agentDir"
    | "authStorage"
    | "cwd"
    | "model"
    | "modelRegistry"
    | "resourceLoader"
    | "tools"
>;

export type RuntimeContext = {
    authStorage: AuthStorage;
    modelRegistry: ModelRegistry;
    selectedModel: SharedSessionFactoryInputs["model"];
    sessionFactoryInputs: SharedSessionFactoryInputs;
};

export function ensureRuntimeDirs(localMode?: boolean): void {
    mkdirSync(AGENT_DIR, { recursive: true, mode: 0o700 });
    mkdirSync(CLI_SESSIONS_DIR, { recursive: true });
    if (!localMode) {
        ensureWorkspaceStructure();
        seedWorkspaceFiles();
    }
}

export function ensureAgentDirs(workspaceDir: string, sessionsDir: string): void {
    mkdirSync(sessionsDir, { recursive: true });
    ensureWorkspaceStructure(workspaceDir);
    seedWorkspaceFiles(workspaceDir);
}

export async function initializeRuntime(
    options: RuntimeBootstrapOptions,
): Promise<RuntimeContext> {
    const authStorage = AuthStorage.create(AUTH_PATH);
    const modelRegistry = new ModelRegistry(authStorage, MODELS_PATH);

    if (options.apiKeys) {
        for (const [provider, key] of Object.entries(options.apiKeys)) {
            authStorage.setRuntimeApiKey(provider, key);
        }
    }

    if (options.apiKey && options.provider) {
        authStorage.setRuntimeApiKey(options.provider, options.apiKey);
    }

    const workspaceDir = options.workspaceDir ?? WORKSPACE_DIR;

    const selectedModel =
        options.provider === undefined
            ? undefined
            : resolveModel(options.provider, options.modelId, modelRegistry);
    const tools = createCodingTools(workspaceDir);
    const resourceLoader = await createPromptResourceLoader({
        agentDir: AGENT_DIR,
        promptMode: options.promptMode ?? "full",
        tools,
        workspaceDir,
    });

    return {
        authStorage,
        modelRegistry,
        selectedModel,
        sessionFactoryInputs: {
            agentDir: AGENT_DIR,
            authStorage,
            cwd: workspaceDir,
            model: selectedModel,
            modelRegistry,
            resourceLoader,
            tools,
        },
    };
}
