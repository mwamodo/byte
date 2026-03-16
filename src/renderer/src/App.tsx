import { useEffect, useRef, useState, type JSX } from "react";

type Role = "assistant" | "user";

type Message = {
    content: string;
    id: string;
    role: Role;
};

declare global {
    interface Window {
        byte: {
            getDesktopConfig(): Promise<{ accountId: string }>;
            hide(): Promise<void>;
            prompt(payload: { accountId: string; text: string }): Promise<{ error?: string; ok?: boolean }>;
            resize(payload: { height: number; width: number }): Promise<void>;
            toggle(): Promise<void>;
            onAgentStatus(listener: (payload: { accountId: string; model?: string; status: "ready" }) => void): () => void;
            onError(listener: (payload: { accountId: string; message: string }) => void): () => void;
            onMessageChunk(listener: (payload: { accountId: string; chunk: string }) => void): () => void;
            onMessageDone(listener: (payload: { accountId: string; text: string }) => void): () => void;
            onMessageStart(listener: (payload: { accountId: string }) => void): () => void;
            onVisibility(listener: (payload: { visible: boolean }) => void): () => void;
        };
    }
}

const COLLAPSED_SIZE = { width: 140, height: 180 };
const EXPANDED_SIZE = { width: 420, height: 620 };

function uid(): string {
    return Math.random().toString(36).slice(2);
}

export default function App(): JSX.Element {
    const [messages, setMessages] = useState<Message[]>([]);
    const [streamingText, setStreamingText] = useState("");
    const [isExpanded, setIsExpanded] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [isVisible, setIsVisible] = useState(false);
    const [model, setModel] = useState<string>();
    const [error, setError] = useState<string>();
    const [accountId, setAccountId] = useState<string>();
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        void window.byte.resize(COLLAPSED_SIZE);
        void window.byte.getDesktopConfig().then(({ accountId: nextAccountId }) => {
            setAccountId(nextAccountId);
        });

        return window.byte.onVisibility(({ visible }) => {
            setIsVisible(visible);
        });
    }, []);

    useEffect(() => {
        const unsubs = [
            window.byte.onAgentStatus(({ model: nextModel }) => {
                setModel(nextModel);
            }),
            window.byte.onError(({ message }) => {
                setError(message);
                setIsSending(false);
            }),
            window.byte.onMessageStart(() => {
                setStreamingText("");
                setIsSending(true);
                setError(undefined);
            }),
            window.byte.onMessageChunk(({ chunk }) => {
                setStreamingText((current) => current + chunk);
            }),
            window.byte.onMessageDone(({ text }) => {
                setMessages((current) => [
                    ...current,
                    { id: uid(), role: "assistant", content: text },
                ]);
                setStreamingText("");
                setIsSending(false);
            }),
        ];

        return () => {
            for (const unsubscribe of unsubs) {
                unsubscribe();
            }
        };
    }, []);

    useEffect(() => {
        void window.byte.resize(isExpanded ? EXPANDED_SIZE : COLLAPSED_SIZE);
        if (isExpanded) {
            inputRef.current?.focus();
        }
    }, [isExpanded]);

    async function submit(): Promise<void> {
        const text = inputRef.current?.value.trim();
        if (!text || !accountId || isSending) {
            return;
        }

        inputRef.current!.value = "";
        setMessages((current) => [...current, { id: uid(), role: "user", content: text }]);
        const result = await window.byte.prompt({ accountId, text });
        if (result.error) {
            setError(result.error);
            setIsSending(false);
        }
    }

    return (
        <main
            className={`app-shell ${isExpanded ? "expanded" : "collapsed"} ${isVisible ? "visible" : ""}`}
        >
            {isExpanded ? (
                <section className="chat-shell">
                    <header className="chat-header">
                        <div>
                            <p className="eyebrow">Desktop Assistant</p>
                            <h1>Byte</h1>
                        </div>
                        <button
                            className="ghost-button"
                            onClick={() => {
                                setIsExpanded(false);
                                void window.byte.hide();
                            }}
                            type="button"
                        >
                            Hide
                        </button>
                    </header>

                    <div className="status-row">
                        <span>{model ?? "No model selected"}</span>
                        <span>{isSending ? "Responding..." : "Ready"}</span>
                    </div>

                    <div className="messages">
                        {messages.length === 0 && streamingText.length === 0 ? (
                            <div className="empty-state">
                                Ask Byte anything from your desktop.
                            </div>
                        ) : null}
                        {messages.map((message) => (
                            <article
                                className={`message message-${message.role}`}
                                key={message.id}
                            >
                                <span className="message-role">
                                    {message.role === "assistant" ? "Byte" : "You"}
                                </span>
                                <div className="message-body">{renderContent(message.content)}</div>
                            </article>
                        ))}
                        {streamingText ? (
                            <article className="message message-assistant">
                                <span className="message-role">Byte</span>
                                <div className="message-body streaming">
                                    {renderContent(streamingText)}
                                    <span className="cursor" />
                                </div>
                            </article>
                        ) : null}
                    </div>

                    {error ? <div className="error-banner">{error}</div> : null}

                    <footer className="composer">
                        <textarea
                            className="composer-input"
                            onKeyDown={(event) => {
                                if (event.key === "Enter" && !event.shiftKey) {
                                    event.preventDefault();
                                    void submit();
                                }
                            }}
                            placeholder="Ask Byte anything..."
                            ref={inputRef}
                            rows={3}
                        />
                        <div className="composer-actions">
                            <button
                                className="ghost-button"
                                onClick={() => {
                                    setIsExpanded(false);
                                }}
                                type="button"
                            >
                                Collapse
                            </button>
                            <button
                                className="primary-button"
                                disabled={isSending || !accountId}
                                onClick={() => {
                                    void submit();
                                }}
                                type="button"
                            >
                                Send
                            </button>
                        </div>
                    </footer>
                </section>
            ) : (
                <button
                    className="mascot-button"
                    onClick={() => {
                        setIsExpanded(true);
                    }}
                    type="button"
                >
                    <span className={`mascot ${isSending ? "thinking" : ""}`}>
                        <span className="mascot-face">
                            <span className="eye" />
                            <span className="eye" />
                            <span className="mouth" />
                        </span>
                    </span>
                    <span className="mascot-label">Byte</span>
                </button>
            )}
        </main>
    );
}

function renderContent(content: string): JSX.Element {
    const parts = content.split(/(`[^`]+`)/g);

    return (
        <>
            {parts.map((part, index) => {
                if (part.startsWith("`") && part.endsWith("`")) {
                    return <code key={index}>{part.slice(1, -1)}</code>;
                }

                return part.split("\n").map((line, lineIndex) => (
                    <span key={`${index}-${lineIndex}`}>
                        {lineIndex > 0 ? <br /> : null}
                        {line}
                    </span>
                ));
            })}
        </>
    );
}
