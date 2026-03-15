import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import { ensureWorkspaceStructure, seedWorkspaceFiles } from "../src/workspace.ts";

test("seedWorkspaceFiles creates IDENTITY.md, USER.md, and TOOLS.md", async () => {
    const workspaceDir = await mkdtemp(resolve(tmpdir(), "byte-workspace-"));

    ensureWorkspaceStructure(workspaceDir);
    seedWorkspaceFiles(workspaceDir);

    const identityContent = await readFile(resolve(workspaceDir, "IDENTITY.md"), "utf8");
    const userContent = await readFile(resolve(workspaceDir, "USER.md"), "utf8");
    const toolsContent = await readFile(resolve(workspaceDir, "TOOLS.md"), "utf8");
    assert.match(identityContent, /# Identity/);
    assert.match(userContent, /# User Context/);
    assert.match(toolsContent, /# Tool Guidance/);
});

test("existing AGENTS.md, IDENTITY.md, USER.md, and TOOLS.md are preserved", async () => {
    const workspaceDir = await mkdtemp(resolve(tmpdir(), "byte-workspace-"));
    const agentsPath = resolve(workspaceDir, "AGENTS.md");
    const identityPath = resolve(workspaceDir, "IDENTITY.md");
    const userPath = resolve(workspaceDir, "USER.md");
    const toolsPath = resolve(workspaceDir, "TOOLS.md");

    await writeFile(agentsPath, "# custom agents", "utf8");
    await writeFile(identityPath, "# custom identity", "utf8");
    await writeFile(userPath, "# custom user", "utf8");
    await writeFile(toolsPath, "# custom tools", "utf8");

    seedWorkspaceFiles(workspaceDir);

    assert.equal(await readFile(agentsPath, "utf8"), "# custom agents");
    assert.equal(await readFile(identityPath, "utf8"), "# custom identity");
    assert.equal(await readFile(userPath, "utf8"), "# custom user");
    assert.equal(await readFile(toolsPath, "utf8"), "# custom tools");
});
