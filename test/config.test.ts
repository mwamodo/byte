import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function runScript(script: string, env?: Record<string, string>, argv?: string[]): string {
    const args = ["--import", "tsx", "--eval", script];
    if (argv) {
        args.push("--", ...argv);
    }
    return execFileSync("node", args, {
        cwd: PROJECT_ROOT,
        env: { ...process.env, ...env },
        encoding: "utf8",
    });
}

function runScriptExpectFailure(
    script: string,
    env?: Record<string, string>,
    argv?: string[],
): string {
    const args = ["--import", "tsx", "--eval", script];
    if (argv) {
        args.push("--", ...argv);
    }

    const result = spawnSync("node", args, {
        cwd: PROJECT_ROOT,
        env: { ...process.env, ...env },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
    });

    assert.notEqual(result.status, 0, "expected script to fail");
    return `${result.stdout}${result.stderr}`;
}

async function withFakeHome(
    configContent?: Record<string, unknown>,
): Promise<{ fakeHome: string; env: Record<string, string> }> {
    const fakeHome = await mkdtemp(resolve(tmpdir(), "byte-config-"));
    const runtimeDir = resolve(fakeHome, ".byte");
    await mkdir(runtimeDir, { recursive: true });
    if (configContent) {
        await writeFile(
            resolve(runtimeDir, "byte.config.json"),
            JSON.stringify(configContent, null, 2),
        );
    }
    return { fakeHome, env: { HOME: fakeHome } };
}

test("loadGatewayConfig reads gateway settings from runtime config", async () => {
    const { env } = await withFakeHome({
        provider: "anthropic",
        model: "runtime-model",
        promptMode: "minimal",
        thinking: "low",
        telegram: {
            botToken: "bot-token",
            replyDebounceMs: 300,
        },
    });

    const script = `
        const { loadGatewayConfig } = await import("./src/config.ts");
        process.stdout.write(JSON.stringify(loadGatewayConfig()));
    `;

    const output = runScript(script, env);
    const config = JSON.parse(output) as Record<string, unknown>;
    assert.equal(config.botToken, "bot-token");
    assert.equal(config.replyDebounceMs, 300);
    assert.equal(config.provider, "anthropic");
    assert.equal(config.modelId, "runtime-model");
    assert.equal(config.promptMode, "minimal");
    assert.equal(config.thinkingLevel, "low");
});

test("loadCliConfig rejects empty api keys in runtime config", async () => {
    const { env } = await withFakeHome({ apiKeys: { openai: "" } });

    const script = `
        const { loadCliConfig } = await import("./src/config.ts");
        loadCliConfig();
    `;

    assert.match(runScriptExpectFailure(script, env), /must not be empty/);
});

// --- CLI mode resolution tests ---

test("no prompt => mode is tui, sessionTarget is new", async () => {
    const { env } = await withFakeHome({});

    const script = `
        const { loadCliConfig } = await import("./src/config.ts");
        const config = loadCliConfig();
        process.stdout.write(JSON.stringify({ mode: config.mode, sessionTarget: config.sessionTarget }));
    `;

    const output = runScript(script, env);
    const config = JSON.parse(output) as { mode: string; sessionTarget: { kind: string } };
    assert.equal(config.mode, "tui");
    assert.equal(config.sessionTarget.kind, "new");
});

test("positional prompt => mode is print", async () => {
    const { env } = await withFakeHome({});

    const script = `
        const { loadCliConfig } = await import("./src/config.ts");
        const config = loadCliConfig();
        process.stdout.write(JSON.stringify({ mode: config.mode, prompt: config.prompt }));
    `;

    const output = runScript(script, env, ["hello", "world"]);
    const config = JSON.parse(output) as { mode: string; prompt: string };
    assert.equal(config.mode, "print");
    assert.equal(config.prompt, "hello world");
});

test("--prompt flag => mode is print", async () => {
    const { env } = await withFakeHome({});

    const script = `
        const { loadCliConfig } = await import("./src/config.ts");
        const config = loadCliConfig();
        process.stdout.write(JSON.stringify({ mode: config.mode, prompt: config.prompt }));
    `;

    const output = runScript(script, env, ["--prompt", "test prompt"]);
    const config = JSON.parse(output) as { mode: string; prompt: string };
    assert.equal(config.mode, "print");
    assert.equal(config.prompt, "test prompt");
});

test("print mode with no flags => sessionTarget is memory", async () => {
    const { env } = await withFakeHome({});

    const script = `
        const { loadCliConfig } = await import("./src/config.ts");
        const config = loadCliConfig();
        process.stdout.write(JSON.stringify(config.sessionTarget));
    `;

    const output = runScript(script, env, ["--prompt", "hi"]);
    const target = JSON.parse(output) as { kind: string };
    assert.equal(target.kind, "memory");
});

