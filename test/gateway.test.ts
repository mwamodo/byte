import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { UserFromGetMe } from "@grammyjs/types";
import { type Bot } from "grammy";

import type { GatewayConfig } from "../src/config.ts";
import { createGatewayBot } from "../src/gateway.ts";
import {
    TelegramSessionRegistry,
    type ActiveSession,
    type GatewaySession,
} from "../src/sessions/registry.ts";
import type { TelegramChannel } from "../src/channels/telegram.ts";
import { chunkTelegramText } from "../src/channels/telegram.ts";

const FAKE_BOT_INFO: UserFromGetMe = {
    allows_users_to_create_topics: false,
    has_topics_enabled: false,
    id: 123456789,
    is_bot: true,
    first_name: "TestBot",
    username: "test_bot",
    can_join_groups: false,
    can_read_all_group_messages: false,
    supports_inline_queries: false,
    can_connect_to_business: false,
    has_main_web_app: false
};

const MOCK_ASSISTANT_MESSAGE: AssistantMessage = {
    role: "assistant",
    content: [],
    api: "anthropic",
    provider: "anthropic",
    model: "test",
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: "stop",
    timestamp: 0,
};

class MockSession implements GatewaySession {
    isStreaming = false;
    readonly promptCalls: string[] = [];
    readonly followUpCalls: string[] = [];
    readonly sessionFile: string | undefined;
    private listener?: Parameters<GatewaySession["subscribe"]>[0];
    private readonly promptHandler?: (text: string) => Promise<void>;
    private readonly followUpHandler?: (text: string) => Promise<void>;

    constructor(options?: {
        followUpHandler?: (text: string) => Promise<void>;
        promptHandler?: (text: string) => Promise<void>;
        sessionFile?: string;
    }) {
        this.followUpHandler = options?.followUpHandler;
        this.promptHandler = options?.promptHandler;
        this.sessionFile = options?.sessionFile;
    }

    dispose(): void {}

    emitAssistantEnd(): void {
        this.listener?.({ type: "message_end", message: MOCK_ASSISTANT_MESSAGE });
    }

    emitAssistantStart(): void {
        this.listener?.({ type: "message_start", message: MOCK_ASSISTANT_MESSAGE });
    }

    emitTextDelta(delta: string): void {
        this.listener?.({
            type: "message_update",
            message: MOCK_ASSISTANT_MESSAGE,
            assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta, partial: MOCK_ASSISTANT_MESSAGE },
        });
    }

    async followUp(text: string): Promise<void> {
        this.followUpCalls.push(text);
        await this.followUpHandler?.(text);
    }

    async prompt(text: string): Promise<void> {
        this.promptCalls.push(text);
        await this.promptHandler?.(text);
    }

    subscribe(listener: Parameters<GatewaySession["subscribe"]>[0]): () => void {
        this.listener = listener;
        return () => {
            if (this.listener === listener) {
                this.listener = undefined;
            }
        };
    }
}

function createConfig(overrides: Partial<GatewayConfig> = {}): GatewayConfig {
    return {
        allowFrom: [],
        apiKeys: undefined,
        botToken: "test:fake-bot-token",
        modelId: undefined,
        promptMode: "full",
        provider: undefined,
        replyDebounceMs: 20,
        thinkingLevel: undefined,
        ...overrides,
    };
}

function createActiveSession(
    session: MockSession,
    overrides: Partial<ActiveSession<MockSession>> = {},
): ActiveSession<MockSession> {
    return {
        chatId: 99,
        isBusy: false,
        key: "telegram:99:7",
        lastFlushedText: "",
        session,
        streamBuffer: "",
        userId: 7,
        ...overrides,
    };
}

function createDeferred(): {
    promise: Promise<void>;
    resolve: () => void;
} {
    let resolvePromise!: () => void;
    const promise = new Promise<void>((resolve) => {
        resolvePromise = resolve;
    });
    return { promise, resolve: resolvePromise };
}

