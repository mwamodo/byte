import { useEffect, useReducer, useRef } from "react";
import type { MascotExpression } from "./MascotCharacter.js";

type MascotAction =
    | { type: "MESSAGE_START" }
    | { type: "MESSAGE_DONE" }
    | { type: "ERROR" }
    | { type: "DECAY" }
    | { type: "SLEEP" }
    | { type: "WAKE" };

function mascotReducer(state: MascotExpression, action: MascotAction): MascotExpression {
    switch (action.type) {
        case "MESSAGE_START":
            return "thinking";
        case "MESSAGE_DONE":
            return "happy";
        case "ERROR":
            return "error";
        case "DECAY":
            return state === "happy" || state === "error" ? "idle" : state;
        case "SLEEP":
            return state === "idle" ? "sleeping" : state;
        case "WAKE":
            return state === "sleeping" ? "idle" : state;
        default:
            return state;
    }
}

export function useMascotState(): {
    expression: MascotExpression;
    dispatch: React.Dispatch<MascotAction>;
} {
    const [expression, dispatch] = useReducer(mascotReducer, "idle");
    const lastActivityRef = useRef(Date.now());

    // Subscribe to IPC events
    useEffect(() => {
        const unsubs = [
            window.byte.onMessageStart(() => {
                lastActivityRef.current = Date.now();
                dispatch({ type: "MESSAGE_START" });
            }),
            window.byte.onMessageDone(() => {
                lastActivityRef.current = Date.now();
                dispatch({ type: "MESSAGE_DONE" });
            }),
            window.byte.onError(() => {
                lastActivityRef.current = Date.now();
                dispatch({ type: "ERROR" });
            }),
        ];
        return () => {
            for (const u of unsubs) u();
        };
    }, []);

    // Auto-decay from happy/error back to idle
    useEffect(() => {
        if (expression === "happy") {
            const timer = setTimeout(() => dispatch({ type: "DECAY" }), 3000);
            return () => clearTimeout(timer);
        }
        if (expression === "error") {
            const timer = setTimeout(() => dispatch({ type: "DECAY" }), 4000);
            return () => clearTimeout(timer);
        }
    }, [expression]);

    // Sleep after 60s of inactivity
    useEffect(() => {
        const interval = setInterval(() => {
            if (Date.now() - lastActivityRef.current > 60_000) {
                dispatch({ type: "SLEEP" });
            }
        }, 5000);
        return () => clearInterval(interval);
    }, []);

    return { expression, dispatch };
}
