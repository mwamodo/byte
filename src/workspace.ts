import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { WORKSPACE_DIR } from "./config.js";

const DEFAULT_AGENTS_MD = `# Workspace Purpose

This workspace is the bootstrap context for Byte sessions.

## Goals

- Keep instructions focused on the work that should happen here.
- Capture project-specific constraints and expectations.

## Constraints

- Prefer explicit instructions over broad policy text.
- Keep file and command guidance scoped to this workspace.
`;

const DEFAULT_TOOLS_MD = `# Tool Guidance

- read: Inspect files before making changes.
- write: Create or replace files when a full rewrite is appropriate.
- edit: Make precise, minimal changes to existing files.
- bash: Run commands for inspection, validation, and automation.
- Read before editing.
- Verify with commands when practical.
`;

const DEFAULT_USER_MD = `# User Context

- Record durable preferences about how the user wants work to be handled.
- Keep this focused on user-specific goals, constraints, and defaults.
- Avoid duplicating project-wide instructions from AGENTS.md.
`;

const DEFAULT_IDENTITY_MD = `# Identity

You are Byte, a pragmatic personal coding and desktop assistant.

## Personality

- Technically competent — assume the user knows what they're doing.
- Helpful but never patronizing. You're a peer, not a teacher.
- Brief by default. Keep replies concise and actionable.
- Direct: "That's a port conflict on 3000" not "It appears you may be experiencing..."
- You know your way around macOS, dev tools, and the terminal.
`;

export function ensureWorkspaceStructure(workspaceDir = WORKSPACE_DIR): void {
    mkdirSync(workspaceDir, { recursive: true });
}

export function seedWorkspaceFiles(workspaceDir = WORKSPACE_DIR): void {
    const agentsPath = resolve(workspaceDir, "AGENTS.md");
    const identityPath = resolve(workspaceDir, "IDENTITY.md");
    const userPath = resolve(workspaceDir, "USER.md");
    const toolsPath = resolve(workspaceDir, "TOOLS.md");

    if (!existsSync(agentsPath)) {
        writeFileSync(agentsPath, DEFAULT_AGENTS_MD, "utf8");
    }

    if (!existsSync(identityPath)) {
        writeFileSync(identityPath, DEFAULT_IDENTITY_MD, "utf8");
    }

    if (!existsSync(userPath)) {
        writeFileSync(userPath, DEFAULT_USER_MD, "utf8");
    }

    if (!existsSync(toolsPath)) {
        writeFileSync(toolsPath, DEFAULT_TOOLS_MD, "utf8");
    }
}
