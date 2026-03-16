import type { CSSProperties, JSX } from "react";

export type MascotExpression = "idle" | "thinking" | "happy" | "error" | "sleeping";
export type MascotAccessory = "none";

export type MascotCharacterProps = {
    expression: MascotExpression;
    pupilOffset: { x: number; y: number };
    blinkPhase: number;
    swayOffset: { x: number; y: number; rotation: number };
};

type MascotVisualVariant = {
    accessory: MascotAccessory;
    auraOpacity: number;
    blobOpacity: number;
    coreOpacity: number;
    shellOpacity: number;
    palette: {
        aura: string;
        blobA: string;
        blobB: string;
        blobC: string;
        core: string;
        shell: string;
        highlight: string;
    };
};

const VARIANTS: Record<MascotExpression, MascotVisualVariant> = {
    idle: {
        accessory: "none",
        auraOpacity: 0.22,
        blobOpacity: 0.78,
        coreOpacity: 0.72,
        shellOpacity: 0.2,
        palette: {
            aura: "#8ceaff",
            blobA: "#8ce7ff",
            blobB: "#709dff",
            blobC: "#c0f5ff",
            core: "#f4feff",
            shell: "#8edcff",
            highlight: "#ffffff",
        },
    },
    thinking: {
        accessory: "none",
        auraOpacity: 0.24,
        blobOpacity: 0.84,
        coreOpacity: 0.78,
        shellOpacity: 0.22,
        palette: {
            aura: "#ffd88b",
            blobA: "#ffd870",
            blobB: "#ff9c6a",
            blobC: "#fff0cb",
            core: "#fff8e7",
            shell: "#ffd59c",
            highlight: "#fff8ef",
        },
    },
    happy: {
        accessory: "none",
        auraOpacity: 0.24,
        blobOpacity: 0.8,
        coreOpacity: 0.76,
        shellOpacity: 0.22,
        palette: {
            aura: "#9cf5d6",
            blobA: "#92f3dc",
            blobB: "#56d4c8",
            blobC: "#ebfff7",
            core: "#f3fffb",
            shell: "#9aeedb",
            highlight: "#ffffff",
        },
    },
    error: {
        accessory: "none",
        auraOpacity: 0.28,
        blobOpacity: 0.9,
        coreOpacity: 0.82,
        shellOpacity: 0.24,
        palette: {
            aura: "#ff9d88",
            blobA: "#ffb08d",
            blobB: "#ff5e6b",
            blobC: "#fff0ea",
            core: "#fff7f3",
            shell: "#ffb49e",
            highlight: "#fff6f2",
        },
    },
    sleeping: {
        accessory: "none",
        auraOpacity: 0.16,
        blobOpacity: 0.5,
        coreOpacity: 0.5,
        shellOpacity: 0.14,
        palette: {
            aura: "#88dcff",
            blobA: "#8ad7ff",
            blobB: "#688ce2",
            blobC: "#d8f5ff",
            core: "#eefcff",
            shell: "#87d0f2",
            highlight: "#fbffff",
        },
    },
};

