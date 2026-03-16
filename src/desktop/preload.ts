import { contextBridge, ipcRenderer } from "electron";

import { createDesktopPreloadApi, type ByteDesktopApi } from "./preload-api.js";

const byte = createDesktopPreloadApi(ipcRenderer);

if (process.contextIsolated) {
    contextBridge.exposeInMainWorld("byte", byte);
} else {
    (globalThis as { byte?: ByteDesktopApi }).byte = byte;
}
