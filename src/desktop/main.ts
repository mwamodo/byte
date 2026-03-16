import type { BrowserWindow, IpcMain } from "electron";

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

    ipc.handle("byte:resize", async (_event, payload: { height: number; width: number }) => {
        if ("setBounds" in window) {
            const { resizeAnchoredWindow } = await import("./window.js");
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
    chatWindow: BrowserWindow;
    mascotWindow: BrowserWindow;
}): Promise<void> {
    const { app, globalShortcut, ipcMain } = await import("electron");
    const { createDesktopTray } = await import("./tray.js");
    const { positionChatNearMascot } = await import("./window.js");
    const { account, channel, chatWindow, mascotWindow } = options;

    registerDesktopIpcHandlers({
        account,
        channel,
        ipc: ipcMain,
        window: chatWindow,
    });

    function showChat(): void {
        if (!chatWindow.isVisible()) {
            positionChatNearMascot(mascotWindow, chatWindow);
        }
        toggleWindow(chatWindow);
    }

    ipcMain.handle("byte:toggle", async () => {
        showChat();
    });

    // Forward expression-relevant events to mascot
    channel.subscribe((event) => {
        if (mascotWindow.isDestroyed()) return;
        if (event.type === "message-start" || event.type === "message-done" || event.type === "error") {
            mascotWindow.webContents.send(`byte:${event.type}`, event);
        }
    });

    const tray = createDesktopTray({
        model: channel.modelName,
        onQuit: () => app.quit(),
        onToggle: () => showChat(),
    });

    globalShortcut.register(account.hotkey, () => {
        showChat();
    });

    // Start cursor tracking for eye-follow
    const { startCursorTracking } = await import("./cursor.js");
    const cursorTracking = startCursorTracking(mascotWindow);

    // Start autonomous roaming
    const { startRoaming } = await import("./roaming.js");
    const roaming = startRoaming(mascotWindow);

    mascotWindow.show();
    chatWindow.on("show", () => {
        emitVisibility(chatWindow, true);
        roaming.pause();
    });
    chatWindow.on("hide", () => {
        emitVisibility(chatWindow, false);
        roaming.resume();
    });

    app.on("before-quit", () => {
        tray.destroy();
        globalShortcut.unregisterAll();
        cursorTracking.stop();
        roaming.stop();
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
