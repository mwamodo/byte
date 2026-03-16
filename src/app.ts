import { app, type BrowserWindow } from "electron";
import process from "node:process";

import { initializeAgents } from "./agents.js";
import { loadMultiAgentGatewayConfig } from "./config.js";
import { startDesktopMain } from "./desktop/main.js";
import { createChatWindow, createMascotWindow } from "./desktop/window.js";
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

    let mascotWindow: BrowserWindow | undefined;
    if (desktopAccount) {
        const desktopChannel = gatewayRuntime.gateway.getDesktopChannel(desktopAccount.accountId);
        if (!desktopChannel) {
            throw new Error(`Desktop channel "${desktopAccount.accountId}" was not created.`);
        }

        const mascot = createMascotWindow({ position: desktopAccount.position });
        const chat = createChatWindow({ position: desktopAccount.position });

        function sendInitialState(window: BrowserWindow): void {
            if (desktopChannel!.modelName) {
                window.webContents.send("byte:agent-status", {
                    accountId: desktopAccount!.accountId,
                    model: desktopChannel!.modelName,
                    status: "ready",
                    type: "agent-status",
                });
            }
        }

        mascot.webContents.once("did-finish-load", () => sendInitialState(mascot));
        chat.webContents.once("did-finish-load", () => {
            sendInitialState(chat);
            chat.webContents.send("byte:visibility", {
                visible: chat.isVisible(),
            });
        });

        await startDesktopMain({
            account: desktopAccount,
            channel: desktopChannel,
            chatWindow: chat,
            mascotWindow: mascot,
        });
        mascotWindow = mascot;
    }

    app.on("window-all-closed", () => {
        // Keep the app alive for tray-driven reopen behavior.
    });

    app.on("activate", () => {
        if (mascotWindow && !mascotWindow.isVisible()) {
            mascotWindow.show();
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