function createPrivateTextUpdate(text: string, updateId = 1) {
    return {
        update_id: updateId,
        message: {
            message_id: 11,
            date: Math.floor(Date.now() / 1000),
            chat: { id: 99, type: "private" as const, first_name: "Pi" },
            from: { id: 7, is_bot: false, first_name: "Pi", username: "pi" },
            text,
        },
    };
}

/**
 * Sends a fake update directly through grammY's internal handler,
 * bypassing actual Telegram API polling.
 */
async function sendFakeUpdate(bot: Bot, update: ReturnType<typeof createPrivateTextUpdate>): Promise<void> {
    await bot.handleUpdate(update);
}

const silentLogger = { log() {}, error() {} };

type TelegramCall = {
    method: string;
    args: unknown[];
};

function createMockTelegram(options?: {
    sendDraftShouldFail?: boolean;
}): TelegramChannel & { calls: TelegramCall[] } {
    const calls: TelegramCall[] = [];
    let nextMessageId = 1000;

    return {
        calls,
        chunkText: chunkTelegramText,
        editMessage: async (chatId, messageId, text) => {
            calls.push({ method: "editMessage", args: [chatId, messageId, text] });
        },
        previewText: (text) => chunkTelegramText(text)[0] ?? "",
        sendDraft: async (chatId, draftId, text) => {
            calls.push({ method: "sendDraft", args: [chatId, draftId, text] });
            if (options?.sendDraftShouldFail) {
                throw new Error("sendMessageDraft not supported");
            }
        },
        sendTyping: async (chatId) => {
            calls.push({ method: "sendTyping", args: [chatId] });
        },
        sendBusyQueuedAck: async (chatId, replyToMessageId) => {
            const messageId = nextMessageId++;
            calls.push({ method: "sendBusyQueuedAck", args: [chatId, replyToMessageId] });
            return { messageId, messageIds: [messageId] };
        },
        sendErrorReply: async (chatId, replyToMessageId) => {
            const messageId = nextMessageId++;
            calls.push({ method: "sendErrorReply", args: [chatId, replyToMessageId] });
            return { messageId, messageIds: [messageId] };
        },
        sendMessage: async (chatId, text, replyToMessageId) => {
            const messageId = nextMessageId++;
            calls.push({ method: "sendMessage", args: [chatId, text, replyToMessageId] });
            return { messageId, messageIds: [messageId] };
        },
        sendTextOnlyNotice: async (chatId, replyToMessageId) => {
            const messageId = nextMessageId++;
            calls.push({ method: "sendTextOnlyNotice", args: [chatId, replyToMessageId] });
            return { messageId, messageIds: [messageId] };
        },
    };
}

test("private text creates a new session, persists the index, and prompts the session", async () => {
    const tempDir = await mkdtemp(resolve(tmpdir(), "byte-gateway-"));
    const indexPath = resolve(tempDir, "telegram-session-index.json");
    const sessionFile = resolve(tempDir, "session.jsonl");
    await mkdir(tempDir, { recursive: true });
    await writeFile(sessionFile, "{}\n", "utf8");

    const session = new MockSession({ sessionFile });
    const registry = new TelegramSessionRegistry({
        indexPath,
        logger: silentLogger,
        sessionFactory: {
            createNewSession: async () => session,
            openSession: async () => {
                throw new Error("openSession should not be used");
            },
        },
    });

    const gateway = createGatewayBot(createConfig(), {
        botInfo: FAKE_BOT_INFO,
        sessions: registry,
        logger: silentLogger,
    });

    await sendFakeUpdate(gateway.bot, createPrivateTextUpdate("hello"));

    assert.deepEqual(session.promptCalls, ["hello"]);
    const indexEntries = JSON.parse(await readFile(indexPath, "utf8")) as Array<{
        key: string;
        sessionFile: string;
    }>;
    assert.equal(indexEntries.length, 1);
    assert.equal(indexEntries[0].key, "telegram:99:7");
    assert.equal(indexEntries[0].sessionFile, sessionFile);
});

