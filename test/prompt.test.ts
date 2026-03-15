import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import { createCodingTools } from "@mariozechner/pi-coding-agent";

import {
    PROMPT_CONTEXT_FILE_CHAR_LIMIT,
    buildSystemPrompt,
} from "../src/prompt.ts";
import { createPromptResourceLoader } from "../src/resource-loader.ts";

test("full prompt includes tool section, workspace section, and all bootstrap files", () => {
    const workspaceDir = "/tmp/byte-workspace";
    const prompt = buildSystemPrompt({
        promptMode: "full",
        tools: createCodingTools(workspaceDir),
        workspaceDir,
        contextFiles: [
            {
                path: resolve(workspaceDir, "AGENTS.md"),
                content: "# Workspace instructions",
            },
            {
                path: resolve(workspaceDir, "IDENTITY.md"),
                content: "# Identity instructions",
            },
            {
                path: resolve(workspaceDir, "USER.md"),
                content: "# User instructions",
            },
            {
                path: resolve(workspaceDir, "TOOLS.md"),
                content: "# Tool instructions",
            },
        ],
        now: new Date("2026-03-12T15:00:00.000Z"),
        timeZone: "UTC",
    });

    assert.match(prompt, /## Tooling/);
    assert.match(prompt, /## Workspace/);
    assert.match(prompt, /### \/tmp\/byte-workspace\/AGENTS\.md/);
    assert.match(prompt, /### \/tmp\/byte-workspace\/IDENTITY\.md/);
    assert.match(prompt, /### \/tmp\/byte-workspace\/USER\.md/);
    assert.match(prompt, /### \/tmp\/byte-workspace\/TOOLS\.md/);
    assert.match(prompt, /Date: 2026-03-12/);
    assert.match(prompt, /Timezone: UTC/);
});

test("IDENTITY.md, USER.md, and TOOLS.md are injected and ancestor or global AGENTS files are excluded", async () => {
    const rootDir = await mkdtemp(resolve(tmpdir(), "byte-prompt-"));
    const parentDir = resolve(rootDir, "parent");
    const workspaceDir = resolve(parentDir, "workspace");
    const agentDir = resolve(rootDir, "agent");
    await mkdir(workspaceDir, { recursive: true });
    await mkdir(agentDir, { recursive: true });
    await writeFile(resolve(agentDir, "AGENTS.md"), "# global leak", "utf8");
    await writeFile(resolve(parentDir, "AGENTS.md"), "# ancestor leak", "utf8");
    await writeFile(resolve(workspaceDir, "AGENTS.md"), "# workspace instructions", "utf8");
    await writeFile(resolve(workspaceDir, "IDENTITY.md"), "# identity instructions", "utf8");
    await writeFile(resolve(workspaceDir, "USER.md"), "# user instructions", "utf8");
    await writeFile(resolve(workspaceDir, "TOOLS.md"), "# tools instructions", "utf8");

    const loader = await createPromptResourceLoader({
        agentDir,
        promptMode: "full",
        tools: createCodingTools(workspaceDir),
        workspaceDir,
    });

    assert.deepEqual(
        loader.getAgentsFiles().agentsFiles.map((file) => file.path),
        [
            resolve(workspaceDir, "AGENTS.md"),
            resolve(workspaceDir, "IDENTITY.md"),
            resolve(workspaceDir, "USER.md"),
            resolve(workspaceDir, "TOOLS.md"),
        ],
    );

    const prompt = loader.getSystemPrompt();
    assert.ok(prompt);
    assert.match(prompt, /# workspace instructions/);
    assert.match(prompt, /# identity instructions/);
    assert.match(prompt, /# user instructions/);
    assert.match(prompt, /# tools instructions/);
    assert.doesNotMatch(prompt, /global leak/);
    assert.doesNotMatch(prompt, /ancestor leak/);
});

test("per-file truncation marker appears at 20,000 chars", () => {
    const workspaceDir = "/tmp/byte-workspace";
    const prompt = buildSystemPrompt({
        promptMode: "full",
        tools: createCodingTools(workspaceDir),
        workspaceDir,
        contextFiles: [
            {
                path: resolve(workspaceDir, "AGENTS.md"),
                content: "a".repeat(PROMPT_CONTEXT_FILE_CHAR_LIMIT + 50),
            },
        ],
        now: new Date("2026-03-12T15:00:00.000Z"),
        timeZone: "UTC",
    });

    assert.match(prompt, /\[truncated to 20000 chars\]/);
});

test("total-cap omission marker appears when aggregate context exceeds 150,000 chars", () => {
    const workspaceDir = "/tmp/byte-workspace";
    const prompt = buildSystemPrompt({
        promptMode: "full",
        tools: createCodingTools(workspaceDir),
        workspaceDir,
        contextFiles: Array.from({ length: 8 }, (_, index) => ({
            path: resolve(workspaceDir, `context-${index + 1}.md`),
            content: String(index + 1).repeat(PROMPT_CONTEXT_FILE_CHAR_LIMIT),
        })),
        now: new Date("2026-03-12T15:00:00.000Z"),
        timeZone: "UTC",
    });

    assert.match(prompt, /\[additional context omitted after total cap\]/);
    assert.match(prompt, /context-7\.md/);
    assert.doesNotMatch(prompt, /context-8\.md/);
});

test("none mode omits workspace and project-context sections", () => {
    const prompt = buildSystemPrompt({
        promptMode: "none",
        tools: createCodingTools("/tmp/byte-workspace"),
        workspaceDir: "/tmp/byte-workspace",
        contextFiles: [
            {
                path: "/tmp/byte-workspace/AGENTS.md",
                content: "# ignored",
            },
        ],
        now: new Date("2026-03-12T15:00:00.000Z"),
        timeZone: "UTC",
    });

    assert.match(prompt, /## Role/);
    assert.doesNotMatch(prompt, /## Tooling/);
    assert.doesNotMatch(prompt, /## Workspace/);
    assert.doesNotMatch(prompt, /## Project Context/);
    assert.doesNotMatch(prompt, /## Runtime/);
});