export function MascotCharacter({
    expression,
    pupilOffset: _pupilOffset,
    blinkPhase: _blinkPhase,
    swayOffset,
}: MascotCharacterProps): JSX.Element {
    const variant = VARIANTS[expression];
    const svgClass = ["mascot-svg", `mascot-${expression}`].join(" ");
    const svgStyle = {
        "--mascot-aura": variant.palette.aura,
        "--mascot-blob-a": variant.palette.blobA,
        "--mascot-blob-b": variant.palette.blobB,
        "--mascot-blob-c": variant.palette.blobC,
        "--mascot-core": variant.palette.core,
        "--mascot-shell": variant.palette.shell,
        "--mascot-highlight": variant.palette.highlight,
        transform: `translate(${swayOffset.x}px, ${swayOffset.y}px) rotate(${swayOffset.rotation}deg)`,
    } as CSSProperties;

    return (
        <svg
            aria-hidden="true"
            className={svgClass}
            viewBox="0 0 108 108"
            width="100%"
            height="100%"
            style={svgStyle}
        >
            <defs>
                <clipPath id="mascot-sphere-clip">
                    <circle cx="54" cy="54" r="30" />
                </clipPath>
                <radialGradient id="mascot-core-glow" cx="46%" cy="42%" r="54%">
                    <stop offset="0%" stopColor="var(--mascot-core)" stopOpacity={variant.coreOpacity} />
                    <stop offset="55%" stopColor="var(--mascot-blob-c)" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="var(--mascot-blob-c)" stopOpacity="0" />
                </radialGradient>
                <radialGradient id="mascot-shell-fill" cx="36%" cy="30%" r="72%">
                    <stop offset="0%" stopColor="var(--mascot-highlight)" stopOpacity="0.22" />
                    <stop offset="24%" stopColor="var(--mascot-shell)" stopOpacity={variant.shellOpacity} />
                    <stop offset="70%" stopColor="var(--mascot-shell)" stopOpacity="0.08" />
                    <stop offset="100%" stopColor="var(--mascot-highlight)" stopOpacity="0.18" />
                </radialGradient>
            </defs>

            <ellipse className="mascot-shadow" cx="54" cy="92" rx="20" ry="6" />
            <circle
                className="mascot-aura"
                cx="54"
                cy="54"
                r="36"
                fill="var(--mascot-aura)"
                opacity={variant.auraOpacity}
            />

            <g className="mascot-volume" clipPath="url(#mascot-sphere-clip)" opacity={variant.blobOpacity}>
                <circle className="mascot-inner-glow" cx="54" cy="54" r="24" fill="url(#mascot-core-glow)" />
                <ellipse className="mascot-blob mascot-blob-a" cx="44" cy="44" rx="18" ry="14" fill="var(--mascot-blob-a)" opacity="0.46" />
                <ellipse className="mascot-blob mascot-blob-b" cx="66" cy="60" rx="17" ry="20" fill="var(--mascot-blob-b)" opacity="0.42" />
                <ellipse className="mascot-blob mascot-blob-c" cx="55" cy="70" rx="22" ry="10" fill="var(--mascot-blob-c)" opacity="0.22" />
                <ellipse className="mascot-caustic mascot-caustic-a" cx="58" cy="49" rx="8" ry="22" fill="var(--mascot-highlight)" opacity="0.08" transform="rotate(28 58 49)" />
                <ellipse className="mascot-caustic mascot-caustic-b" cx="42" cy="66" rx="7" ry="18" fill="var(--mascot-highlight)" opacity="0.05" transform="rotate(-22 42 66)" />
            </g>

            <circle className="mascot-shell" cx="54" cy="54" r="30" fill="url(#mascot-shell-fill)" />
            <circle className="mascot-shell-rim" cx="54" cy="54" r="30" fill="none" stroke="var(--mascot-highlight)" strokeOpacity="0.32" strokeWidth="1" />
            <ellipse className="mascot-highlight-arc" cx="45" cy="37" rx="11" ry="18" fill="none" stroke="var(--mascot-highlight)" strokeOpacity="0.72" strokeWidth="2.2" transform="rotate(28 45 37)" />
            <ellipse className="mascot-highlight-arc secondary" cx="67" cy="71" rx="10" ry="7" fill="none" stroke="var(--mascot-highlight)" strokeOpacity="0.22" strokeWidth="1.2" transform="rotate(-18 67 71)" />
            <circle className="mascot-specular" cx="39" cy="33" r="5" fill="var(--mascot-highlight)" opacity="0.7" />
            <circle className="mascot-specular tiny" cx="33" cy="42" r="2.2" fill="var(--mascot-highlight)" opacity="0.48" />
        </svg>
    );
}
