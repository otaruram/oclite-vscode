/**
 * AgentOrchestrator — Coordinates the multi-agent pipeline.
 *
 * 1. ContextAnalyzerAgent  → reads code / files → creative brief
 * 2. CreativePromptAgent   → brief → detailed image prompts
 * 3. (Future) ImageAgent   → prompts → generated images
 *
 * This file owns the orchestration logic so extension.ts stays clean.
 */
import * as vscode from 'vscode';
import { ContextAnalyzerAgent } from './ContextAnalyzerAgent';
import { CreativePromptAgent } from './CreativePromptAgent';

export interface AgentResult {
    /** The creative brief produced by ContextAnalyzerAgent */
    brief: string;
    /** The image-generation prompts produced by CreativePromptAgent */
    prompts: string[];
}

export class AgentOrchestrator {
    /**
     * Run the full agent pipeline on a file or folder.
     *
     * Shows a VS Code progress notification while working.
     * Returns the generated prompts (empty array on failure).
     */
    public static async run(resourceUri: vscode.Uri): Promise<AgentResult | null> {
        return vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'OCLite Agent',
                cancellable: true,
            },
            async (progress, token) => {
                // ── Step 1: Analyse context ──────────────────────────
                progress.report({ message: 'Analysing context…' });

                if (token.isCancellationRequested) { return null; }

                const brief = await ContextAnalyzerAgent.analyze(resourceUri);

                if (!brief) {
                    vscode.window.showWarningMessage(
                        'OCLite Agent: Could not extract any context from the selected resource.',
                    );
                    return null;
                }

                // ── Step 2: Generate creative prompts ────────────────
                progress.report({ message: 'Creating image prompts…' });

                if (token.isCancellationRequested) { return null; }

                const prompts = await CreativePromptAgent.generatePrompts(brief);

                if (prompts.length === 0) {
                    vscode.window.showWarningMessage(
                        'OCLite Agent: Prompt generation returned no results.',
                    );
                    return null;
                }

                progress.report({ message: `Done — ${prompts.length} prompts ready.` });

                return { brief, prompts };
            },
        );
    }
}
