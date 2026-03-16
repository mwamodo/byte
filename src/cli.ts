#!/usr/bin/env node

import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { InteractiveMode, runPrintMode } from "@mariozechner/pi-coding-agent";

import { loadCliConfig, loadMultiAgentGatewayConfig, printHelp, PROJECT_ROOT } from "./config.js";
import { formatError } from "./render.js";
import { openAgentSession } from "./agent-session.js";
import { ensureRuntimeDirs, initializeRuntime } from "./runtime.js";
import { createSessionManager, printModels } from "./session.js";
import { createUnifiedGatewayRuntime } from "./startup.js";

async function startGateway(): Promise<void> {
    const { initializeAgents } = await import("./agents.js");

    const config = loadMultiAgentGatewayConfig();
    if (config.telegramAccounts.length === 0) {
        throw new Error("No Telegram accounts are configured. Add channels.telegram.accounts to use --gateway.");
    }
    ensureRuntimeDirs();

    const agentRuntimes = await initializeAgents(config.agents);
    const gatewayRuntime = createUnifiedGatewayRuntime(config, agentRuntimes, {
        enabledChannels: ["telegram"],
        logger: console,
    });

    const shutdown = async (signal: string): Promise<void> => {
        console.log(`[gateway] shutting down (${signal})`);
        await gatewayRuntime.stop();
    };

    for (const signal of ["SIGINT", "SIGTERM"] as const) {
        process.once(signal, () => {
            void shutdown(signal);
        });
    }

    await gatewayRuntime.start();
}

async function startDesktopApp(): Promise<void> {
    const electronModule = await import("electron");
    const electronBinary = electronModule.default as unknown as string;
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const appEntrypoint = resolve(currentDir, "app.js");
    const child = spawn(electronBinary, [appEntrypoint], {
        stdio: "inherit",
    });

    await new Promise<void>((resolvePromise, reject) => {
        child.once("error", reject);
        child.once("exit", (code) => {
            if (code && code !== 0) {
                reject(new Error(`Electron exited with code ${code}.`));
                return;
            }
            resolvePromise();
        });
    });
}

async function main(): Promise<void> {
    if (process.argv.includes("--app")) {
        await startDesktopApp();
        return;
    }

    if (process.argv.includes("--gateway")) {
        await startGateway();
        return;
    }

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
