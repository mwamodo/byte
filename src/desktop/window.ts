import { BrowserWindow, screen } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import type { DesktopAccountPosition } from "../config.js";

export const COLLAPSED_WINDOW_SIZE = {
    width: 140,
    height: 180,
};
const DESKTOP_DIR = dirname(fileURLToPath(import.meta.url));

export function createDesktopWindow(options: {
    position: DesktopAccountPosition;
}): BrowserWindow {
    const bounds = getAnchoredBounds({
        height: COLLAPSED_WINDOW_SIZE.height,
        position: options.position,
        width: COLLAPSED_WINDOW_SIZE.width,
    });

    const window = new BrowserWindow({
        ...bounds,
        show: false,
        frame: false,
        transparent: true,
        hasShadow: false,
        resizable: false,
        movable: false,
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

    const rendererUrl = process.env.ELECTRON_RENDERER_URL;
    if (rendererUrl) {
        void window.loadURL(rendererUrl);
    } else {
        void window.loadFile(join(DESKTOP_DIR, "..", "renderer", "index.html"));
    }

    return window;
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
