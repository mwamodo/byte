import { useCallback, useEffect, useRef, useState } from "react";
import type { MascotExpression } from "./MascotCharacter.js";

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
                    x: Math.sin(time * 0.001) * 2,
                    y: 0,
                    rotation: Math.sin(time * 0.0008) * 1.5,
                });
            } else if (expression === "thinking") {
                // Bob up and down while thinking
                setSwayOffset({
                    x: 0,
                    y: Math.sin(time * 0.005) * 4,
                    rotation: 0,
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
