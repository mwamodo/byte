import { Bot } from "grammy";
import type { UserFromGetMe } from "@grammyjs/types";

import {
    type TelegramIncomingTextMessage,
    type TelegramChannel,
    createTelegramChannel,
} from "./channels/telegram.js";
import type { GatewayConfig } from "./config.js";
import {
    type ActiveSession,
    type GatewaySession,
} from "./sessions/registry.js";

type GatewayLogger = Pick<Console, "error" | "log">;

type GatewaySessionStore<TSession extends GatewaySession = GatewaySession> = {
    disposeAll(): void;
    resolve: (incoming: TelegramIncomingTextMessage) => Promise<ActiveSession<TSession>>;
};

export type GatewayBot = {
    bot: Bot;
    telegram: TelegramChannel;
    start(): Promise<void>;
    stop(): Promise<void>;
};

export function createGatewayBot(
    config: GatewayConfig,
    dependencies: {
        botInfo?: UserFromGetMe;
        logger?: GatewayLogger;
        sessions: GatewaySessionStore;
        telegram?: TelegramChannel;
    },
): GatewayBot {
    const logger = dependencies.logger ?? console;
    const bot = new Bot(config.botToken, {
        botInfo: dependencies.botInfo,
    });
    const telegram = dependencies.telegram ?? createTelegramChannel({ api: bot.api });

    bot.on("message:text", async (ctx) => {
        try {
            if (ctx.chat.type !== "private") {
                return;
            }

            if (config.allowFrom.length > 0) {
                const senderId = ctx.from?.id;
                if (!senderId || !config.allowFrom.includes(senderId)) {
                    logger.log(`[gateway] blocked message from unauthorized user ${senderId}`);
                    return;
                }
            }

            const incoming: TelegramIncomingTextMessage = {
                chatId: ctx.chat.id,
                firstName: ctx.from?.first_name,
                messageId: ctx.message.message_id,
                text: ctx.message.text,
                updateId: ctx.update.update_id,
                userId: ctx.from?.id ?? ctx.chat.id,
                username: ctx.from?.username,
            };

            const activeSession = await dependencies.sessions.resolve(incoming);
            logger.log(
                `[gateway] message update_id=${ctx.update.update_id} session=${activeSession.key}`,
            );

            ensureSessionSubscription(activeSession, telegram, config, logger);

            if (activeSession.isBusy || activeSession.session.isStreaming) {
                await activeSession.session.followUp(incoming.text);
                const queuedAck = await safeTelegramCall(
                    logger,
                    "send queued acknowledgement",
                    async () =>
                        telegram.sendBusyQueuedAck(
                            incoming.chatId,
                            incoming.messageId,
                        ),
                );

                if (
                    queuedAck &&
                    activeSession.pendingPlaceholderMessageId === undefined
                ) {
                    activeSession.pendingPlaceholderMessageId = queuedAck.messageId;
                }

                logger.log(`[gateway] queued follow-up for ${activeSession.key}`);
                return;
            }

            activeSession.isBusy = true;
            activeSession.streamTransport = "draft";
            activeSession.draftId = incoming.updateId;
            activeSession.streamBuffer = "";
            activeSession.lastFlushedText = "";
            activeSession.hasVisibleOutput = false;
            startTypingHeartbeat(activeSession, telegram, logger);

            logger.log(`[gateway] prompt start ${activeSession.key}`);
            void runPrompt(activeSession, incoming.text, telegram, logger);
        } catch (error) {
            logger.error(`[gateway] unexpected error: ${formatError(error)}`);
        }
    });

    bot.on("message", async (ctx) => {
        if (ctx.chat.type !== "private") {
            return;
        }

        if (config.allowFrom.length > 0) {
            const senderId = ctx.from?.id;
            if (!senderId || !config.allowFrom.includes(senderId)) {
                logger.log(`[gateway] blocked message from unauthorized user ${senderId}`);
                return;
            }
        }

        if (ctx.message.text !== undefined) {
            return;
        }

        await safeTelegramCall(
            logger,
            "send text-only notice",
            async () => {
                await telegram.sendTextOnlyNotice(
                    ctx.chat.id,
                    ctx.message.message_id,
                );
            },
        );
    });

    bot.catch((err) => {
        logger.error(`[gateway] bot error: ${formatError(err.error)}`);
    });

    return {
        bot,
        telegram,
        async start() {
            logger.log("[gateway] starting...");
            bot.start({
                onStart: () => {
                    logger.log("[gateway] running");
                },
            });
        },
        async stop() {
            logger.log("[gateway] stopping...");
            bot.stop();
            dependencies.sessions.disposeAll();
        },
    };
}