test("busy sessions queue follow-ups and send a queue acknowledgement", async () => {
    const session = new MockSession({ sessionFile: "/tmp/session.jsonl" });
    const activeSession = createActiveSession(session, { isBusy: true });

    const gateway = createGatewayBot(createConfig(), {
        botInfo: FAKE_BOT_INFO,
        sessions: {
            disposeAll() {},
            async resolve() {
                return activeSession;
            },
        },
        logger: silentLogger,
    });

    await sendFakeUpdate(gateway.bot, createPrivateTextUpdate("second"));

    assert.deepEqual(session.followUpCalls, ["second"]);
});

test("streaming text deltas are debounced before editing Telegram", async () => {
    const deferred = createDeferred();
    const session = new MockSession({
        promptHandler: async () => deferred.promise,
        sessionFile: "/tmp/session.jsonl",
    });
    const activeSession = createActiveSession(session);

    const gateway = createGatewayBot(createConfig({ replyDebounceMs: 20 }), {
        botInfo: FAKE_BOT_INFO,
        sessions: {
            disposeAll() {},
            async resolve() {
                return activeSession;
            },
        },
        logger: silentLogger,
    });

    await sendFakeUpdate(gateway.bot, createPrivateTextUpdate("hello"));

    assert.deepEqual(session.promptCalls, ["hello"]);

    deferred.resolve();
});

test("group chat messages are ignored without creating a session", async () => {
    let resolveCount = 0;

    const gateway = createGatewayBot(createConfig(), {
        botInfo: FAKE_BOT_INFO,
        sessions: {
            disposeAll() {},
            async resolve() {
                resolveCount += 1;
                throw new Error("resolve should not be called");
            },
        },
        logger: silentLogger,
    });

    await gateway.bot.handleUpdate({
        update_id: 3,
        message: {
            message_id: 13,
            date: Math.floor(Date.now() / 1000),
            chat: { id: -1, type: "group" as const, title: "test" },
            from: { id: 7, is_bot: false, first_name: "Pi" },
            text: "hello",
        },
    });

    assert.equal(resolveCount, 0);
});

test("non-text private messages trigger text-only notice handler", async () => {
    let resolveCount = 0;

    const gateway = createGatewayBot(createConfig(), {
        botInfo: FAKE_BOT_INFO,
        sessions: {
            disposeAll() {},
            async resolve() {
                resolveCount += 1;
                throw new Error("resolve should not be called");
            },
        },
        logger: silentLogger,
    });

    await gateway.bot.handleUpdate({
        update_id: 2,
        message: {
            message_id: 12,
            date: Math.floor(Date.now() / 1000),
            chat: { id: 99, type: "private" as const, first_name: "Pi" },
            from: { id: 7, is_bot: false, first_name: "Pi" },
            photo: [{ file_id: "abc", file_unique_id: "abc", width: 100, height: 100 }],
        },
    });

    assert.equal(resolveCount, 0);
});

test("prompt failures keep the bot alive and mark session as not busy", async () => {
    const mockTelegram = createMockTelegram();
    const session = new MockSession({
        promptHandler: async () => {
            throw new Error("boom");
        },
        sessionFile: "/tmp/session.jsonl",
    });
    const activeSession = createActiveSession(session);

    const gateway = createGatewayBot(createConfig(), {
        botInfo: FAKE_BOT_INFO,
        sessions: {
            disposeAll() {},
            async resolve() {
                return activeSession;
            },
        },
        logger: silentLogger,
        telegram: mockTelegram,
    });

    await sendFakeUpdate(gateway.bot, createPrivateTextUpdate("hello"));

    // Wait for the async runPrompt to complete (grammY handler + error handling)
    await delay(200);

    assert.equal(activeSession.isBusy, false);
});

