import {
    existsSync,
    readFileSync,
    writeFileSync,
} from "node:fs";

import type { AgentSessionEvent } from "@mariozechner/pi-coding-agent";

import {
    TELEGRAM_SESSION_INDEX_PATH,
} from "../config.js";
import type { TelegramIncomingTextMessage } from "../channels/telegram.js";

export type TelegramSessionIndexEntry = {
    chatId: number;
    firstName?: string;
    key: string;
    lastSeenAt: string;
    sessionFile: string;
    userId: number;
    username?: string;
};

export interface GatewaySession {
    readonly isStreaming: boolean;
    readonly sessionFile: string | undefined;
    dispose(): void;
    followUp(text: string): Promise<void>;
    prompt(text: string): Promise<void>;
    subscribe(listener: (event: AgentSessionEvent) => void): () => void;
}

export type ActiveSession<TSession extends GatewaySession = GatewaySession> = {
    chatId: number;
    draftId?: number;
    flushTimer?: NodeJS.Timeout;
    hasVisibleOutput?: boolean;
    isBusy: boolean;
    key: string;
    lastFlushedText: string;
    pendingPlaceholderMessageId?: number;
    placeholderMessageId?: number;
    session: TSession;
    streamBuffer: string;
    streamTransport?: "draft" | "edit";
    typingTimer?: NodeJS.Timeout;
    unsubscribe?: () => void;
    userId: number;
};

export interface TelegramSessionFactory<TSession extends GatewaySession = GatewaySession> {
    createNewSession(): Promise<TSession>;
    openSession(sessionFile: string): Promise<TSession>;
}

export class TelegramSessionRegistry<TSession extends GatewaySession = GatewaySession> {
    private readonly activeSessions = new Map<string, ActiveSession<TSession>>();
    private readonly fileExists: (path: string) => boolean;
    private readonly indexPath: string;
    private readonly logger: Pick<Console, "log">;
    private readonly sessionFactory: TelegramSessionFactory<TSession>;

    constructor(options: {
        fileExists?: (path: string) => boolean;
        indexPath?: string;
        logger?: Pick<Console, "log">;
        sessionFactory: TelegramSessionFactory<TSession>;
    }) {
        this.fileExists = options.fileExists ?? existsSync;
        this.indexPath = options.indexPath ?? TELEGRAM_SESSION_INDEX_PATH;
        this.logger = options.logger ?? console;
        this.sessionFactory = options.sessionFactory;
    }

    async resolve(
        incoming: TelegramIncomingTextMessage,
    ): Promise<ActiveSession<TSession>> {
        const key = getTelegramSessionKey(incoming.chatId, incoming.userId);
        const activeSession = this.activeSessions.get(key);

        if (activeSession) {
            if (!activeSession.session.sessionFile) {
                throw new Error("Telegram gateway sessions must be persisted to disk.");
            }

            this.upsertIndexEntry({
                chatId: incoming.chatId,
                firstName: incoming.firstName,
                key,
                lastSeenAt: new Date().toISOString(),
                sessionFile: activeSession.session.sessionFile,
                userId: incoming.userId,
                username: incoming.username,
            });
            return activeSession;
        }

        const existingEntry = this.loadIndexEntries().find((entry) => entry.key === key);
        const session =
            existingEntry && this.fileExists(existingEntry.sessionFile)
                ? await this.openIndexedSession(key, existingEntry.sessionFile)
                : await this.createPersistentSession(key, existingEntry?.sessionFile);

        if (!session.sessionFile) {
            throw new Error("Telegram gateway sessions must be persisted to disk.");
        }

        const createdSession: ActiveSession<TSession> = {
            chatId: incoming.chatId,
            isBusy: session.isStreaming,
            key,
            lastFlushedText: "",
            session,
            streamBuffer: "",
            userId: incoming.userId,
        };

        this.activeSessions.set(key, createdSession);
        this.upsertIndexEntry({
            chatId: incoming.chatId,
            firstName: incoming.firstName,
            key,
            lastSeenAt: new Date().toISOString(),
            sessionFile: session.sessionFile,
            userId: incoming.userId,
            username: incoming.username,
        });

        return createdSession;
    }

    disposeAll(): void {
        for (const activeSession of this.activeSessions.values()) {
            if (activeSession.flushTimer) {
                clearTimeout(activeSession.flushTimer);
            }
            if (activeSession.typingTimer) {
                clearInterval(activeSession.typingTimer);
            }
            activeSession.unsubscribe?.();
            activeSession.session.dispose();
        }

        this.activeSessions.clear();
    }

    loadIndexEntries(): TelegramSessionIndexEntry[] {
        let rawIndex: string;

        try {
            rawIndex = readFileSync(this.indexPath, "utf8");
        } catch (error) {
            if (isMissingFileError(error)) {
                return [];
            }

            throw error;
        }

        const parsed = JSON.parse(rawIndex) as unknown;
        if (!Array.isArray(parsed)) {
            throw new Error(`Telegram session index at ${this.indexPath} must be a JSON array.`);
        }

        return parsed.map(validateIndexEntry);
    }

    private saveIndexEntries(entries: TelegramSessionIndexEntry[]): void {
        writeFileSync(this.indexPath, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
    }

    private async createPersistentSession(
        key: string,
        previousSessionFile?: string,
    ): Promise<TSession> {
        this.logger.log(
            `[gateway] create session ${key} (${formatMissingFile(previousSessionFile)})`,
        );
        return this.sessionFactory.createNewSession();
    }

    private async openIndexedSession(
        key: string,
        sessionFile: string,
    ): Promise<TSession> {
        this.logger.log(`[gateway] open session ${key} (${sessionFile})`);
        return this.sessionFactory.openSession(sessionFile);
    }

    private upsertIndexEntry(nextEntry: TelegramSessionIndexEntry): void {
        const entries = this.loadIndexEntries();
        const existingIndex = entries.findIndex((entry) => entry.key === nextEntry.key);

        if (existingIndex === -1) {
            entries.push(nextEntry);
        } else {
            entries[existingIndex] = nextEntry;
        }

        this.saveIndexEntries(entries);
    }
}

export function getTelegramSessionKey(chatId: number, userId: number): string {
    return `telegram:${chatId}:${userId}`;
}

function formatMissingFile(sessionFile: string | undefined): string {
    return sessionFile ? `missing index target ${sessionFile}` : "no persisted mapping";
}

function validateIndexEntry(entry: unknown): TelegramSessionIndexEntry {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw new Error("Telegram session index contains an invalid entry.");
    }

    const record = entry as Record<string, unknown>;
    return {
        chatId: readNumber(record, "chatId"),
        firstName: readString(record, "firstName"),
        key: readRequiredString(record, "key"),
        lastSeenAt: readRequiredString(record, "lastSeenAt"),
        sessionFile: readRequiredString(record, "sessionFile"),
        userId: readNumber(record, "userId"),
        username: readString(record, "username"),
    };
}

function readRequiredString(source: Record<string, unknown>, key: string): string {
    const value = source[key];
    if (typeof value !== "string") {
        throw new Error(`Telegram session index field "${key}" must be a string.`);
    }
    return value;
}

function readString(source: Record<string, unknown>, key: string): string | undefined {
    const value = source[key];
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== "string") {
        throw new Error(`Telegram session index field "${key}" must be a string.`);
    }
    return value;
}

function readNumber(source: Record<string, unknown>, key: string): number {
    const value = source[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`Telegram session index field "${key}" must be a number.`);
    }
    return value;
}

function isMissingFileError(error: unknown): boolean {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
}
