import { resolve } from "node:path";

import { SessionManager } from "@mariozechner/pi-coding-agent";

import { openAgentSession } from "../agent-session.js";
import type { AgentRuntime } from "../agents.js";
import type { GatewayConfig, MultiAgentGatewayConfig } from "../config.js";
import { DesktopChannel } from "../channels/desktop.js";
import { createGatewayBot, type GatewayBot } from "../gateway.js";
import { TelegramSessionRegistry } from "../sessions/registry.js";

type GatewayLogger = Pick<Console, "error" | "log">;

export type MultiGateway = {
    getDesktopChannel(accountId: string): DesktopChannel | undefined;
    start(): Promise<void>;
    stop(): Promise<void>;
};

export function createMultiGateway(
    config: MultiAgentGatewayConfig,
    agentRuntimes: Map<string, AgentRuntime>,
    options: { enabledChannels?: Array<"desktop" | "telegram">; logger?: GatewayLogger },
): MultiGateway {
    const logger = options.logger ?? console;
    const enabledChannels = new Set(options.enabledChannels ?? ["desktop", "telegram"]);
    const bots: GatewayBot[] = [];
    const desktopChannels = new Map<string, DesktopChannel>();

    if (enabledChannels.has("telegram")) {
        for (const account of config.telegramAccounts) {
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

        }
    }

    if (enabledChannels.has("desktop")) {
        for (const account of config.desktopAccounts) {
            const binding = config.bindings.find(
                (candidate) =>
                    candidate.channel === "desktop" && candidate.accountId === account.accountId,
            );

            if (!binding) {
                logger.log(
                    `[multi-gateway] no binding for desktop account "${account.accountId}", skipping`,
                );
                continue;
            }

            const agentRuntime = agentRuntimes.get(binding.agentId);
            if (!agentRuntime) {
                throw new Error(
                    `Binding references agent "${binding.agentId}" but no runtime was initialized for it.`,
                );
            }

            const desktopChannel = new DesktopChannel({
                account,
                agentRuntime,
                logger,
            });
            desktopChannels.set(account.accountId, desktopChannel);
        }
    }

    return {
        getDesktopChannel(accountId) {
            return desktopChannels.get(accountId);
        },
        async start() {
            for (const desktopChannel of desktopChannels.values()) {
                await desktopChannel.initialize();
            }
            for (const bot of bots) {
                await bot.start();
            }
        },
        async stop() {
            for (const bot of bots) {
                await bot.stop();
            }
            for (const desktopChannel of desktopChannels.values()) {
                desktopChannel.dispose();
            }
        },
    };
}
