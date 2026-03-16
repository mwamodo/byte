import type { DesktopStreamEvent } from "../channels/desktop.js";

export type BytePromptRequest = {
    accountId: string;
    text: string;
};

export type BytePromptResult = {
    error?: string;
    ok?: boolean;
};

export type ByteDesktopConfigPayload = {
    accountId: string;
};

export type ByteVisibilityPayload = {
    visible: boolean;
};

export type ByteAgentStatusPayload = Extract<DesktopStreamEvent, { type: "agent-status" }>;
export type ByteMessageStartPayload = Extract<DesktopStreamEvent, { type: "message-start" }>;
export type ByteMessageChunkPayload = Extract<DesktopStreamEvent, { type: "message-chunk" }>;
export type ByteMessageDonePayload = Extract<DesktopStreamEvent, { type: "message-done" }>;
export type ByteErrorPayload = Extract<DesktopStreamEvent, { type: "error" }>;

export type ByteCursorPositionPayload = {
    x: number;
    y: number;
    windowX: number;
    windowY: number;
    windowWidth: number;
    windowHeight: number;
};
