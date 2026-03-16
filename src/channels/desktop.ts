import { resolve } from "node:path";

import { SessionManager } from "@mariozechner/pi-coding-agent";

import { openAgentSession } from "../agent-session.js";
import type { AgentRuntime } from "../agents.js";
import type { ResolvedDesktopAccount } from "../config.js";
import {
    DesktopSessionRegistry,
    type ActiveDesktopSession,
} from "../sessions/desktop.js";

type DesktopLogger = Pick<Console, "error" | "log">;

export type DesktopStreamEvent =
    | { type: "agent-status"; accountId: string; model?: string; status: "ready" }
    | { type: "message-start"; accountId: string }
    | { type: "message-chunk"; accountId: string; chunk: string }
    | { type: "message-done"; accountId: string; text: string }
    | { type: "error"; accountId: string; message: string };

export class DesktopChannelBusyError extends Error {
    constructor() {
        super("Assistant is still responding to the previous message.");
    }
}

export class DesktopChannel {
    private activeSession?: ActiveDesktopSession;
    private readonly account: ResolvedDesktopAccount;
    private readonly agentRuntime: AgentRuntime;
    private initialized = false;
    private readonly listeners = new Set<(event: DesktopStreamEvent) => void>();
    private readonly logger: DesktopLogger;
    private model?: string;
    private readonly registry: DesktopSessionRegistry;
    private streamBuffer = "";

    constructor(options: {
        account: ResolvedDesktopAccount;
        agentRuntime: AgentRuntime;
        logger?: DesktopLogger;
    }) {
        const { account, agentRuntime } = options;

        this.account = account;
        this.agentRuntime = agentRuntime;
        this.logger = options.logger ?? console;
        this.registry = new DesktopSessionRegistry({
            indexPath: resolve(agentRuntime.config.sessionsDir, "desktop-session-index.json"),
            logger: this.logger,
            sessionFactory: {
                createNewSession: async () => {
                    const { session } = await openAgentSession({
                        runtime: agentRuntime.runtime,
                        sessionManager: SessionManager.create(
                            agentRuntime.runtime.sessionFactoryInputs.cwd as string,
                            agentRuntime.config.sessionsDir,
                        ),
                        thinkingLevel: agentRuntime.config.thinkingLevel,
                    });
                    return session;
                },
                openSession: async (sessionFile) => {
                    const { session } = await openAgentSession({
                        runtime: agentRuntime.runtime,
                        sessionManager: SessionManager.open(sessionFile),
                        thinkingLevel: agentRuntime.config.thinkingLevel,
                    });
                    return session;
                },
            },
        });
    }

    get accountId(): string {
        return this.account.accountId;
    }

    get modelName(): string | undefined {
        return this.model;
    }

    async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }

        this.activeSession = await this.registry.resolve(this.account.accountId);
        this.subscribeToSession(this.activeSession);
        this.model = formatModel(this.activeSession.session.model);
        this.initialized = true;
        this.emit({
            type: "agent-status",
            accountId: this.account.accountId,
            model: this.model,
            status: "ready",
        });
    }

    subscribe(listener: (event: DesktopStreamEvent) => void): () => void {
        this.listeners.add(listener);

        if (this.initialized) {
            listener({
                type: "agent-status",
                accountId: this.account.accountId,
                model: this.model,
                status: "ready",
            });
        }

        return () => {
            this.listeners.delete(listener);
        };
    }

    async prompt(text: string): Promise<void> {
        await this.initialize();

        if (!this.activeSession) {
            throw new Error("Desktop session failed to initialize.");
        }
        if (this.activeSession.isBusy || this.activeSession.session.isStreaming) {
            throw new DesktopChannelBusyError();
        }

        this.activeSession.isBusy = true;
        this.streamBuffer = "";

        try {
            await this.activeSession.session.prompt(text);
            if (this.activeSession.isBusy && !this.activeSession.session.isStreaming) {
                this.activeSession.isBusy = false;
            }
        } catch (error) {
            this.activeSession.isBusy = false;
            this.emit({
                type: "error",
                accountId: this.account.accountId,
                message: formatError(error),
            });
            throw error;
        }
    }

    dispose(): void {
        this.registry.disposeAll();
        this.initialized = false;
        this.activeSession = undefined;
    }

    private emit(event: DesktopStreamEvent): void {
        for (const listener of this.listeners) {
            listener(event);
        }
    }

    private subscribeToSession(activeSession: ActiveDesktopSession): void {
        if (activeSession.unsubscribe) {
            return;
        }

        activeSession.unsubscribe = activeSession.session.subscribe((event) => {
            if (event.type === "message_start" && event.message.role === "assistant") {
                this.streamBuffer = "";
                this.emit({
                    type: "message-start",
                    accountId: this.account.accountId,
                });
                return;
            }

            if (
                event.type === "message_update" &&
                event.message.role === "assistant" &&
                event.assistantMessageEvent.type === "text_delta"
            ) {
                this.streamBuffer += event.assistantMessageEvent.delta;
                this.emit({
                    type: "message-chunk",
                    accountId: this.account.accountId,
                    chunk: event.assistantMessageEvent.delta,
                });
                return;
            }

            if (event.type === "message_end" && event.message.role === "assistant") {
                activeSession.isBusy = false;
                this.emit({
                    type: "message-done",
                    accountId: this.account.accountId,
                    text: extractAssistantText(event.message) || this.streamBuffer,
                });
            }
        });
    }
}

function extractAssistantText(message: {
    content: Array<{ type: string; text?: string }>;
}): string {
    return message.content
        .filter((block) => block.type === "text")
        .map((block) => block.text ?? "")
        .join("");
}

function formatError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function formatModel(model: { id: string; provider: string } | undefined): string | undefined {
    return model ? `${model.provider}/${model.id}` : undefined;
}