test("--resume with no value => sessionTarget is resume-recent", async () => {
    const { env } = await withFakeHome({});

    const script = `
        const { loadCliConfig } = await import("./src/config.ts");
        const config = loadCliConfig();
        process.stdout.write(JSON.stringify(config.sessionTarget));
    `;

    const output = runScript(script, env, ["--resume"]);
    const target = JSON.parse(output) as { kind: string };
    assert.equal(target.kind, "resume-recent");
});

test("--resume <id> => sessionTarget is resume-id with correct sessionId", async () => {
    const { env } = await withFakeHome({});
    const testId = "abc-123-def";

    const script = `
        const { loadCliConfig } = await import("./src/config.ts");
        const config = loadCliConfig();
        process.stdout.write(JSON.stringify(config.sessionTarget));
    `;

    const output = runScript(script, env, ["--resume", testId]);
    const target = JSON.parse(output) as { kind: string; sessionId: string };
    assert.equal(target.kind, "resume-id");
    assert.equal(target.sessionId, testId);
});

test("--memory => sessionTarget is memory", async () => {
    const { env } = await withFakeHome({});

    const script = `
        const { loadCliConfig } = await import("./src/config.ts");
        const config = loadCliConfig();
        process.stdout.write(JSON.stringify(config.sessionTarget));
    `;

    const output = runScript(script, env, ["--memory"]);
    const target = JSON.parse(output) as { kind: string };
    assert.equal(target.kind, "memory");
});

test("--resume + --memory => throws error", async () => {
    const { env } = await withFakeHome({});

    const script = `
        const { loadCliConfig } = await import("./src/config.ts");
        loadCliConfig();
    `;

    assert.match(
        runScriptExpectFailure(script, env, ["--resume", "some-id", "--memory"]),
        /Cannot combine --resume with --memory/,
    );
});

test("--interactive + prompt => throws clear error", async () => {
    const { env } = await withFakeHome({});

    const script = `
        const { loadCliConfig } = await import("./src/config.ts");
        loadCliConfig();
    `;

    assert.match(
        runScriptExpectFailure(script, env, ["--interactive", "--prompt", "hi"]),
        /Cannot combine --interactive with a prompt/,
    );
});

test("loadCliConfig reads promptMode from runtime config", async () => {
    const { env } = await withFakeHome({ promptMode: "minimal" });

    const script = `
        const { loadCliConfig } = await import("./src/config.ts");
        process.stdout.write(loadCliConfig().promptMode);
    `;

    const output = runScript(script, env);
    assert.equal(output, "minimal");
});

test("CLI --prompt-mode overrides runtime config", async () => {
    const { env } = await withFakeHome({ promptMode: "minimal" });

    const script = `
        const { loadCliConfig } = await import("./src/config.ts");
        process.stdout.write(loadCliConfig().promptMode);
    `;

    const output = runScript(script, env, ["--prompt-mode", "none"]);
    assert.equal(output, "none");
});

test("loadGatewayConfig defaults promptMode to full", async () => {
    const { env } = await withFakeHome({
        telegram: {
            botToken: "bot-token",
        },
    });

    const script = `
        const { loadGatewayConfig } = await import("./src/config.ts");
        process.stdout.write(loadGatewayConfig().promptMode);
    `;

    const output = runScript(script, env);
    assert.equal(output, "full");
});

test("invalid promptMode throws a clear validation error", async () => {
    const { env } = await withFakeHome({ promptMode: "verbose" });

    const script = `
        const { loadGatewayConfig } = await import("./src/config.ts");
        loadGatewayConfig();
    `;

    assert.match(
        runScriptExpectFailure(script, env),
        /Unsupported prompt mode "verbose". Use full, minimal, or none./,
    );
});

// --- Multi-agent config tests ---