function ensureSessionSubscription(
    activeSession: ActiveSession,
    telegram: TelegramChannel,
    config: GatewayConfig,
    logger: GatewayLogger,
): void {
    if (activeSession.unsubscribe) {
        return;
    }

    activeSession.unsubscribe = activeSession.session.subscribe((event) => {
        if (event.type === "message_start" && isAssistantMessage(event.message)) {
            activeSession.streamBuffer = "";
            activeSession.lastFlushedText = "";
            if (activeSession.streamTransport !== "draft") {
                ensureCurrentPlaceholder(activeSession);
            }
            return;
        }

        if (
            event.type === "message_update" &&
            isAssistantMessage(event.message) &&
            event.assistantMessageEvent.type === "text_delta"
        ) {
            if (activeSession.streamTransport !== "draft") {
                ensureCurrentPlaceholder(activeSession);
            }
            activeSession.streamBuffer += event.assistantMessageEvent.delta;
            scheduleFlush(activeSession, telegram, config.replyDebounceMs, logger);
            return;
        }

        if (event.type === "message_end" && isAssistantMessage(event.message)) {
            void finalizeAssistantMessage(activeSession, telegram, logger);
        }
    });
}

async function runPrompt(
    activeSession: ActiveSession,
    text: string,
    telegram: TelegramChannel,
    logger: GatewayLogger,
): Promise<void> {
    try {
        await activeSession.session.prompt(text);
        logger.log(`[gateway] prompt end ${activeSession.key}`);
    } catch (error) {
        logger.error(
            `[gateway] prompt failed ${activeSession.key}: ${formatError(error)}`,
        );
        stopTypingHeartbeat(activeSession);
        clearStreamState(activeSession);

        const placeholderMessageId =
            activeSession.placeholderMessageId ??
            activeSession.pendingPlaceholderMessageId;
        activeSession.placeholderMessageId = undefined;
        activeSession.pendingPlaceholderMessageId = undefined;

        if (activeSession.streamTransport === "edit" && placeholderMessageId !== undefined) {
            await safeTelegramCall(logger, "edit error reply", async () => {
                await telegram.editMessage(
                    activeSession.chatId,
                    placeholderMessageId,
                    "Sorry, something went wrong. Please try again.",
                );
            });
        } else {
            await safeTelegramCall(logger, "send error reply", async () => {
                await telegram.sendErrorReply(activeSession.chatId);
            });
        }
    } finally {
        stopTypingHeartbeat(activeSession);
        clearStreamState(activeSession);
        activeSession.isBusy = false;
        activeSession.draftId = undefined;
        activeSession.streamTransport = undefined;
        activeSession.hasVisibleOutput = undefined;
        activeSession.pendingPlaceholderMessageId = undefined;
    }
}

function scheduleFlush(
    activeSession: ActiveSession,
    telegram: TelegramChannel,
    debounceMs: number,
    logger: GatewayLogger,
): void {
    if (activeSession.flushTimer) {
        return;
    }

    activeSession.flushTimer = setTimeout(() => {
        activeSession.flushTimer = undefined;
        void flushStreamingPreview(activeSession, telegram, logger);
    }, debounceMs);
}

async function flushStreamingPreview(
    activeSession: ActiveSession,
    telegram: TelegramChannel,
    logger: GatewayLogger,
): Promise<void> {
    const preview = telegram.previewText(activeSession.streamBuffer);
    if (preview.length === 0 || preview === activeSession.lastFlushedText) {
        return;
    }

    if (activeSession.streamTransport === "draft") {
        const draftId = activeSession.draftId;
        if (draftId === undefined) {
            return;
        }

        const success = await safeTelegramCall(logger, "send draft preview", async () => {
            await telegram.sendDraft(activeSession.chatId, draftId, preview);
            return true;
        });

        if (success) {
            activeSession.hasVisibleOutput = true;
            stopTypingHeartbeat(activeSession);
            activeSession.lastFlushedText = preview;
        } else {
            logger.error("[gateway] draft failed, falling back to edit transport");
            activeSession.streamTransport = "edit";
            const currentPreview = preview.length > 0 ? preview : "Working...";
            const placeholder = await safeTelegramCall(
                logger,
                "send fallback placeholder",
                async () => telegram.sendMessage(activeSession.chatId, currentPreview),
            );
            activeSession.placeholderMessageId = placeholder?.messageId;
            activeSession.lastFlushedText = currentPreview;
        }
        return;
    }

    if (activeSession.placeholderMessageId === undefined) {
        return;
    }

    ensureCurrentPlaceholder(activeSession);
    activeSession.lastFlushedText = preview;
    await safeTelegramCall(logger, "edit streaming preview", async () => {
        await telegram.editMessage(
            activeSession.chatId,
            activeSession.placeholderMessageId as number,
            preview,
        );
    });
}

