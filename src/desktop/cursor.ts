import type { BrowserWindow } from "electron";

export function startCursorTracking(mascotWindow: BrowserWindow): { stop(): void } {
    let intervalId: ReturnType<typeof setInterval> | undefined;

    // Lazy import screen to avoid importing electron at module level in tests
    import("electron").then(({ screen }) => {
        intervalId = setInterval(() => {
            if (mascotWindow.isDestroyed()) {
                if (intervalId !== undefined) clearInterval(intervalId);
                return;
            }

            const point = screen.getCursorScreenPoint();
            const bounds = mascotWindow.getBounds();

            mascotWindow.webContents.send("byte:cursor-position", {
                x: point.x,
                y: point.y,
                windowX: bounds.x,
                windowY: bounds.y,
                windowWidth: bounds.width,
                windowHeight: bounds.height,
            });
        }, 50); // 20Hz
    });

    return {
        stop() {
            if (intervalId !== undefined) clearInterval(intervalId);
        },
    };
}
