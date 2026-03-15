import type { Api } from "grammy";

const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;

export type TelegramIncomingTextMessage = {
    chatId: number;
    firstName?: string;
    messageId: number;
    text: string;
    updateId: number;
    userId: number;
    username?: string;
};

export type TelegramOutgoingMessage = {
    messageId: number;
    messageIds: number[];
};

export interface TelegramChannel {
    chunkText(text: string): string[];
    editMessage(chatId: number, messageId: number, text: string): Promise<void>;
    previewText(text: string): string;
    sendDraft(chatId: number, draftId: number, text: string): Promise<void>;
    sendTyping(chatId: number): Promise<void>;
    sendBusyQueuedAck(
        chatId: number,
        replyToMessageId?: number,
    ): Promise<TelegramOutgoingMessage | undefined>;
    sendErrorReply(
        chatId: number,
        replyToMessageId?: number,
    ): Promise<TelegramOutgoingMessage | undefined>;
    sendMessage(
        chatId: number,
        text: string,
        replyToMessageId?: number,
    ): Promise<TelegramOutgoingMessage | undefined>;
    sendTextOnlyNotice(
        chatId: number,
        replyToMessageId?: number,
    ): Promise<TelegramOutgoingMessage | undefined>;
}

export function chunkTelegramText(text: string): string[] {
    if (text.length <= TELEGRAM_MAX_MESSAGE_LENGTH) {
        return [text];
    }

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > TELEGRAM_MAX_MESSAGE_LENGTH) {
        const chunk = splitChunk(remaining.slice(0, TELEGRAM_MAX_MESSAGE_LENGTH));
        chunks.push(chunk);
        remaining = remaining.slice(chunk.length);
    }

    if (remaining.length > 0) {
        chunks.push(remaining);
    }

    return chunks;
}

export function createTelegramChannel(options: {
    api: Api;
}): TelegramChannel {
    const { api } = options;
    const draftApi = api as Api & {
        sendMessageDraft(chatId: number, draftId: number, text: string): Promise<unknown>;
    };

    async function sendChunkedMessage(
        chatId: number,
        text: string,
        replyToMessageId?: number,
    ): Promise<TelegramOutgoingMessage | undefined> {
        const chunks = chunkTelegramText(text);
        const messageIds: number[] = [];

        for (const [index, chunk] of chunks.entries()) {
            const result = await api.sendMessage(chatId, chunk, {
                reply_parameters: index === 0 && replyToMessageId
                    ? { message_id: replyToMessageId, allow_sending_without_reply: true }
                    : undefined,
            });
            messageIds.push(result.message_id);
        }

        if (messageIds.length === 0) {
            return undefined;
        }

        return {
            messageId: messageIds[0],
            messageIds,
        };
    }

    return {
        chunkText: chunkTelegramText,
        editMessage: async (chatId, messageId, text) => {
            const chunk = chunkTelegramText(text)[0] ?? "Done.";
            try {
                await api.editMessageText(chatId, messageId, chunk);
            } catch (error) {
                if (isMessageNotModified(error)) {
                    return;
                }
                throw error;
            }
        },
        previewText: (text) => chunkTelegramText(text)[0] ?? "",
        sendDraft: async (chatId, draftId, text) => {
            const preview = chunkTelegramText(text)[0] ?? "";
            await draftApi.sendMessageDraft(chatId, draftId, preview);
        },
        sendTyping: async (chatId) => {
            await api.sendChatAction(chatId, "typing");
        },
        sendBusyQueuedAck: (chatId, replyToMessageId) =>
            sendChunkedMessage(chatId, "Queued your message. I'll handle it next.", replyToMessageId),
        sendErrorReply: (chatId, replyToMessageId) =>
            sendChunkedMessage(
                chatId,
                "Sorry, something went wrong. Please try again.",
                replyToMessageId,
            ),
        sendMessage: (chatId, text, replyToMessageId) =>
            sendChunkedMessage(chatId, text, replyToMessageId),
        sendTextOnlyNotice: (chatId, replyToMessageId) =>
            sendChunkedMessage(
                chatId,
                "Only text messages are supported right now.",
                replyToMessageId,
            ),
    };
}

function splitChunk(text: string): string {
    const newlineIndex = text.lastIndexOf("\n");
    if (newlineIndex > TELEGRAM_MAX_MESSAGE_LENGTH / 2) {
        return text.slice(0, newlineIndex);
    }

    const whitespaceIndex = text.lastIndexOf(" ");
    if (whitespaceIndex > TELEGRAM_MAX_MESSAGE_LENGTH / 2) {
        return text.slice(0, whitespaceIndex);
    }

    return text;
}

function isMessageNotModified(error: unknown): boolean {
    return error instanceof Error && error.message.includes("message is not modified");
}
