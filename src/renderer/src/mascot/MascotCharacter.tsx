import type { JSX } from "react";

export type MascotExpression = "idle" | "thinking" | "happy" | "error" | "sleeping";

export type MascotCharacterProps = {
    expression: MascotExpression;
    pupilOffset: { x: number; y: number };
    blinkPhase: number;
    swayOffset: { x: number; y: number; rotation: number };
};

const MOUTH_PATHS: Record<MascotExpression, string> = {
    idle: "M 38 68 Q 54 80, 70 68",
    thinking: "M 48 70 Q 54 76, 60 70 Q 54 64, 48 70",
    happy: "M 34 66 Q 54 86, 74 66",
    error: "M 38 76 Q 54 66, 70 76",
    sleeping: "M 42 72 L 66 72",
};

export function MascotCharacter({
    expression,
    pupilOffset,
    blinkPhase,
    swayOffset,
}: MascotCharacterProps): JSX.Element {
    const pupilTravel = 3;
    const leftPupilCx = 40 + pupilOffset.x * pupilTravel;
    const leftPupilCy = 46 + pupilOffset.y * pupilTravel;
    const rightPupilCx = 68 + pupilOffset.x * pupilTravel;
    const rightPupilCy = 46 + pupilOffset.y * pupilTravel;

    // Clip height shrinks to close eyes (16 = open, 0 = shut)
    const isSleeping = expression === "sleeping";
    const openHeight = isSleeping ? 9 : 16;
    const clipHeight = openHeight * (1 - blinkPhase);

    const svgClass = [
        "mascot-svg",
        expression === "thinking" ? "mascot-thinking" : "",
        expression === "error" ? "mascot-error" : "",
        expression === "happy" ? "mascot-happy" : "",
    ]
        .filter(Boolean)
        .join(" ");

    return (
        <svg
            className={svgClass}
            viewBox="0 0 108 108"
            width={108}
            height={108}
            style={{
                transform: `translate(${swayOffset.x}px, ${swayOffset.y}px) rotate(${swayOffset.rotation}deg)`,
            }}
        >
            <defs>
                <radialGradient id="bodyGrad" cx="30%" cy="30%" r="70%">
                    <stop offset="0%" stopColor="rgba(255,203,128,0.25)" />
                    <stop offset="100%" stopColor="rgba(255,142,87,0.18)" />
                </radialGradient>
                <clipPath id="leftEyeClip">
                    <rect x="30" y="38" width="20" height={clipHeight} rx="8" />
                </clipPath>
                <clipPath id="rightEyeClip">
                    <rect x="58" y="38" width="20" height={clipHeight} rx="8" />
                </clipPath>
            </defs>

            {/* Glassy body */}
            <rect
                className="mascot-body"
                x="10"
                y="10"
                width="88"
                height="88"
                rx="30"
                fill="url(#bodyGrad)"
                stroke="rgba(255,255,255,0.12)"
                strokeWidth="1"
            />

            {/* Left eye */}
            <g clipPath="url(#leftEyeClip)">
                <circle className="mascot-pupil" cx={leftPupilCx} cy={leftPupilCy} r="5" fill="#19110d" />
            </g>

            {/* Right eye */}
            <g clipPath="url(#rightEyeClip)">
                <circle className="mascot-pupil" cx={rightPupilCx} cy={rightPupilCy} r="5" fill="#19110d" />
            </g>

            {/* Mouth */}
            <path
                className="mascot-mouth"
                d={MOUTH_PATHS[expression]}
                fill="none"
                stroke="#19110d"
                strokeWidth="3"
                strokeLinecap="round"
            />

            {/* Sleeping ZZZs */}
            {isSleeping && (
                <g className="mascot-zzz">
                    <text x="78" y="28" fontSize="12" fill="#19110d" opacity="0.6">z</text>
                    <text x="84" y="18" fontSize="10" fill="#19110d" opacity="0.4">z</text>
                    <text x="90" y="10" fontSize="8" fill="#19110d" opacity="0.2">z</text>
                </g>
            )}
        </svg>
    );
}
