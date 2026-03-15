import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import {
    TelegramSessionRegistry,
    type GatewaySession,
} from "../src/sessions/registry.ts";

class MockSession implements GatewaySession {
    readonly isStreaming = false;
    readonly sessionFile: string | undefined;

    constructor(sessionFile: string) {
        this.sessionFile = sessionFile;
    }

    dispose(): void {}

    async followUp(): Promise<void> {}

    async prompt(): Promise<void> {}

    subscribe(): () => void {
        return () => {};
    }
}

test("registry reopens an indexed session file instead of creating a new one", async () => {
    const tempDir = await mkdtemp(resolve(tmpdir(), "byte-sessions-"));
    const indexPath = resolve(tempDir, "telegram-session-index.json");
    const sessionFile = resolve(tempDir, "existing.jsonl");
    await mkdir(tempDir, { recursive: true });
    await writeFile(sessionFile, "{}\n", "utf8");
    await writeFile(
        indexPath,
        JSON.stringify(
            [
                {
                    key: "telegram:42:7",
                    chatId: 42,
                    userId: 7,
                    sessionFile,
                    lastSeenAt: "2026-03-10T00:00:00.000Z",
                    username: "pi",
                    firstName: "Pi",
                },
            ],
            null,
            2,
        ),
        "utf8",
    );

    let openedSessionFile: string | undefined;
    let createdCount = 0;

    const registry = new TelegramSessionRegistry({
        indexPath,
        sessionFactory: {
            createNewSession: async () => {
                createdCount += 1;
                return new MockSession(resolve(tempDir, "new.jsonl"));
            },
            openSession: async (path) => {
                openedSessionFile = path;
                return new MockSession(path);
            },
        },
    });

    const activeSession = await registry.resolve({
        chatId: 42,
        firstName: "Pi",
        messageId: 1,
        text: "hello",
        userId: 7,
        username: "pi",
    });

    assert.equal(createdCount, 0);
    assert.equal(openedSessionFile, sessionFile);
    assert.equal(activeSession.session.sessionFile, sessionFile);
});
