import assert from "node:assert/strict";
import test from "node:test";

import { createDesktopPreloadApi } from "../src/desktop/preload-api.ts";
import { registerDesktopIpcHandlers, toggleWindow } from "../src/desktop/main.ts";

test("preload API exposes typed prompt and subscriptions", async () => {
    const invocations: Array<{ channel: string; payload: unknown }> = [];
    const listeners = new Map<string, (_event: unknown, payload: unknown) => void>();
    const api = createDesktopPreloadApi({
        invoke: async (channel, payload) => {
            invocations.push({ channel, payload });
            if (channel === "byte:get-desktop-config") {
                return { accountId: "byte" };
            }
            return { ok: true };
        },
        on: (channel, listener) => {
            listeners.set(channel, listener);
        },
        removeListener: (channel) => {
            listeners.delete(channel);
        },
    });

    const desktopConfig = await api.getDesktopConfig();
    await api.prompt({ accountId: "default", text: "hello" });
    const unsubscribe = api.onMessageDone((payload) => {
        assert.equal(payload.text, "done");
    });
    listeners.get("byte:message-done")?.({}, { accountId: "default", text: "done", type: "message-done" });
    unsubscribe();

    assert.deepEqual(desktopConfig, { accountId: "byte" });
    assert.deepEqual(invocations[0], {
        channel: "byte:get-desktop-config",
        payload: undefined,
    });
    assert.deepEqual(invocations[1], {
        channel: "byte:prompt",
        payload: { accountId: "default", text: "hello" },
    });
    assert.equal(listeners.size, 0);
});

test("registerDesktopIpcHandlers wires prompt, resize, and hide handlers", async () => {
    const handlers = new Map<string, Function>();
    const sentEvents: Array<{ channel: string; payload: unknown }> = [];
    let visible = true;

    const fakeWindow = {
        hide() {
            visible = false;
        },
        isDestroyed() {
            return false;
        },
        isVisible() {
            return visible;
        },
        setBounds() {},
        show() {
            visible = true;
        },
        webContents: {
            send(channel: string, payload: unknown) {
                sentEvents.push({ channel, payload });
            },
        },
    };

    const fakeChannel = {
        async prompt(text: string) {
            fakeWindow.webContents.send("byte:message-start", { accountId: "default", type: "message-start" });
            fakeWindow.webContents.send("byte:message-done", { accountId: "default", text, type: "message-done" });
        },
        subscribe() {
            return () => {};
        },
    };

    registerDesktopIpcHandlers({
        account: {
            accountId: "default",
            hotkey: "CommandOrControl+Shift+Space",
            position: "bottom-right",
        },
        channel: fakeChannel as never,
        ipc: {
            handle(channel, handler) {
                handlers.set(channel, handler);
                return this as never;
            },
        },
        window: fakeWindow as never,
    });

    const promptResult = await handlers.get("byte:prompt")?.({}, {
        accountId: "default",
        text: "hello",
    });
    const desktopConfig = await handlers.get("byte:get-desktop-config")?.();
    await handlers.get("byte:hide")?.();

    assert.deepEqual(promptResult, { ok: true });
    assert.deepEqual(desktopConfig, { accountId: "default" });
    assert.equal(visible, false);
    assert.equal(sentEvents.at(-1)?.channel, "byte:visibility");
});

test("toggleWindow flips visibility and emits a visibility event", async () => {
    const sentEvents: Array<{ channel: string; payload: unknown }> = [];
    let visible = false;

    const fakeWindow = {
        hide() {
            visible = false;
        },
        isDestroyed() {
            return false;
        },
        isVisible() {
            return visible;
        },
        show() {
            visible = true;
        },
        webContents: {
            send(channel: string, payload: unknown) {
                sentEvents.push({ channel, payload });
            },
        },
    };

    toggleWindow(fakeWindow as never);
    toggleWindow(fakeWindow as never);

    assert.deepEqual(sentEvents, [
        { channel: "byte:visibility", payload: { visible: true } },
        { channel: "byte:visibility", payload: { visible: false } },
    ]);
});
