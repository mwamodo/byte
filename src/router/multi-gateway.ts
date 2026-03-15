import { resolve } from "node:path";

import { SessionManager } from "@mariozechner/pi-coding-agent";

import { openAgentSession } from "../agent-session.js";
import type { AgentRuntime } from "../agents.js";
import type { GatewayConfig, MultiAgentGatewayConfig } from "../config.js";
import { createGatewayBot, type GatewayBot } from "../gateway.js";
import { TelegramSessionRegistry } from "../sessions/registry.js";

type GatewayLogger = Pick<Console, "error" | "log">;

export type MultiGateway = {
    start(): Promise<void>;
    stop(): Promise<void>;
};

export function createMultiGateway(
    config: MultiAgentGatewayConfig,
    agentRuntimes: Map<string, AgentRuntime>,
    options: { logger?: GatewayLogger },
): MultiGateway {
    const logger = options.logger ?? console;
    const bots: GatewayBot[] = [];

    for (const account of config.accounts) {
        const binding = config.bindings.find(
            (b) => b.channel === "telegram" && b.accountId === account.accountId,
        );

        if (!binding) {
            logger.log(
                `[multi-gateway] no binding for telegram account "${account.accountId}", skipping`,
            );
            continue;
        }

        const agentRuntime = agentRuntimes.get(binding.agentId);
        if (!agentRuntime) {
            throw new Error(
                `Binding references agent "${binding.agentId}" but no runtime was initialized for it.`,
            );
        }

        const { runtime, config: agentConfig } = agentRuntime;
        const indexPath = resolve(agentConfig.sessionsDir, "telegram-session-index.json");

        const sessions = new TelegramSessionRegistry({
            indexPath,
            logger,
            sessionFactory: {
                createNewSession: async () => {
                    const { session } = await openAgentSession({
                        runtime,
                        sessionManager: SessionManager.create(
                            runtime.sessionFactoryInputs.cwd as string,
                            agentConfig.sessionsDir,
                        ),
                        thinkingLevel: agentConfig.thinkingLevel,
                    });
                    return session;
                },
                openSession: async (sessionFile) => {
                    const { session } = await openAgentSession({
                        runtime,
                        sessionManager: SessionManager.open(sessionFile),
                        thinkingLevel: agentConfig.thinkingLevel,
                    });
                    return session;
                },
            },
        });

        const perAccountConfig: GatewayConfig = {
            allowFrom: account.allowFrom,
            apiKeys: agentConfig.apiKeys,
            botToken: account.botToken,
            modelId: agentConfig.modelId,
            promptMode: agentConfig.promptMode,
            provider: agentConfig.provider,
            replyDebounceMs: account.replyDebounceMs,
            thinkingLevel: agentConfig.thinkingLevel,
        };

        const bot = createGatewayBot(perAccountConfig, { logger, sessions });
        bots.push(bot);

        logger.log(
            `[multi-gateway] account "${account.accountId}" (telegram) -> agent:${binding.agentId}`,
        );
    }

    return {
        async start() {
            for (const bot of bots) {
                await bot.start();
            }
        },
        async stop() {
            for (const bot of bots) {
                await bot.stop();
            }
        },
    };
}
