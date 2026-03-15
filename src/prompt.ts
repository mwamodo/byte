export type PromptMode = "full" | "minimal" | "none";

export type PromptContextFile = {
    path: string;
    content: string;
};

export type PromptTool = {
    description?: string;
    name: string;
};

export type DesktopContext = {
    activeApp?: string;
    windowTitle?: string;
    clipboard?: string;
    workingDirectory?: string;
};

export const PROMPT_CONTEXT_FILE_CHAR_LIMIT = 20_000;
export const PROMPT_CONTEXT_TOTAL_CHAR_LIMIT = 150_000;

type BuildSystemPromptOptions = {
    promptMode: PromptMode;
    tools: PromptTool[];
    workspaceDir: string;
    contextFiles?: PromptContextFile[];
    desktopContext?: DesktopContext;
    now?: Date;
    timeZone?: string;
};

export function buildSystemPrompt(options: BuildSystemPromptOptions): string {
    if (options.promptMode === "none") {
        return [
            "# byte",
            "",
            "## Role",
            "- Use tools when needed instead of claiming work was done.",
            "- State uncertainty explicitly.",
            "- Do not invent actions, files, commands, or outputs.",
            "- Keep replies concise.",
        ].join("\n");
    }

    const timeZone = options.timeZone ?? getHostTimeZone();
    const date = formatIsoCalendarDate(options.now ?? new Date(), timeZone);

    return [
        "# byte",
        "",
        "## Role",
        "- Use tools when needed.",
        "- State uncertainty explicitly.",
        "- Do not invent actions or outputs.",
        "- Keep replies concise.",
        "",
        "## Tooling",
        ...formatToolLines(options.tools),
        "",
        "## Workspace",
        `Workspace root: ${options.workspaceDir}`,
        "All file operations are scoped to this workspace.",
        "",
        "## Project Context",
        formatProjectContext(options.contextFiles ?? []),
        "",
        "## Runtime",
        `Date: ${date}`,
        `Timezone: ${timeZone}`,
    ].join("\n");
}

function formatToolLines(tools: PromptTool[]): string[] {
    if (tools.length === 0) {
        return ["No tools are available in this runtime."];
    }

    return tools.map((tool) => `- \`${tool.name}\`: ${tool.description}`);
}

function formatProjectContext(contextFiles: PromptContextFile[]): string {
    if (contextFiles.length === 0) {
        return "No bootstrap files were found.";
    }

    const sections: string[] = [];
    let totalChars = 0;

    for (const file of contextFiles) {
        const truncatedContent = truncateFromEnd(
            file.content,
            PROMPT_CONTEXT_FILE_CHAR_LIMIT,
            `[truncated to ${PROMPT_CONTEXT_FILE_CHAR_LIMIT} chars]`,
        );

        if (totalChars + truncatedContent.length > PROMPT_CONTEXT_TOTAL_CHAR_LIMIT) {
            sections.push("[additional context omitted after total cap]");
            break;
        }

        totalChars += truncatedContent.length;
        sections.push(`### ${file.path}`);
        sections.push("```md");
        sections.push(truncatedContent);
        sections.push("```");
        sections.push("");
    }

    return sections.join("\n").trimEnd();
}

function truncateFromEnd(content: string, limit: number, marker: string): string {
    if (content.length <= limit) {
        return content;
    }

    return `${content.slice(0, limit)}\n${marker}`;
}

function getHostTimeZone(): string {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function formatIsoCalendarDate(date: Date, timeZone: string): string {
    const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    });

    const parts = formatter.formatToParts(date);
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;

    if (!year || !month || !day) {
        throw new Error("Could not determine the current calendar date for the system prompt.");
    }

    return `${year}-${month}-${day}`;
}
