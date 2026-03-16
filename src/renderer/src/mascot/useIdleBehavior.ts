import { useCallback, useEffect, useRef, useState } from "react";
import type { MascotExpression } from "./ClippyCharacter.js";

type SwayOffset = { x: number; y: number; rotation: number };

export function useIdleBehavior(expression: MascotExpression): {
    blinkPhase: number;
    swayOffset: SwayOffset;
} {
    const [blinkPhase, setBlinkPhase] = useState(0);
    const [swayOffset, setSwayOffset] = useState<SwayOffset>({ x: 0, y: 0, rotation: 0 });
    const rafRef = useRef<number>(0);

    // Blink timer
    useEffect(() => {
        let timeoutId: ReturnType<typeof setTimeout>;

        function scheduleBlink(): void {
            const delay = 3000 + Math.random() * 4000; // 3-7s
            timeoutId = setTimeout(() => {
                setBlinkPhase(1);
                setTimeout(() => {
                    setBlinkPhase(0);
                    // 10% chance of double-blink
                    if (Math.random() < 0.1) {
                        setTimeout(() => {
                            setBlinkPhase(1);
                            setTimeout(() => {
                                setBlinkPhase(0);
                                scheduleBlink();
                            }, 150);
                        }, 100);
                    } else {
                        scheduleBlink();
                    }
                }, 150);
            }, delay);
        }

        scheduleBlink();
        return () => clearTimeout(timeoutId);
    }, []);

    // Idle sway animation
    const animate = useCallback(
        (time: number) => {
            if (expression === "idle") {
                setSwayOffset({
                    x: Math.sin(time * 0.00085) * 1.5,
                    y: Math.sin(time * 0.0012) * 1.8,
                    rotation: Math.sin(time * 0.00075) * 1.2,
                });
            } else if (expression === "thinking") {
                setSwayOffset({
                    x: Math.sin(time * 0.0024) * 0.8,
                    y: Math.sin(time * 0.0046) * 3.2,
                    rotation: Math.sin(time * 0.0028) * 0.8,
                });
            } else if (expression === "sleeping") {
                setSwayOffset({
                    x: Math.sin(time * 0.00045) * 0.9,
                    y: Math.sin(time * 0.0007) * 1.2,
                    rotation: Math.sin(time * 0.00035) * 0.5,
                });
            } else if (expression === "happy") {
                setSwayOffset({
                    x: 0,
                    y: Math.sin(time * 0.0032) * 1.2,
                    rotation: Math.sin(time * 0.0018) * 0.4,
                });
            } else if (expression === "waving") {
                setSwayOffset({
                    x: 0,
                    y: Math.sin(time * 0.003) * 1.5,
                    rotation: Math.sin(time * 0.002) * 0.6,
                });
            } else if (expression === "error") {
                setSwayOffset({
                    x: Math.sin(time * 0.018) * 1.4,
                    y: Math.sin(time * 0.007) * 0.8,
                    rotation: Math.sin(time * 0.015) * 0.9,
                });
            } else {
                setSwayOffset({ x: 0, y: 0, rotation: 0 });
            }
            rafRef.current = requestAnimationFrame(animate);
        },
        [expression],
    );

    useEffect(() => {
        rafRef.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(rafRef.current);
    }, [animate]);

    return { blinkPhase, swayOffset };
}