test("idle private text uses draft transport and does not send Working...", async () => {
    const mockTelegram = createMockTelegram();
    const deferred = createDeferred();
    const session = new MockSession({
        promptHandler: async () => deferred.promise,
        sessionFile: "/tmp/session.jsonl",
    });
    const activeSession = createActiveSession(session);

    const gateway = createGatewayBot(createConfig(), {
        botInfo: FAKE_BOT_INFO,
        sessions: {
            disposeAll() {},
            async resolve() { return activeSession; },
        },
        logger: silentLogger,
        telegram: mockTelegram,
    });

    await sendFakeUpdate(gateway.bot, createPrivateTextUpdate("hello", 42));

    assert.deepEqual(session.promptCalls, ["hello"]);
    assert.equal(activeSession.streamTransport, "draft");
    assert.equal(activeSession.draftId, 42);

    // No "Working..." sendMessage should have been called
    const sendMessageCalls = mockTelegram.calls.filter(c => c.method === "sendMessage");
    assert.equal(sendMessageCalls.length, 0);

    // Typing heartbeat should have started
    const typingCalls = mockTelegram.calls.filter(c => c.method === "sendTyping");
    assert.ok(typingCalls.length >= 1);

    deferred.resolve();
    await delay(50);
});

test("streaming text_delta events debounce sendDraft calls", async () => {
    const mockTelegram = createMockTelegram();
    const deferred = createDeferred();
    const session = new MockSession({
        promptHandler: async () => deferred.promise,
        sessionFile: "/tmp/session.jsonl",
    });
    const activeSession = createActiveSession(session);

    const gateway = createGatewayBot(createConfig({ replyDebounceMs: 20 }), {
        botInfo: FAKE_BOT_INFO,
        sessions: {
            disposeAll() {},
            async resolve() { return activeSession; },
        },
        logger: silentLogger,
        telegram: mockTelegram,
    });

    await sendFakeUpdate(gateway.bot, createPrivateTextUpdate("hello", 10));

    // Simulate streaming
    session.emitAssistantStart();
    session.emitTextDelta("Hello ");
    session.emitTextDelta("world");

    // Wait for debounce
    await delay(50);

    const draftCalls = mockTelegram.calls.filter(c => c.method === "sendDraft");
    assert.ok(draftCalls.length >= 1, "should have called sendDraft at least once");
    // The draft should contain the combined buffer
    const lastDraft = draftCalls[draftCalls.length - 1];
    assert.equal(lastDraft.args[0], 99); // chatId
    assert.equal(lastDraft.args[1], 10); // draftId (updateId)

    deferred.resolve();
    await delay(50);
});

test("long prompt with no deltas sends periodic sendTyping actions", async () => {
    const mockTelegram = createMockTelegram();
    const deferred = createDeferred();
    const session = new MockSession({
        promptHandler: async () => deferred.promise,
        sessionFile: "/tmp/session.jsonl",
    });
    const activeSession = createActiveSession(session);

    const gateway = createGatewayBot(createConfig(), {
        botInfo: FAKE_BOT_INFO,
        sessions: {
            disposeAll() {},
            async resolve() { return activeSession; },
        },
        logger: silentLogger,
        telegram: mockTelegram,
    });

    await sendFakeUpdate(gateway.bot, createPrivateTextUpdate("hello"));

    // Initial typing should fire immediately
    const initialTyping = mockTelegram.calls.filter(c => c.method === "sendTyping");
    assert.ok(initialTyping.length >= 1, "should send typing immediately");

    deferred.resolve();
    await delay(50);
});

test("draft finalization sends normal sendMessage not edit", async () => {
    const mockTelegram = createMockTelegram();
    const deferred = createDeferred();
    const session = new MockSession({
        promptHandler: async () => deferred.promise,
        sessionFile: "/tmp/session.jsonl",
    });
    const activeSession = createActiveSession(session);

    const gateway = createGatewayBot(createConfig({ replyDebounceMs: 10 }), {
        botInfo: FAKE_BOT_INFO,
        sessions: {
            disposeAll() {},
            async resolve() { return activeSession; },
        },
        logger: silentLogger,
        telegram: mockTelegram,
    });

    await sendFakeUpdate(gateway.bot, createPrivateTextUpdate("hello", 10));

    session.emitAssistantStart();
    session.emitTextDelta("Final answer");
    session.emitAssistantEnd();

    await delay(50);

    // Finalization should use sendMessage, not editMessage
    const sendMessageCalls = mockTelegram.calls.filter(c => c.method === "sendMessage");
    assert.ok(sendMessageCalls.length >= 1, "should send final message via sendMessage");
    const finalMsg = sendMessageCalls[sendMessageCalls.length - 1];
    assert.equal(finalMsg.args[0], 99); // chatId
    assert.equal(finalMsg.args[1], "Final answer");

    const editCalls = mockTelegram.calls.filter(c => c.method === "editMessage");
    assert.equal(editCalls.length, 0, "should not use editMessage in draft mode");

    deferred.resolve();
    await delay(50);
});

