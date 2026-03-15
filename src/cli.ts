#!/usr/bin/env node

import { InteractiveMode, runPrintMode } from "@mariozechner/pi-coding-agent";

import { loadCliConfig, printHelp, PROJECT_ROOT } from "./config.js";
import { formatError } from "./render.js";
import { openAgentSession } from "./agent-session.js";
import { ensureRuntimeDirs, initializeRuntime } from "./runtime.js";
import { createSessionManager, printModels } from "./session.js";

async function main(): Promise<void> {
    const config = loadCliConfig();

    if (config.help) {
        printHelp();
        return;
    }

    const localMode = config.workspaceMode === "local";
    ensureRuntimeDirs(localMode);

    const workspaceDir = localMode ? PROJECT_ROOT : undefined;

    const runtime = initializeRuntime({
        apiKey: config.apiKey,
        apiKeys: config.apiKeys,
        modelId: config.modelId,
        promptMode: config.promptMode,
        provider: config.provider,
        workspaceDir,
    });
    const resolvedRuntime = await runtime;

    if (config.listModels) {
        printModels(resolvedRuntime.modelRegistry);
        return;
    }

    const sessionManager = await createSessionManager(config.sessionTarget);

    const { session, modelFallbackMessage } = await openAgentSession({
        runtime: resolvedRuntime,
        thinkingLevel: config.thinkingLevel,
        sessionManager,
    });

    try {
        if (config.mode === "tui") {
            const tui = new InteractiveMode(session, { modelFallbackMessage });
            await tui.run();
        } else {
            if (!session.model) {
                throw new Error(
                    [
                        "No models are available yet.",
                        "Run `byte` with no prompt and use /login or /model,",
                        "or set API keys in ~/.byte/byte.config.json.",
                    ].join(" "),
                );
            }

            await runPrintMode(session, {
                mode: "text",
                initialMessage: config.prompt,
            });
        }
    } finally {
        session.dispose();
    }
}

await main().catch((error: unknown) => {
    console.error(formatError(error));
    console.error("Run `byte --help` for startup options.");
    process.exitCode = 1;
});
