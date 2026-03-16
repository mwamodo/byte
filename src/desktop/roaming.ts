import type { BrowserWindow } from "electron";

type RoamingHandle = {
    stop(): void;
    pause(): void;
    resume(): void;
};

export function startRoaming(mascotWindow: BrowserWindow): RoamingHandle {
    let stopped = false;
    let paused = false;
    let pausedByDrag = false;
    let moveTimer: ReturnType<typeof setTimeout> | undefined;
    let moveInterval: ReturnType<typeof setInterval> | undefined;
    let isProgrammaticMove = false;
    let dragPauseTimer: ReturnType<typeof setTimeout> | undefined;

    // Detect user drags vs programmatic moves
    mascotWindow.on("moved", () => {
        if (!isProgrammaticMove && !stopped) {
            pausedByDrag = true;
            clearTimers();

            // Resume roaming after 120s
            if (dragPauseTimer) clearTimeout(dragPauseTimer);
            dragPauseTimer = setTimeout(() => {
                pausedByDrag = false;
                if (!paused && !stopped) scheduleNextMove();
            }, 120_000);
        }
    });

    function clearTimers(): void {
        if (moveTimer) clearTimeout(moveTimer);
        if (moveInterval) clearInterval(moveInterval);
        moveTimer = undefined;
        moveInterval = undefined;
    }

    function scheduleNextMove(): void {
        if (stopped || paused || pausedByDrag) return;

        const delay = 30_000 + Math.random() * 60_000; // 30-90s
        moveTimer = setTimeout(() => {
            if (stopped || paused || pausedByDrag) return;
            moveToRandomEdgePosition();
        }, delay);
    }

    async function moveToRandomEdgePosition(): Promise<void> {
        if (stopped || paused || pausedByDrag || mascotWindow.isDestroyed()) return;

        const { screen } = await import("electron");
        const currentBounds = mascotWindow.getBounds();
        const display = screen.getDisplayNearestPoint({ x: currentBounds.x, y: currentBounds.y });
        const workArea = display.workArea;
        const margin = 20;
        const winW = currentBounds.width;
        const winH = currentBounds.height;

        // Pick a random edge-adjacent destination
        const edge = Math.floor(Math.random() * 4); // 0=top, 1=right, 2=bottom, 3=left
        let destX: number;
        let destY: number;

        switch (edge) {
            case 0: // top
                destX = workArea.x + margin + Math.random() * (workArea.width - winW - 2 * margin);
                destY = workArea.y + margin;
                break;
            case 1: // right
                destX = workArea.x + workArea.width - winW - margin;
                destY = workArea.y + margin + Math.random() * (workArea.height - winH - 2 * margin);
                break;
            case 2: // bottom
                destX = workArea.x + margin + Math.random() * (workArea.width - winW - 2 * margin);
                destY = workArea.y + workArea.height - winH - margin;
                break;
            default: // left
                destX = workArea.x + margin;
                destY = workArea.y + margin + Math.random() * (workArea.height - winH - 2 * margin);
                break;
        }

        // Animate movement at ~20px/sec, step every 50ms (1px per step)
        const startX = currentBounds.x;
        const startY = currentBounds.y;
        const dx = destX - startX;
        const dy = destY - startY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const speed = 20; // px per second
        const totalTime = (distance / speed) * 1000;
        const steps = Math.max(1, Math.floor(totalTime / 50));
        let step = 0;

        moveInterval = setInterval(() => {
            if (stopped || paused || pausedByDrag || mascotWindow.isDestroyed()) {
                clearTimers();
                return;
            }

            step++;
            const t = Math.min(step / steps, 1);
            // Ease in-out
            const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

            const x = Math.round(startX + dx * eased);
            const y = Math.round(startY + dy * eased);

            isProgrammaticMove = true;
            mascotWindow.setBounds({ x, y, width: winW, height: winH }, false);
            // Reset flag after a tick to allow the moved event to fire first
            setTimeout(() => {
                isProgrammaticMove = false;
            }, 10);

            if (t >= 1) {
                clearTimers();
                // Pause at destination for 10-30s then schedule next
                const pauseTime = 10_000 + Math.random() * 20_000;
                moveTimer = setTimeout(() => scheduleNextMove(), pauseTime);
            }
        }, 50);
    }

    // Start the first scheduled move
    scheduleNextMove();

    return {
        stop() {
            stopped = true;
            clearTimers();
            if (dragPauseTimer) clearTimeout(dragPauseTimer);
        },
        pause() {
            paused = true;
            clearTimers();
        },
        resume() {
            paused = false;
            if (!stopped && !pausedByDrag) scheduleNextMove();
        },
    };
}
