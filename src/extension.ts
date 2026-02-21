/**
 * extension.ts — OCLite VS Code Extension entry point.
 *
 * Thin orchestrator: auth gate → register features → init services.
 * All heavy logic lives in dedicated modules.
 */
import * as vscode from 'vscode';
import { AIService } from './services/ai';
import { SidebarProvider } from './panels/SidebarProvider';
import { ChatProvider } from './panels/ChatProvider';
import { AgentOrchestrator } from './agents/AgentOrchestrator';
import { initializeTelemetry, sendTelemetryEvent } from './services/telemetry';
import { initializeBlobStorage } from './services/blobStorage';
import { requireMicrosoftAuth } from './services/auth';
import { OCLiteChatParticipant } from './chat/OCLiteChatParticipant';
import { registerAllCommands } from './commands';

// ── Activate ───────────────────────────────────────────────────────────────

export async function activate(context: vscode.ExtensionContext) {
    console.log('[OCLite] Extension activating...');

    // STEP 1: Microsoft auth gate (mandatory)
    const msSession = await requireMicrosoftAuth();
    if (!msSession) {
        return; // Auth required — extension stays dormant
    }

    vscode.window.showInformationMessage(`✅ Welcome, ${msSession.account.label}! OCLite is ready.`);
    sendTelemetryEvent('auth.gate.passed', { user: msSession.account.label });

    // STEP 2: Core services
    const aiService = new AIService(context);

    // STEP 3: Chat participant (@oclite)
    const chatParticipant = new OCLiteChatParticipant(context, aiService);
    chatParticipant.register();

    // STEP 4: All commands (sharing, gallery, storage, auth, etc.)
    registerAllCommands(context);

    // STEP 5: Webview providers
    const sidebarProvider = new SidebarProvider(context.extensionUri, aiService);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(SidebarProvider.viewType, sidebarProvider)
    );

    const chatProvider = new ChatProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(ChatProvider.viewType, chatProvider)
    );

    // STEP 6: Agent command (right-click → Analyze & Generate)
    context.subscriptions.push(
        vscode.commands.registerCommand('oclite-vscode.analyzeAndGenerate', async (uri: vscode.Uri) => {
            sendTelemetryEvent('command.analyzeAndGenerate.triggered');
            if (!uri) {
                vscode.window.showErrorMessage('Please right-click on a file or folder in Explorer.');
                return;
            }
            const result = await AgentOrchestrator.run(uri);
            if (result) {
                await chatProvider.processAgentRequest(result.brief, result.prompts);
                sendTelemetryEvent('command.analyzeAndGenerate.success');
            } else {
                sendTelemetryEvent('command.analyzeAndGenerate.failed');
            }
        })
    );

    // STEP 7: Background services
    initializeTelemetry(context);
    sendTelemetryEvent('extension.activated');
    await initializeBlobStorage();

    console.log('[OCLite] Extension activated.');
}

// ── Deactivate ─────────────────────────────────────────────────────────────

export function deactivate() {
    sendTelemetryEvent('extension.deactivated');
    OCLiteChatParticipant.cleanupAll();
    console.log('[OCLite] Extension deactivated.');
}
