import { BrowserWindow, screen } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import type { DesktopAccountPosition } from "../config.js";

export const MASCOT_WINDOW_SIZE = { width: 108, height: 108 };
export const CHAT_WINDOW_SIZE = { width: 420, height: 620 };
export const COLLAPSED_WINDOW_SIZE = MASCOT_WINDOW_SIZE;

const DESKTOP_DIR = dirname(fileURLToPath(import.meta.url));

function loadRenderer(window: BrowserWindow, view: string): void {
    const rendererUrl = process.env.ELECTRON_RENDERER_URL;
    if (rendererUrl) {
        void window.loadURL(`${rendererUrl}?view=${view}`);
    } else {
        void window.loadFile(join(DESKTOP_DIR, "..", "renderer", "index.html"), {
            query: { view },
        });
    }
}

function createBaseWindow(options: {
    bounds: { height: number; width: number; x: number; y: number };
    movable: boolean;
}): BrowserWindow {
    const window = new BrowserWindow({
        ...options.bounds,
        show: false,
        frame: false,
        transparent: true,
        hasShadow: false,
        resizable: false,
        movable: options.movable,
        alwaysOnTop: true,
        skipTaskbar: true,
        vibrancy: "sidebar",
        visualEffectState: "active",
        trafficLightPosition: { x: -100, y: -100 },
        webPreferences: {
            preload: join(DESKTOP_DIR, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
    });

    window.setAlwaysOnTop(true, "floating");
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    return window;
}

export function createMascotWindow(options: {
    position: DesktopAccountPosition;
}): BrowserWindow {
    const bounds = getAnchoredBounds({
        height: MASCOT_WINDOW_SIZE.height,
        position: options.position,
        width: MASCOT_WINDOW_SIZE.width,
    });

    const window = createBaseWindow({ bounds, movable: true });
    loadRenderer(window, "mascot");
    return window;
}

export function createChatWindow(options: {
    position: DesktopAccountPosition;
}): BrowserWindow {
    const bounds = getAnchoredBounds({
        height: CHAT_WINDOW_SIZE.height,
        position: options.position,
        width: CHAT_WINDOW_SIZE.width,
    });

    const window = createBaseWindow({ bounds, movable: false });
    loadRenderer(window, "chat");
    return window;
}

export function positionChatNearMascot(mascot: BrowserWindow, chat: BrowserWindow): void {
    const mascotBounds = mascot.getBounds();
    const chatSize = CHAT_WINDOW_SIZE;
    const display = screen.getDisplayNearestPoint({ x: mascotBounds.x, y: mascotBounds.y });
    const workArea = display.workArea;

    // Place chat above the mascot, right-aligned with its right edge
    let x = mascotBounds.x + mascotBounds.width - chatSize.width;
    let y = mascotBounds.y - chatSize.height - 10;

    // Clamp to work area
    x = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - chatSize.width));
    y = Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - chatSize.height));

    chat.setBounds({ x, y, width: chatSize.width, height: chatSize.height }, false);
}

export function resizeAnchoredWindow(
    window: BrowserWindow,
    options: {
        height: number;
        position: DesktopAccountPosition;
        width: number;
    },
): void {
    const bounds = getAnchoredBounds(options);
    window.setBounds(bounds, false);
}

export function getAnchoredBounds(options: {
    height: number;
    position: DesktopAccountPosition;
    width: number;
}): { height: number; width: number; x: number; y: number } {
    const workArea = screen.getPrimaryDisplay().workArea;
    const margin = 20;

    const x =
        options.position.endsWith("right")
            ? workArea.x + workArea.width - options.width - margin
            : workArea.x + margin;
    const y =
        options.position.startsWith("bottom")
            ? workArea.y + workArea.height - options.height - margin
            : workArea.y + margin;

    return {
        x,
        y,
        width: options.width,
        height: options.height,
    };
}
