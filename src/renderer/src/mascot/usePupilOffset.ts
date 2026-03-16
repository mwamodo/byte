import { useEffect, useRef, useState } from "react";

type PupilOffset = { x: number; y: number };

export function usePupilOffset(): PupilOffset {
    const [offset, setOffset] = useState<PupilOffset>({ x: 0, y: 0 });
    const lastCursorMoveRef = useRef(Date.now());
    const lookAroundRef = useRef<ReturnType<typeof setTimeout>>();

    useEffect(() => {
        // Subscribe to cursor position from main process
        if (!window.byte.onCursorPosition) {
            return;
        }

        const unsub = window.byte.onCursorPosition((payload) => {
            lastCursorMoveRef.current = Date.now();

            // Window center
            const centerX = payload.windowX + payload.windowWidth / 2;
            const centerY = payload.windowY + payload.windowHeight / 2;

            // Vector from window center to cursor
            const dx = payload.x - centerX;
            const dy = payload.y - centerY;

            // Distance, capped at 800px
            const distance = Math.min(Math.sqrt(dx * dx + dy * dy), 800);
            const maxDistance = 800;

            // Normalize to -1..1
            const normalizedDistance = distance / maxDistance;
            const angle = Math.atan2(dy, dx);

            setOffset({
                x: Math.cos(angle) * normalizedDistance,
                y: Math.sin(angle) * normalizedDistance,
            });
        });

        // Look-around behavior when cursor hasn't moved for 5s
        const lookAroundInterval = setInterval(() => {
            if (Date.now() - lastCursorMoveRef.current > 5000) {
                // Random look-around
                const randomX = (Math.random() - 0.5) * 1.6;
                const randomY = (Math.random() - 0.5) * 1.6;
                setOffset({ x: randomX, y: randomY });

                // Return to center after 1-2s
                lookAroundRef.current = setTimeout(() => {
                    setOffset({ x: 0, y: 0 });
                }, 1000 + Math.random() * 1000);
            }
        }, 5000);

        return () => {
            unsub();
            clearInterval(lookAroundInterval);
            if (lookAroundRef.current) clearTimeout(lookAroundRef.current);
        };
    }, []);

    return offset;
}
