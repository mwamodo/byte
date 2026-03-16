import assert from "node:assert/strict";
import test from "node:test";

import { DesktopChannel, DesktopChannelBusyError } from "../src/channels/desktop.ts";
import { DesktopSessionRegistry } from "../src/sessions/desktop.ts";

class MockDesktopSession {
    isStreaming = false;
    model = { id: "gpt-test", provider: "openai" };
    readonly promptCalls: string[] = [];
    readonly sessionFile: string | undefined;
    private listener?: (event: any) => void;

    constructor(sessionFile = "/tmp/desktop-session.jsonl") {
        this.sessionFile = sessionFile;
    }

    dispose(): void {}

    async prompt(text: string): Promise<void> {
        this.promptCalls.push(text);
        this.listener?.({
            type: "message_start",
            message: { role: "assistant", content: [] },
        });
        this.listener?.({
            type: "message_update",
            message: { role: "assistant", content: [] },
            assistantMessageEvent: {
                type: "text_delta",
                delta: "Hello",
            },
        });
        this.listener?.({
            type: "message_end",
            message: {
                role: "assistant",
                content: [{ type: "text", text: "Hello" }],
            },
        });
    }

    subscribe(listener: (event: any) => void): () => void {
        this.listener = listener;
        return () => {
            if (this.listener === listener) {
                this.listener = undefined;
            }
        };
    }
}

test("desktop registry reopens indexed session file", async () => {
    const session = new MockDesktopSession("/tmp/existing-desktop.jsonl");
    let openedPath: string | undefined;

    const registry = new DesktopSessionRegistry({
        fileExists: () => true,
        indexPath: "/tmp/byte-desktop-index.json",
        sessionFactory: {
            createNewSession: async () => {
                throw new Error("createNewSession should not be used");
            },
            openSession: async (sessionFile) => {
                openedPath = sessionFile;
                return session;
            },
        },
        logger: { log() {} },
    });

    ((registry as unknown) as { loadIndexEntries(): unknown }).loadIndexEntries = () => [
        {
            accountId: "default",
            key: "desktop:default",
            lastSeenAt: "2026-03-16T00:00:00.000Z",
            sessionFile: "/tmp/existing-desktop.jsonl",
        },
    ];
    ((registry as unknown) as { saveIndexEntries(entries: unknown[]): void }).saveIndexEntries = () => {};

    const activeSession = await registry.resolve("default");
    assert.equal(openedPath, "/tmp/existing-desktop.jsonl");
    assert.equal(activeSession.session.sessionFile, session.sessionFile);
});

test("desktop channel initializes once and emits streaming events", async () => {
    const session = new MockDesktopSession();
    const events: Array<{ type: string; [key: string]: unknown }> = [];

    const channel = new DesktopChannel({
        account: {
            accountId: "default",
            hotkey: "CommandOrControl+Shift+Space",
            position: "bottom-right",
        },
        agentRuntime: {
            agentId: "byte",
            config: {
                id: "byte",
                workspace: "/tmp",
                sessionsDir: "/tmp",
                provider: undefined,
                modelId: undefined,
                promptMode: "full",
                thinkingLevel: undefined,
                toolSummaryMode: "compact",
                apiKeys: undefined,
            },
            runtime: {
                authStorage: {} as never,
                modelRegistry: {} as never,
                selectedModel: undefined,
                sessionFactoryInputs: {
                    agentDir: "/tmp",
                    authStorage: {} as never,
                    cwd: "/tmp",
                    model: undefined,
                    modelRegistry: {} as never,
                    resourceLoader: {} as never,
                    tools: [] as never,
                },
            },
        },
        logger: { error() {}, log() {} },
    });

    ((channel as unknown) as { registry: { resolve(): Promise<unknown>; disposeAll(): void } }).registry = {
        resolve: async () => ({
            accountId: "default",
            isBusy: false,
            key: "desktop:default",
            session,
        }),
        disposeAll() {},
    };

    channel.subscribe((event) => events.push(event));

    await channel.initialize();
    await channel.prompt("hello");

    assert.deepEqual(session.promptCalls, ["hello"]);
    assert.equal(events[0]?.type, "agent-status");
    assert.equal(events[1]?.type, "message-start");
    assert.equal(events[2]?.type, "message-chunk");
    assert.equal(events[3]?.type, "message-done");
});

test("desktop channel rejects concurrent prompts while busy", async () => {
    const session = new MockDesktopSession();
    let releasePrompt!: () => void;
    session.prompt = async () => {
        await new Promise<void>((resolve) => {
            releasePrompt = resolve;
        });
    };

    const channel = new DesktopChannel({
        account: {
            accountId: "default",
            hotkey: "CommandOrControl+Shift+Space",
            position: "bottom-right",
        },
        agentRuntime: {
            agentId: "byte",
            config: {
                id: "byte",
                workspace: "/tmp",
                sessionsDir: "/tmp",
                provider: undefined,
                modelId: undefined,
                promptMode: "full",
                thinkingLevel: undefined,
                toolSummaryMode: "compact",
                apiKeys: undefined,
            },
            runtime: {
                authStorage: {} as never,
                modelRegistry: {} as never,
                selectedModel: undefined,
                sessionFactoryInputs: {
                    agentDir: "/tmp",
                    authStorage: {} as never,
                    cwd: "/tmp",
                    model: undefined,
                    modelRegistry: {} as never,
                    resourceLoader: {} as never,
                    tools: [] as never,
                },
            },
        },
        logger: { error() {}, log() {} },
    });

    ((channel as unknown) as { registry: { resolve(): Promise<unknown>; disposeAll(): void } }).registry = {
        resolve: async () => ({
            accountId: "default",
            isBusy: false,
            key: "desktop:default",
            session,
        }),
        disposeAll() {},
    };

    await channel.initialize();
    const firstPrompt = channel.prompt("first");

    await assert.rejects(() => channel.prompt("second"), DesktopChannelBusyError);

    releasePrompt();
    await firstPrompt;
});