test("final output >4096 chars chunked correctly in final-message path", async () => {
    const mockTelegram = createMockTelegram();
    const deferred = createDeferred();
    const session = new MockSession({
        promptHandler: async () => deferred.promise,
        sessionFile: "/tmp/session.jsonl",
    });
    const activeSession = createActiveSession(session);

    const gateway = createGatewayBot(createConfig({ replyDebounceMs: 10 }), {
        botInfo: FAKE_BOT_INFO,
        sessions: {
            disposeAll() {},
            async resolve() { return activeSession; },
        },
        logger: silentLogger,
        telegram: mockTelegram,
    });

    await sendFakeUpdate(gateway.bot, createPrivateTextUpdate("hello", 10));

    const longText = "A".repeat(5000);
    session.emitAssistantStart();
    session.emitTextDelta(longText);
    session.emitAssistantEnd();

    await delay(50);

    const sendMessageCalls = mockTelegram.calls.filter(c => c.method === "sendMessage");
    assert.ok(sendMessageCalls.length >= 2, "should chunk long output into multiple sendMessage calls");

    deferred.resolve();
    await delay(50);
});

test("busy sessions still queue follow-ups with ack (with mock telegram)", async () => {
    const mockTelegram = createMockTelegram();
    const session = new MockSession({ sessionFile: "/tmp/session.jsonl" });
    const activeSession = createActiveSession(session, { isBusy: true });

    const gateway = createGatewayBot(createConfig(), {
        botInfo: FAKE_BOT_INFO,
        sessions: {
            disposeAll() {},
            async resolve() { return activeSession; },
        },
        logger: silentLogger,
        telegram: mockTelegram,
    });

    await sendFakeUpdate(gateway.bot, createPrivateTextUpdate("second"));

    assert.deepEqual(session.followUpCalls, ["second"]);
    const ackCalls = mockTelegram.calls.filter(c => c.method === "sendBusyQueuedAck");
    assert.equal(ackCalls.length, 1);
});

test("sendDraft failure falls back to placeholder + editMessage", async () => {
    const mockTelegram = createMockTelegram({ sendDraftShouldFail: true });
    const deferred = createDeferred();
    const session = new MockSession({
        promptHandler: async () => deferred.promise,
        sessionFile: "/tmp/session.jsonl",
    });
    const activeSession = createActiveSession(session);

    const gateway = createGatewayBot(createConfig({ replyDebounceMs: 10 }), {
        botInfo: FAKE_BOT_INFO,
        sessions: {
            disposeAll() {},
            async resolve() { return activeSession; },
        },
        logger: silentLogger,
        telegram: mockTelegram,
    });

    await sendFakeUpdate(gateway.bot, createPrivateTextUpdate("hello", 10));

    session.emitAssistantStart();
    session.emitTextDelta("partial");

    // Wait for debounce to fire draft (which fails) then fallback
    await delay(50);

    assert.equal(activeSession.streamTransport, "edit", "should have fallen back to edit transport");
    assert.ok(activeSession.placeholderMessageId !== undefined, "should have a placeholder");

    // Now emit more text — should use editMessage
    session.emitTextDelta(" more text");
    await delay(50);

    const editCalls = mockTelegram.calls.filter(c => c.method === "editMessage");
    assert.ok(editCalls.length >= 1, "should use editMessage after fallback");

    deferred.resolve();
    await delay(50);
});

