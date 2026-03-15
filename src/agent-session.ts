import {
    createAgentSession,
    type CreateAgentSessionResult,
    type SessionManager,
} from "@mariozechner/pi-coding-agent";

import type { RuntimeContext } from "./runtime.js";

export async function openAgentSession(options: {
    runtime: RuntimeContext;
    sessionManager: SessionManager;
    thinkingLevel?: "off" | "low" | "medium" | "high";
}): Promise<CreateAgentSessionResult> {
    return createAgentSession({
        ...options.runtime.sessionFactoryInputs,
        sessionManager: options.sessionManager,
        thinkingLevel: options.thinkingLevel,
    });
}
