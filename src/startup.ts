import type { AgentRuntime } from "./agents.js";
import type {
    MultiAgentGatewayConfig,
    ResolvedBinding,
    ResolvedDesktopAccount,
} from "./config.js";
import { createMultiGateway, type MultiGateway } from "./router/multi-gateway.js";

type StartupLogger = Pick<Console, "error" | "log">;
type EnabledChannel = "desktop" | "telegram";

type GatewayFactory = (
    config: MultiAgentGatewayConfig,
    agentRuntimes: Map<string, AgentRuntime>,
    options: { enabledChannels?: EnabledChannel[]; logger?: StartupLogger },
) => MultiGateway;

export type UnifiedGatewayRuntime = {
    gateway: MultiGateway;
    start(): Promise<void>;
    stop(): Promise<void>;
};

export function createUnifiedGatewayRuntime(
    config: MultiAgentGatewayConfig,
    agentRuntimes: Map<string, AgentRuntime>,
    options: {
        createGateway?: GatewayFactory;
        enabledChannels?: EnabledChannel[];
        logger?: StartupLogger;
    } = {},
): UnifiedGatewayRuntime {
    const logger = options.logger ?? console;
    const enabledChannels = options.enabledChannels ?? ["desktop", "telegram"];
    const enabledChannelSet = new Set(enabledChannels);
    const gateway = (options.createGateway ?? createMultiGateway)(config, agentRuntimes, {
        enabledChannels,
        logger,
    });

    let startPromise: Promise<void> | undefined;
    let stopPromise: Promise<void> | undefined;

    return {
        gateway,
        async start() {
            if (startPromise) {
                return startPromise;
            }

            logStartupDetails(config, enabledChannelSet, logger);
            startPromise = gateway.start();
            await startPromise;
        },
        async stop() {
            if (stopPromise) {
                return stopPromise;
            }

            stopPromise = gateway.stop();
            await stopPromise;
        },
    };
}

export function resolvePrimaryDesktopAccount(
    config: MultiAgentGatewayConfig,
): ResolvedDesktopAccount | undefined {
    const binding = config.bindings.find((candidate) => candidate.channel === "desktop");
    if (!binding) {
        return undefined;
    }

    const account = config.desktopAccounts.find(
        (candidate) => candidate.accountId === binding.accountId,
    );
    if (!account) {
        throw new Error(`Desktop account "${binding.accountId}" could not be resolved.`);
    }

    return account;
}

function logStartupDetails(
    config: MultiAgentGatewayConfig,
    enabledChannels: Set<EnabledChannel>,
    logger: StartupLogger,
): void {
    for (const agent of config.agents) {
        logger.log(
            `Agent: ${agent.id} -> ${agent.workspace} (${agent.provider ?? "auto"}/${agent.modelId ?? "default"}, thinking: ${agent.thinkingLevel ?? "default"})`,
        );
    }

    for (const binding of config.bindings) {
        if (!enabledChannels.has(binding.channel as EnabledChannel)) {
            continue;
        }
        if (!bindingHasConfiguredAccount(config, binding)) {
            continue;
        }

        logger.log(`Account: ${binding.accountId} (${binding.channel}) -> agent:${binding.agentId}`);
    }
}

function bindingHasConfiguredAccount(
    config: MultiAgentGatewayConfig,
    binding: ResolvedBinding,
): boolean {
    if (binding.channel === "desktop") {
        return config.desktopAccounts.some((account) => account.accountId === binding.accountId);
    }

    if (binding.channel === "telegram") {
        return config.telegramAccounts.some((account) => account.accountId === binding.accountId);
    }

    return false;
}
