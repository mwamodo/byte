import { useEffect, useState, type JSX } from "react";

export type MascotExpression = "idle" | "thinking" | "happy" | "waving" | "error" | "sleeping";

interface ClippyCharacterProps {
    expression: MascotExpression;
    pupilOffset: { x: number; y: number };
    swayOffset: { x: number; y: number; rotation: number };
}

export function ClippyCharacter({ expression, pupilOffset, swayOffset }: ClippyCharacterProps): JSX.Element {
    const [blinking, setBlinking] = useState(false);

    // Random blink
    useEffect(() => {
        if (expression === "thinking" || expression === "sleeping") return;
        const scheduleNextBlink = (): ReturnType<typeof setTimeout> =>
            setTimeout(
                () => {
                    setBlinking(true);
                    setTimeout(() => setBlinking(false), 150);
                    scheduleNextBlink();
                },
                4000 + Math.random() * 5000,
            );
        const t = scheduleNextBlink();
        return () => clearTimeout(t);
    }, [expression]);

    // Pupil offset scaled for visible effect
    const pupilX = pupilOffset.x * 4;
    const pupilY = pupilOffset.y * 3;
    const eyeHeight = expression === "sleeping" ? 3 : blinking ? 1 : 8;

    const mouthPath: Record<MascotExpression, string> = {
        idle: "M 36 88 Q 50 98 64 88",
        thinking: "M 38 90 Q 50 90 62 90",
        happy: "M 34 86 Q 50 100 66 86",
        waving: "M 34 86 Q 50 100 66 86",
        error: "M 36 90 Q 50 82 64 90",
        sleeping: "M 38 90 Q 50 94 62 90",
    };

    const bodyColor = expression === "error" ? "#e05a5a" : expression === "sleeping" ? "#7a9dbd" : "#5b9bd5";
    const bodyGradEnd = expression === "error" ? "#c03030" : expression === "sleeping" ? "#5a7d9d" : "#2e7ed8";

    return (
        <div
            className={`clippy-character clippy-state-${expression}`}
            style={{
                transform: `translate(${swayOffset.x}px, ${swayOffset.y}px) rotate(${swayOffset.rotation}deg)`,
            }}
        >
            <svg
                width="100"
                height="160"
                viewBox="0 0 100 160"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
            >
                <defs>
                    <linearGradient id="bodyGrad" x1="20%" y1="0%" x2="80%" y2="100%">
                        <stop offset="0%" stopColor={bodyColor} />
                        <stop offset="100%" stopColor={bodyGradEnd} />
                    </linearGradient>
                    <linearGradient id="shineGrad" x1="0%" y1="0%" x2="60%" y2="60%">
                        <stop offset="0%" stopColor="rgba(255,255,255,0.45)" />
                        <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                    </linearGradient>
                    <filter id="shadow" x="-20%" y="-10%" width="140%" height="130%">
                        <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#0003" />
                    </filter>
                </defs>

                {/* Main body: rounded pill */}
                <rect x="8" y="8" width="84" height="144" rx="42" ry="42" fill="url(#bodyGrad)" filter="url(#shadow)" />

                {/* Inner clip ring */}
                <rect x="22" y="38" width="56" height="84" rx="28" ry="28" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="4" />

                {/* Shine / specular highlight */}
                <ellipse cx="35" cy="35" rx="22" ry="18" fill="url(#shineGrad)" transform="rotate(-20 35 35)" />

                {/* Left eye */}
                <ellipse cx={32 + pupilX * 0.3} cy={68 + pupilY * 0.3} rx="10" ry={eyeHeight} fill="white" />
                <circle cx={34 + pupilX} cy={69 + pupilY} r="4.5" fill="#1a2a4a" />
                {eyeHeight > 2 && <circle cx={36 + pupilX * 0.8} cy={67 + pupilY * 0.5} r="1.5" fill="white" />}

                {/* Right eye */}
                <ellipse cx={68 + pupilX * 0.3} cy={68 + pupilY * 0.3} rx="10" ry={eyeHeight} fill="white" />
                <circle cx={70 + pupilX} cy={69 + pupilY} r="4.5" fill="#1a2a4a" />
                {eyeHeight > 2 && <circle cx={72 + pupilX * 0.8} cy={67 + pupilY * 0.5} r="1.5" fill="white" />}

                {/* Mouth */}
                <path d={mouthPath[expression]} stroke="#1a2a4a" strokeWidth="3" strokeLinecap="round" fill="none" />

                {/* Thinking dots */}
                {expression === "thinking" && (
                    <g className="clippy-thinking-dots">
                        <circle cx="34" cy="120" r="4" fill="white" fillOpacity="0.7" />
                        <circle cx="50" cy="120" r="4" fill="white" fillOpacity="0.7" />
                        <circle cx="66" cy="120" r="4" fill="white" fillOpacity="0.7" />
                    </g>
                )}

                {/* Waving arm — only on wake / long task */}
                {expression === "waving" && (
                    <path d="M 85 60 Q 105 40 95 20" stroke={bodyColor} strokeWidth="10" strokeLinecap="round" className="clippy-wave-arm" />
                )}

                {/* Sleeping Z's */}
                {expression === "sleeping" && (
                    <g className="clippy-sleeping-zs">
                        <text x="75" y="30" fill="white" fillOpacity="0.6" fontSize="16" fontWeight="bold">z</text>
                        <text x="85" y="18" fill="white" fillOpacity="0.4" fontSize="12" fontWeight="bold">z</text>
                        <text x="92" y="8" fill="white" fillOpacity="0.25" fontSize="9" fontWeight="bold">z</text>
                    </g>
                )}
            </svg>
        </div>
    );
}
