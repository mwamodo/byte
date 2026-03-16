import { app, globalShortcut, ipcMain, type BrowserWindow, type IpcMain } from "electron";

import {
    DesktopChannel,
    DesktopChannelBusyError,
    type DesktopStreamEvent,
} from "../channels/desktop.js";
import type { ResolvedDesktopAccount } from "../config.js";
import type {
    ByteDesktopConfigPayload,
    BytePromptRequest,
    BytePromptResult,
} from "./ipc.js";
import { createDesktopTray } from "./tray.js";
import { resizeAnchoredWindow } from "./window.js";

type BrowserWindowLike = Pick<BrowserWindow, "hide" | "isDestroyed" | "isVisible" | "show" | "webContents">;
type IpcMainLike = Pick<IpcMain, "handle">;

export function registerDesktopIpcHandlers(options: {
    account: ResolvedDesktopAccount;
    channel: DesktopChannel;
    ipc: IpcMainLike;
    window: BrowserWindowLike;
}): void {
    const { account, channel, ipc, window } = options;

    ipc.handle("byte:prompt", async (_event, payload: BytePromptRequest): Promise<BytePromptResult> => {
        if (payload.accountId !== account.accountId) {
            return { error: `Unknown desktop account "${payload.accountId}".` };
        }

        try {
            await channel.prompt(payload.text);
            return { ok: true };
        } catch (error) {
            return {
                error:
                    error instanceof DesktopChannelBusyError
                        ? error.message
                        : formatError(error),
            };
        }
    });

    ipc.handle("byte:get-desktop-config", async (): Promise<ByteDesktopConfigPayload> => ({
        accountId: account.accountId,
    }));

    ipc.handle("byte:hide", async () => {
        window.hide();
        emitVisibility(window, false);
    });

    ipc.handle("byte:toggle", async () => {
        toggleWindow(window);
    });

    ipc.handle("byte:resize", async (_event, payload: { height: number; width: number }) => {
        if ("setBounds" in window) {
            resizeAnchoredWindow(window as BrowserWindow, {
                height: payload.height,
                position: account.position,
                width: payload.width,
            });
        }
    });

    channel.subscribe((event) => {
        forwardDesktopEvent(window, event);
    });
}

export function emitVisibility(window: BrowserWindowLike, visible: boolean): void {
    if (window.isDestroyed()) {
        return;
    }
    window.webContents.send("byte:visibility", { visible });
}

export function toggleWindow(window: BrowserWindowLike): void {
    if (window.isVisible()) {
        window.hide();
        emitVisibility(window, false);
        return;
    }

    window.show();
    emitVisibility(window, true);
}

export async function startDesktopMain(options: {
    account: ResolvedDesktopAccount;
    channel: DesktopChannel;
    window: BrowserWindow;
}): Promise<void> {
    const { account, channel, window } = options;

    registerDesktopIpcHandlers({
        account,
        channel,
        ipc: ipcMain,
        window,
    });

    const tray = createDesktopTray({
        model: channel.modelName,
        onQuit: () => app.quit(),
        onToggle: () => toggleWindow(window),
    });

    globalShortcut.register(account.hotkey, () => {
        toggleWindow(window);
    });

    window.on("show", () => emitVisibility(window, true));
    window.on("hide", () => emitVisibility(window, false));
    app.on("before-quit", () => {
        tray.destroy();
        globalShortcut.unregisterAll();
    });
}

function forwardDesktopEvent(window: BrowserWindowLike, event: DesktopStreamEvent): void {
    if (window.isDestroyed()) {
        return;
    }

    switch (event.type) {
        case "agent-status":
            window.webContents.send("byte:agent-status", event);
            return;
        case "message-start":
            window.webContents.send("byte:message-start", event);
            return;
        case "message-chunk":
            window.webContents.send("byte:message-chunk", event);
            return;
        case "message-done":
            window.webContents.send("byte:message-done", event);
            return;
        case "error":
            window.webContents.send("byte:error", event);
            return;
    }
}

function formatError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
