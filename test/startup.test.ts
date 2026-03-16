import assert from "node:assert/strict";
import test from "node:test";

import type { AgentRuntime } from "../src/agents.ts";
import type { MultiAgentGatewayConfig } from "../src/config.ts";
import {
    createUnifiedGatewayRuntime,
    resolvePrimaryDesktopAccount,
} from "../src/startup.ts";

function createConfig(): MultiAgentGatewayConfig {
    return {
        agents: [
            {
                id: "byte",
                workspace: "/tmp/byte",
                sessionsDir: "/tmp/byte/sessions",
                provider: "openai",
                modelId: "gpt-5",
                promptMode: "full",
                thinkingLevel: "medium",
                toolSummaryMode: "compact",
                apiKeys: undefined,
            },
            {
                id: "pi",
                workspace: "/tmp/pi",
                sessionsDir: "/tmp/pi/sessions",
                provider: undefined,
                modelId: undefined,
                promptMode: "full",
                thinkingLevel: undefined,
                toolSummaryMode: "compact",
                apiKeys: undefined,
            },
        ],
        telegramAccounts: [
            { accountId: "telegram-main", allowFrom: [], botToken: "token", replyDebounceMs: 200 },
        ],
        desktopAccounts: [
            {
                accountId: "desktop-main",
                hotkey: "CommandOrControl+Shift+Space",
                position: "bottom-right",
            },
        ],
        bindings: [
            { accountId: "desktop-main", agentId: "byte", channel: "desktop" },
            { accountId: "telegram-main", agentId: "pi", channel: "telegram" },
        ],
    };
}

function createAgentRuntimes(config: MultiAgentGatewayConfig): Map<string, AgentRuntime> {
    return new Map(
        config.agents.map((agent) => [
            agent.id,
            {
                agentId: agent.id,
                config: agent,
                runtime: {} as never,
            },
        ]),
    );
}

test("unified gateway runtime logs enabled agents and bindings before startup", async () => {
    const config = createConfig();
    const logLines: string[] = [];
    const startCalls: string[][] = [];

    const runtime = createUnifiedGatewayRuntime(config, createAgentRuntimes(config), {
        createGateway(_config, _agentRuntimes, options) {
            startCalls.push(options.enabledChannels ?? []);
            return {
                getDesktopChannel() {
                    return undefined;
                },
                async start() {},
                async stop() {},
            };
        },
        logger: {
            error() {},
            log(message: string) {
                logLines.push(message);
            },
        },
    });

    await runtime.start();

    assert.deepEqual(startCalls, [["desktop", "telegram"]]);
    assert.match(logLines[0] ?? "", /Agent: byte -> \/tmp\/byte/);
    assert.match(logLines[1] ?? "", /Agent: pi -> \/tmp\/pi/);
    assert.ok(logLines.includes("Account: desktop-main (desktop) -> agent:byte"));
    assert.ok(logLines.includes("Account: telegram-main (telegram) -> agent:pi"));
});

test("unified gateway runtime filters logging to enabled channels", async () => {
    const config = createConfig();
    const logLines: string[] = [];

    const runtime = createUnifiedGatewayRuntime(config, createAgentRuntimes(config), {
        createGateway() {
            return {
                getDesktopChannel() {
                    return undefined;
                },
                async start() {},
                async stop() {},
            };
        },
        enabledChannels: ["desktop"],
        logger: {
            error() {},
            log(message: string) {
                logLines.push(message);
            },
        },
    });

    await runtime.start();

    assert.ok(logLines.includes("Account: desktop-main (desktop) -> agent:byte"));
    assert.ok(!logLines.includes("Account: telegram-main (telegram) -> agent:pi"));
});

test("unified gateway runtime stop is idempotent", async () => {
    const config = createConfig();
    let stopCount = 0;

    const runtime = createUnifiedGatewayRuntime(config, createAgentRuntimes(config), {
        createGateway() {
            return {
                getDesktopChannel() {
                    return undefined;
                },
                async start() {},
                async stop() {
                    stopCount += 1;
                },
            };
        },
        logger: { error() {}, log() {} },
    });

    await Promise.all([runtime.stop(), runtime.stop()]);

    assert.equal(stopCount, 1);
});

test("resolvePrimaryDesktopAccount returns the first desktop binding account", () => {
    const config = createConfig();
    config.desktopAccounts.unshift({
        accountId: "desktop-secondary",
        hotkey: "CommandOrControl+Shift+K",
        position: "top-right",
    });
    config.bindings.unshift({ accountId: "desktop-secondary", agentId: "pi", channel: "desktop" });

    const account = resolvePrimaryDesktopAccount(config);

    assert.equal(account?.accountId, "desktop-secondary");
});

test("resolvePrimaryDesktopAccount returns undefined when no desktop binding exists", () => {
    const config = createConfig();
    config.bindings = config.bindings.filter((binding) => binding.channel !== "desktop");

    const account = resolvePrimaryDesktopAccount(config);

    assert.equal(account, undefined);
});

test("resolvePrimaryDesktopAccount throws when the bound desktop account is missing", () => {
    const config = createConfig();
    config.bindings[0] = { accountId: "missing", agentId: "byte", channel: "desktop" };

    assert.throws(() => resolvePrimaryDesktopAccount(config), /Desktop account "missing" could not be resolved/);
});
