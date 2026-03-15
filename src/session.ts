import { SessionManager } from "@mariozechner/pi-coding-agent";
import type { ModelRegistry } from "@mariozechner/pi-coding-agent";

import { CLI_SESSIONS_DIR, WORKSPACE_DIR, type SessionTarget } from "./config.js";

export async function createSessionManager(target: SessionTarget): Promise<SessionManager> {
    switch (target.kind) {
        case "memory":
            return SessionManager.inMemory(WORKSPACE_DIR);
        case "new":
            return SessionManager.create(WORKSPACE_DIR, CLI_SESSIONS_DIR);
        case "resume-recent":
            return SessionManager.continueRecent(WORKSPACE_DIR, CLI_SESSIONS_DIR);
        case "resume-id": {
            const sessions = await SessionManager.list(WORKSPACE_DIR, CLI_SESSIONS_DIR);
            const match = sessions.find(s => s.id === target.sessionId);
            if (!match) {
                throw new Error(
                    `No session found with ID "${target.sessionId}".`
                );
            }
            return SessionManager.open(match.path, CLI_SESSIONS_DIR);
        }
    }
}

export function resolveModel(
    provider: string,
    modelId: string | undefined,
    registry: ModelRegistry,
) {
    const model =
        modelId !== undefined
            ? registry.find(provider, modelId)
            : registry.getAll().find((candidate) => candidate.provider === provider);
    if (!model) {
        throw new Error(
            modelId !== undefined
                ? `Could not find model "${provider}/${modelId}". Use --list-models to inspect available choices.`
                : `Could not find any models for provider "${provider}". Use --list-models to inspect available choices.`,
        );
    }
    return model;
}

export function printModels(registry: ModelRegistry): void {
    const models = registry.getAvailable();

    if (models.length === 0) {
        console.log("No models are currently available.");
        console.log(
            "Set API keys in ~/.byte/byte.config.json under \"apiKeys\", then retry.",
        );
        return;
    }

    console.log("Available models:");
    for (const model of models) {
        console.log(`- ${model.provider}/${model.id}`);
    }
}
