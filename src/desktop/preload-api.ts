import type {
    ByteAgentStatusPayload,
    ByteCursorPositionPayload,
    ByteDesktopConfigPayload,
    ByteErrorPayload,
    ByteMessageChunkPayload,
    ByteMessageDonePayload,
    ByteMessageStartPayload,
    BytePromptRequest,
    BytePromptResult,
    ByteVisibilityPayload,
} from "./ipc.js";

export type ByteDesktopApi = ReturnType<typeof createDesktopPreloadApi>;

type IpcRendererLike = {
    invoke(channel: string, payload?: unknown): Promise<unknown>;
    on(channel: string, listener: (_event: unknown, payload: unknown) => void): void;
    removeListener(channel: string, listener: (_event: unknown, payload: unknown) => void): void;
};

export function createDesktopPreloadApi(ipc: IpcRendererLike) {
    return {
        getDesktopConfig: (): Promise<ByteDesktopConfigPayload> =>
            ipc.invoke("byte:get-desktop-config") as Promise<ByteDesktopConfigPayload>,
        hide: (): Promise<void> => ipc.invoke("byte:hide").then(() => undefined),
        prompt: (payload: BytePromptRequest): Promise<BytePromptResult> =>
            ipc.invoke("byte:prompt", payload) as Promise<BytePromptResult>,
        resize: (payload: { height: number; width: number }): Promise<void> =>
            ipc.invoke("byte:resize", payload).then(() => undefined),
        toggle: (): Promise<void> => ipc.invoke("byte:toggle").then(() => undefined),
        onAgentStatus: (
            listener: (payload: ByteAgentStatusPayload) => void,
        ): (() => void) => subscribe(ipc, "byte:agent-status", listener),
        onError: (listener: (payload: ByteErrorPayload) => void): (() => void) =>
            subscribe(ipc, "byte:error", listener),
        onMessageChunk: (
            listener: (payload: ByteMessageChunkPayload) => void,
        ): (() => void) => subscribe(ipc, "byte:message-chunk", listener),
        onMessageDone: (
            listener: (payload: ByteMessageDonePayload) => void,
        ): (() => void) => subscribe(ipc, "byte:message-done", listener),
        onMessageStart: (
            listener: (payload: ByteMessageStartPayload) => void,
        ): (() => void) => subscribe(ipc, "byte:message-start", listener),
        onCursorPosition: (
            listener: (payload: ByteCursorPositionPayload) => void,
        ): (() => void) => subscribe(ipc, "byte:cursor-position", listener),
        onVisibility: (
            listener: (payload: ByteVisibilityPayload) => void,
        ): (() => void) => subscribe(ipc, "byte:visibility", listener),
    };
}

function subscribe<TPayload>(
    ipc: IpcRendererLike,
    channel: string,
    listener: (payload: TPayload) => void,
): () => void {
    const handler = (_event: unknown, payload: unknown) => {
        listener(payload as TPayload);
    };

    ipc.on(channel, handler);
    return () => {
        ipc.removeListener(channel, handler);
    };
}
