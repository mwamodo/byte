import { app, type BrowserWindow } from "electron";
import process from "node:process";

import { initializeAgents } from "./agents.js";
import { loadMultiAgentGatewayConfig } from "./config.js";
import { startDesktopMain } from "./desktop/main.js";
import { createDesktopWindow } from "./desktop/window.js";
import { ensureRuntimeDirs } from "./runtime.js";
import {
    createUnifiedGatewayRuntime,
    resolvePrimaryDesktopAccount,
} from "./startup.js";

async function main(): Promise<void> {
    const config = loadMultiAgentGatewayConfig();
    const desktopAccount = resolvePrimaryDesktopAccount(config);

    ensureRuntimeDirs();
    const agentRuntimes = await initializeAgents(config.agents);
    const gatewayRuntime = createUnifiedGatewayRuntime(config, agentRuntimes, {
        logger: console,
    });

    await app.whenReady();
    await gatewayRuntime.start();

    let allowQuit = false;
    let shutdownPromise: Promise<void> | undefined;
    const shutdown = async (signal: string): Promise<void> => {
        if (!shutdownPromise) {
            console.log(`[app] shutting down (${signal})`);
            shutdownPromise = gatewayRuntime.stop();
        }

        await shutdownPromise;

        if (!allowQuit) {
            allowQuit = true;
            app.quit();
        }
    };

    for (const signal of ["SIGINT", "SIGTERM"] as const) {
        process.once(signal, () => {
            void shutdown(signal);
        });
    }

    let window: BrowserWindow | undefined;
    if (desktopAccount) {
        const desktopChannel = gatewayRuntime.gateway.getDesktopChannel(desktopAccount.accountId);
        if (!desktopChannel) {
            throw new Error(`Desktop channel "${desktopAccount.accountId}" was not created.`);
        }

        const desktopWindow = createDesktopWindow({ position: desktopAccount.position });
        desktopWindow.webContents.once("did-finish-load", () => {
            if (desktopChannel.modelName) {
                desktopWindow.webContents.send("byte:agent-status", {
                    accountId: desktopAccount.accountId,
                    model: desktopChannel.modelName,
                    status: "ready",
                    type: "agent-status",
                });
            }
            desktopWindow.webContents.send("byte:visibility", {
                visible: desktopWindow.isVisible(),
            });
        });

        await startDesktopMain({
            account: desktopAccount,
            channel: desktopChannel,
            window: desktopWindow,
        });
        window = desktopWindow;
    }

    app.on("window-all-closed", () => {
        // Keep the app alive for tray-driven reopen behavior.
    });

    app.on("activate", () => {
        if (window && !window.isVisible()) {
            window.show();
        }
    });

    app.on("before-quit", (event) => {
        if (allowQuit) {
            return;
        }

        event.preventDefault();
        void shutdown("app-quit");
    });
}

void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    app.exit(1);
});