async function finalizeAssistantMessage(
    activeSession: ActiveSession,
    telegram: TelegramChannel,
    logger: GatewayLogger,
): Promise<void> {
    stopTypingHeartbeat(activeSession);

    if (activeSession.flushTimer) {
        clearTimeout(activeSession.flushTimer);
        activeSession.flushTimer = undefined;
    }

    const finalText =
        activeSession.streamBuffer.trim().length > 0 ? activeSession.streamBuffer : "Done.";
    const chunks = telegram.chunkText(finalText);

    if (activeSession.streamTransport === "draft") {
        activeSession.streamBuffer = "";
        activeSession.lastFlushedText = "";
        activeSession.draftId = undefined;
        activeSession.streamTransport = undefined;
        activeSession.hasVisibleOutput = undefined;

        for (const chunk of chunks) {
            await safeTelegramCall(logger, "send final chunk", async () => {
                await telegram.sendMessage(activeSession.chatId, chunk);
            });
        }
        return;
    }

    ensureCurrentPlaceholder(activeSession);
    const placeholderMessageId = activeSession.placeholderMessageId;

    activeSession.placeholderMessageId = undefined;
    activeSession.streamBuffer = "";
    activeSession.lastFlushedText = chunks[0] ?? "";

    if (placeholderMessageId !== undefined) {
        await safeTelegramCall(logger, "finalize assistant reply", async () => {
            await telegram.editMessage(
                activeSession.chatId,
                placeholderMessageId,
                chunks[0] ?? "Done.",
            );
        });

        for (const chunk of chunks.slice(1)) {
            await safeTelegramCall(logger, "send overflow chunk", async () => {
                await telegram.sendMessage(activeSession.chatId, chunk);
            });
        }
        return;
    }

    await safeTelegramCall(logger, "send assistant reply", async () => {
        await telegram.sendMessage(activeSession.chatId, finalText);
    });
}

function clearStreamState(activeSession: ActiveSession): void {
    stopTypingHeartbeat(activeSession);
    if (activeSession.flushTimer) {
        clearTimeout(activeSession.flushTimer);
        activeSession.flushTimer = undefined;
    }
    activeSession.streamBuffer = "";
    activeSession.lastFlushedText = "";
}

function startTypingHeartbeat(
    activeSession: ActiveSession,
    telegram: TelegramChannel,
    logger: GatewayLogger,
): void {
    safeTelegramCall(logger, "send typing", () => telegram.sendTyping(activeSession.chatId));
    activeSession.typingTimer = setInterval(() => {
        safeTelegramCall(logger, "send typing", () => telegram.sendTyping(activeSession.chatId));
    }, 4000);
}

function stopTypingHeartbeat(activeSession: ActiveSession): void {
    if (activeSession.typingTimer) {
        clearInterval(activeSession.typingTimer);
        activeSession.typingTimer = undefined;
    }
}

function ensureCurrentPlaceholder(activeSession: ActiveSession): void {
    if (
        activeSession.placeholderMessageId === undefined &&
        activeSession.pendingPlaceholderMessageId !== undefined
    ) {
        activeSession.placeholderMessageId = activeSession.pendingPlaceholderMessageId;
        activeSession.pendingPlaceholderMessageId = undefined;
    }
}

async function safeTelegramCall<T>(
    logger: GatewayLogger,
    action: string,
    fn: () => Promise<T>,
): Promise<T | undefined> {
    try {
        return await fn();
    } catch (error) {
        logger.error(`[gateway] Telegram API failure during ${action}: ${formatError(error)}`);
        return undefined;
    }
}

function isAssistantMessage(message: unknown): message is { role: "assistant" } {
    return (
        !!message &&
        typeof message === "object" &&
        "role" in message &&
        message.role === "assistant"
    );
}

function formatError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
