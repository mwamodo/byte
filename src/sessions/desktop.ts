import { existsSync, readFileSync, writeFileSync } from "node:fs";

import type { AgentSessionEvent } from "@mariozechner/pi-coding-agent";

export type DesktopSessionIndexEntry = {
    accountId: string;
    key: string;
    lastSeenAt: string;
    sessionFile: string;
};

export interface DesktopGatewaySession {
    readonly isStreaming: boolean;
    readonly model?: { id: string; provider: string };
    readonly sessionFile: string | undefined;
    dispose(): void;
    prompt(text: string): Promise<void>;
    subscribe(listener: (event: AgentSessionEvent) => void): () => void;
}

export type ActiveDesktopSession<TSession extends DesktopGatewaySession = DesktopGatewaySession> = {
    accountId: string;
    isBusy: boolean;
    key: string;
    session: TSession;
    unsubscribe?: () => void;
};

export interface DesktopSessionFactory<TSession extends DesktopGatewaySession = DesktopGatewaySession> {
    createNewSession(): Promise<TSession>;
    openSession(sessionFile: string): Promise<TSession>;
}

export class DesktopSessionRegistry<TSession extends DesktopGatewaySession = DesktopGatewaySession> {
    private readonly activeSessions = new Map<string, ActiveDesktopSession<TSession>>();
    private readonly fileExists: (path: string) => boolean;
    private readonly indexPath: string;
    private readonly logger: Pick<Console, "log">;
    private readonly sessionFactory: DesktopSessionFactory<TSession>;

    constructor(options: {
        fileExists?: (path: string) => boolean;
        indexPath: string;
        logger?: Pick<Console, "log">;
        sessionFactory: DesktopSessionFactory<TSession>;
    }) {
        this.fileExists = options.fileExists ?? existsSync;
        this.indexPath = options.indexPath;
        this.logger = options.logger ?? console;
        this.sessionFactory = options.sessionFactory;
    }

    async resolve(accountId: string): Promise<ActiveDesktopSession<TSession>> {
        const key = getDesktopSessionKey(accountId);
        const activeSession = this.activeSessions.get(key);

        if (activeSession) {
            if (!activeSession.session.sessionFile) {
                throw new Error("Desktop sessions must be persisted to disk.");
            }

            this.upsertIndexEntry({
                accountId,
                key,
                lastSeenAt: new Date().toISOString(),
                sessionFile: activeSession.session.sessionFile,
            });
            return activeSession;
        }

        const existingEntry = this.loadIndexEntries().find((entry) => entry.key === key);
        const session =
            existingEntry && this.fileExists(existingEntry.sessionFile)
                ? await this.openIndexedSession(key, existingEntry.sessionFile)
                : await this.createPersistentSession(key, existingEntry?.sessionFile);

        if (!session.sessionFile) {
            throw new Error("Desktop sessions must be persisted to disk.");
        }

        const createdSession: ActiveDesktopSession<TSession> = {
            accountId,
            isBusy: session.isStreaming,
            key,
            session,
        };

        this.activeSessions.set(key, createdSession);
        this.upsertIndexEntry({
            accountId,
            key,
            lastSeenAt: new Date().toISOString(),
            sessionFile: session.sessionFile,
        });

        return createdSession;
    }

    disposeAll(): void {
        for (const activeSession of this.activeSessions.values()) {
            activeSession.unsubscribe?.();
            activeSession.session.dispose();
        }

        this.activeSessions.clear();
    }

    loadIndexEntries(): DesktopSessionIndexEntry[] {
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
            throw new Error(`Desktop session index at ${this.indexPath} must be a JSON array.`);
        }

        return parsed.map(validateIndexEntry);
    }

    private saveIndexEntries(entries: DesktopSessionIndexEntry[]): void {
        writeFileSync(this.indexPath, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
    }

    private async createPersistentSession(
        key: string,
        previousSessionFile?: string,
    ): Promise<TSession> {
        this.logger.log(
            `[desktop] create session ${key} (${formatMissingFile(previousSessionFile)})`,
        );
        return this.sessionFactory.createNewSession();
    }

    private async openIndexedSession(
        key: string,
        sessionFile: string,
    ): Promise<TSession> {
        this.logger.log(`[desktop] open session ${key} (${sessionFile})`);
        return this.sessionFactory.openSession(sessionFile);
    }

    private upsertIndexEntry(nextEntry: DesktopSessionIndexEntry): void {
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

export function getDesktopSessionKey(accountId: string): string {
    return `desktop:${accountId}`;
}

function formatMissingFile(sessionFile: string | undefined): string {
    return sessionFile ? `missing index target ${sessionFile}` : "no persisted mapping";
}

function validateIndexEntry(entry: unknown): DesktopSessionIndexEntry {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw new Error("Desktop session index contains an invalid entry.");
    }

    const record = entry as Record<string, unknown>;
    return {
        accountId: readRequiredString(record, "accountId"),
        key: readRequiredString(record, "key"),
        lastSeenAt: readRequiredString(record, "lastSeenAt"),
        sessionFile: readRequiredString(record, "sessionFile"),
    };
}

function readRequiredString(source: Record<string, unknown>, key: string): string {
    const value = source[key];
    if (typeof value !== "string") {
        throw new Error(`Desktop session index field "${key}" must be a string.`);
    }
    return value;
}

function isMissingFileError(error: unknown): boolean {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
}
