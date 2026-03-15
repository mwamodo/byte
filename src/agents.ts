import type { ResolvedAgent } from "./config.js";
import {
    ensureAgentDirs,
    initializeRuntime,
    type RuntimeContext,
} from "./runtime.js";

export type AgentRuntime = {
    agentId: string;
    config: ResolvedAgent;
    runtime: RuntimeContext;
};

export async function initializeAgents(
    agents: ResolvedAgent[],
): Promise<Map<string, AgentRuntime>> {
    const map = new Map<string, AgentRuntime>();

    for (const agent of agents) {
        ensureAgentDirs(agent.workspace, agent.sessionsDir);

        const runtime = await initializeRuntime({
            apiKeys: agent.apiKeys,
            modelId: agent.modelId,
            promptMode: agent.promptMode,
            provider: agent.provider,
            workspaceDir: agent.workspace,
        });

        map.set(agent.id, { agentId: agent.id, config: agent, runtime });
    }

    return map;
}