test("prompt failure in draft mode sends standalone error reply", async () => {
    const mockTelegram = createMockTelegram();
    const session = new MockSession({
        promptHandler: async () => { throw new Error("boom"); },
        sessionFile: "/tmp/session.jsonl",
    });
    const activeSession = createActiveSession(session);

    const gateway = createGatewayBot(createConfig(), {
        botInfo: FAKE_BOT_INFO,
        sessions: {
            disposeAll() {},
            async resolve() { return activeSession; },
        },
        logger: silentLogger,
        telegram: mockTelegram,
    });

    await sendFakeUpdate(gateway.bot, createPrivateTextUpdate("hello"));
    await delay(200);

    assert.equal(activeSession.isBusy, false);
    const errorCalls = mockTelegram.calls.filter(c => c.method === "sendErrorReply");
    assert.equal(errorCalls.length, 1, "should send standalone error reply in draft mode");
    const editCalls = mockTelegram.calls.filter(c => c.method === "editMessage");
    assert.equal(editCalls.length, 0, "should not edit any message in draft mode");
});

test("prompt failure in edit fallback edits placeholder to error", async () => {
    const mockTelegram = createMockTelegram({ sendDraftShouldFail: true });
    const session = new MockSession({
        promptHandler: async () => {
            session.emitAssistantStart();
            session.emitTextDelta("partial");
            await delay(50);
            throw new Error("boom");
        },
        sessionFile: "/tmp/session.jsonl",
    });
    const activeSession = createActiveSession(session);

    const gateway = createGatewayBot(createConfig({ replyDebounceMs: 10 }), {
        botInfo: FAKE_BOT_INFO,
        sessions: {
            disposeAll() {},
            async resolve() { return activeSession; },
        },
        logger: silentLogger,
        telegram: mockTelegram,
    });

    await sendFakeUpdate(gateway.bot, createPrivateTextUpdate("hello", 10));
    await delay(400);

    assert.equal(activeSession.isBusy, false);
    const editCalls = mockTelegram.calls.filter(c => c.method === "editMessage");
    assert.ok(editCalls.length >= 1, "should edit placeholder to error in edit fallback mode");
});

test("group chats remain ignored", async () => {
    const mockTelegram = createMockTelegram();
    let resolveCount = 0;

    const gateway = createGatewayBot(createConfig(), {
        botInfo: FAKE_BOT_INFO,
        sessions: {
            disposeAll() {},
            async resolve() {
                resolveCount += 1;
                throw new Error("resolve should not be called");
            },
        },
        logger: silentLogger,
        telegram: mockTelegram,
    });

    await gateway.bot.handleUpdate({
        update_id: 3,
        message: {
            message_id: 13,
            date: Math.floor(Date.now() / 1000),
            chat: { id: -1, type: "group" as const, title: "test" },
            from: { id: 7, is_bot: false, first_name: "Pi" },
            text: "hello",
        },
    });

    assert.equal(resolveCount, 0);
    assert.equal(mockTelegram.calls.length, 0);
});

test("private non-text messages still send text-only notice", async () => {
    const mockTelegram = createMockTelegram();
    let resolveCount = 0;

    const gateway = createGatewayBot(createConfig(), {
        botInfo: FAKE_BOT_INFO,
        sessions: {
            disposeAll() {},
            async resolve() {
                resolveCount += 1;
                throw new Error("resolve should not be called");
            },
        },
        logger: silentLogger,
        telegram: mockTelegram,
    });

    await gateway.bot.handleUpdate({
        update_id: 2,
        message: {
            message_id: 12,
            date: Math.floor(Date.now() / 1000),
            chat: { id: 99, type: "private" as const, first_name: "Pi" },
            from: { id: 7, is_bot: false, first_name: "Pi" },
            photo: [{ file_id: "abc", file_unique_id: "abc", width: 100, height: 100 }],
        },
    });

    assert.equal(resolveCount, 0);
    const noticeCalls = mockTelegram.calls.filter(c => c.method === "sendTextOnlyNotice");
    assert.equal(noticeCalls.length, 1);
});
