import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
    DefaultResourceLoader,
} from "@mariozechner/pi-coding-agent";

import {
    buildSystemPrompt,
    type PromptContextFile,
    type PromptMode,
    type PromptTool,
} from "./prompt.js";

type BootstrapContextSelectionOptions = {
    workspaceDir: string;
    agentsFiles: PromptContextFile[];
};

type CreatePromptResourceLoaderOptions = {
    agentDir: string;
    promptMode: PromptMode;
    tools: PromptTool[];
    workspaceDir: string;
};

export function selectBootstrapContextFiles(
    options: BootstrapContextSelectionOptions,
): PromptContextFile[] {
    const agentsPath = resolve(options.workspaceDir, "AGENTS.md");
    const identityPath = resolve(options.workspaceDir, "IDENTITY.md");
    const userPath = resolve(options.workspaceDir, "USER.md");
    const toolsPath = resolve(options.workspaceDir, "TOOLS.md");
    const selectedFiles: PromptContextFile[] = [];

    const workspaceAgents = options.agentsFiles.find(
        (file) => resolve(file.path) === agentsPath,
    );

    if (workspaceAgents) {
        selectedFiles.push(workspaceAgents);
    } else if (existsSync(agentsPath)) {
        selectedFiles.push({
            path: agentsPath,
            content: readFileSync(agentsPath, "utf8"),
        });
    }

    if (existsSync(identityPath)) {
        selectedFiles.push({
            path: identityPath,
            content: readFileSync(identityPath, "utf8"),
        });
    }

    if (existsSync(userPath)) {
        selectedFiles.push({
            path: userPath,
            content: readFileSync(userPath, "utf8"),
        });
    }

    if (existsSync(toolsPath)) {
        selectedFiles.push({
            path: toolsPath,
            content: readFileSync(toolsPath, "utf8"),
        });
    }

    return selectedFiles;
}

export async function createPromptResourceLoader(
    options: CreatePromptResourceLoaderOptions,
): Promise<DefaultResourceLoader> {
    const loadContextFiles = (): PromptContextFile[] =>
        selectBootstrapContextFiles({
            workspaceDir: options.workspaceDir,
            agentsFiles: [],
        });

    const loader = new DefaultResourceLoader({
        agentDir: options.agentDir,
        cwd: options.workspaceDir,
        agentsFilesOverride: () => ({
            agentsFiles: loadContextFiles(),
        }),
        appendSystemPromptOverride: () => [],
        systemPromptOverride: (): string =>
            buildSystemPrompt({
                promptMode: options.promptMode,
                tools: options.tools,
                workspaceDir: options.workspaceDir,
                contextFiles: loadContextFiles(),
            }),
    });

    await loader.reload();

    return loader;
}