test("loadMultiAgentGatewayConfig: legacy config produces single agent/account/binding", async () => {
    const { env } = await withFakeHome({
        provider: "anthropic",
        model: "test-model",
        telegram: {
            botToken: "legacy-token",
            allowFrom: [111],
            replyDebounceMs: 150,
        },
    });

    const script = `
        const { loadMultiAgentGatewayConfig } = await import("./src/config.ts");
        process.stdout.write(JSON.stringify(loadMultiAgentGatewayConfig()));
    `;

    const output = runScript(script, env);
    const config = JSON.parse(output);

    assert.equal(config.agents.length, 1);
    assert.equal(config.agents[0].id, "byte");
    assert.ok(config.agents[0].workspace.endsWith("/workspace"));

    assert.equal(config.accounts.length, 1);
    assert.equal(config.accounts[0].accountId, "default");
    assert.equal(config.accounts[0].botToken, "legacy-token");
    assert.deepEqual(config.accounts[0].allowFrom, [111]);
    assert.equal(config.accounts[0].replyDebounceMs, 150);

    assert.equal(config.bindings.length, 1);
    assert.equal(config.bindings[0].agentId, "byte");
    assert.equal(config.bindings[0].channel, "telegram");
    assert.equal(config.bindings[0].accountId, "default");

    assert.equal(config.agents[0].provider, "anthropic");
    assert.equal(config.agents[0].modelId, "test-model");
});

test("loadMultiAgentGatewayConfig: multi-agent config parses correctly", async () => {
    const { env } = await withFakeHome({
        agents: {
            list: [
                { id: "byte" },
                { id: "alerts" },
            ],
        },
        bindings: [
            { agentId: "byte", match: { channel: "telegram", accountId: "default" } },
            { agentId: "alerts", match: { channel: "telegram", accountId: "alerts-bot" } },
        ],
        channels: {
            telegram: {
                accounts: {
                    default: { botToken: "tok-1", allowFrom: [1] },
                    "alerts-bot": { botToken: "tok-2" },
                },
            },
        },
    });

    const script = `
        const { loadMultiAgentGatewayConfig } = await import("./src/config.ts");
        process.stdout.write(JSON.stringify(loadMultiAgentGatewayConfig()));
    `;

    const output = runScript(script, env);
    const config = JSON.parse(output);

    assert.equal(config.agents.length, 2);
    assert.equal(config.agents[0].id, "byte");
    assert.ok(config.agents[0].workspace.endsWith("/workspace"));
    assert.equal(config.agents[1].id, "alerts");
    assert.ok(config.agents[1].workspace.endsWith("/workspace-alerts"));
    assert.ok(config.agents[0].sessionsDir.endsWith("/sessions/byte"));
    assert.ok(config.agents[1].sessionsDir.endsWith("/sessions/alerts"));

    assert.equal(config.accounts.length, 2);
    assert.equal(config.bindings.length, 2);
});

test("loadMultiAgentGatewayConfig: binding references unknown agent throws", async () => {
    const { env } = await withFakeHome({
        agents: { list: [{ id: "byte" }] },
        bindings: [
            { agentId: "nonexistent", match: { channel: "telegram", accountId: "default" } },
        ],
        channels: {
            telegram: { accounts: { default: { botToken: "tok" } } },
        },
    });

    const script = `
        const { loadMultiAgentGatewayConfig } = await import("./src/config.ts");
        loadMultiAgentGatewayConfig();
    `;

    assert.match(
        runScriptExpectFailure(script, env),
        /unknown agent "nonexistent"/,
    );
});

test("loadMultiAgentGatewayConfig: binding references unknown account throws", async () => {
    const { env } = await withFakeHome({
        agents: { list: [{ id: "byte" }] },
        bindings: [
            { agentId: "byte", match: { channel: "telegram", accountId: "missing" } },
        ],
        channels: {
            telegram: { accounts: { default: { botToken: "tok" } } },
        },
    });

    const script = `
        const { loadMultiAgentGatewayConfig } = await import("./src/config.ts");
        loadMultiAgentGatewayConfig();
    `;

    assert.match(
        runScriptExpectFailure(script, env),
        /unknown account "missing"/,
    );
});

// --- Stub flag tests ---

test("--app exits non-zero with not-implemented message", async () => {
    const { env } = await withFakeHome({});

    const script = `
        const { loadCliConfig } = await import("./src/config.ts");
        loadCliConfig();
    `;

    const output = runScriptExpectFailure(script, env, ["--app"]);
    assert.match(output, /not implemented yet/i);
});

test("--gateway exits non-zero with not-implemented message", async () => {
    const { env } = await withFakeHome({});

    const script = `
        const { loadCliConfig } = await import("./src/config.ts");
        loadCliConfig();
    `;

    const output = runScriptExpectFailure(script, env, ["--gateway"]);
    assert.match(output, /not implemented yet/i);
});

// --- CLI help test ---

test("byte --help prints byte-branded usage", async () => {
    const { env } = await withFakeHome({});

    const script = `
        const { printHelp } = await import("./src/config.ts");
        printHelp();
    `;

    const output = runScript(script, env);
    assert.match(output, /byte/);
    assert.match(output, /byte\.config\.json/);
    assert.match(output, /--app/);
    assert.match(output, /--gateway/);
});
