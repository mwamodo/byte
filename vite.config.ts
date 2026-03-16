import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const ROOT_DIR = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    base: "./",
    plugins: [react()],
    root: resolve(ROOT_DIR, "src/renderer"),
    build: {
        emptyOutDir: false,
        outDir: resolve(ROOT_DIR, "dist/renderer"),
    },
});
