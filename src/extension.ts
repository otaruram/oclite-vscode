/**
 * extension.ts — OCLite VS Code Extension entry point.
 *
 * Thin orchestrator: auth gate → register features → init services.
 * All heavy logic lives in dedicated modules.
 */
import * as vscode from 'vscode';
import axios from 'axios';
import { AIService } from './services/ai';
import { SidebarProvider } from './panels/SidebarProvider';
import { ChatProvider } from './panels/ChatProvider';
import { AgentOrchestrator } from './agents/AgentOrchestrator';
import { initializeTelemetry, sendTelemetryEvent } from './services/telemetry';
import { initializeBlobStorage } from './services/blobStorage';
import { requireMicrosoftAuth } from './services/auth';
import { OCLiteChatParticipant } from './chat/OCLiteChatParticipant';
import { registerAllCommands } from './commands';
import { getOcliteApiKey, getOcliteApiUrl, getOclitePollUrl } from './utilities/secrets';
import { callLLM } from './services/llm';
import { ILLMService, ITelemetryService } from './interfaces/types';

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

    // Adapters to satisfy ILLMService / ITelemetryService interfaces
    const llmService: ILLMService = {
        callLLM: (userMessage, systemPrompt, timeoutMs, imageUrl) =>
            callLLM(userMessage, systemPrompt, timeoutMs, imageUrl),
    };
    const telemetryService: ITelemetryService = {
        sendTelemetryEvent: (eventName, properties, measurements) =>
            sendTelemetryEvent(eventName, properties, measurements),
    };

    const chatProvider = new ChatProvider(context.extensionUri, context);
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

    // STEP 8: Diagnostic command
    context.subscriptions.push(
        vscode.commands.registerCommand('oclite.diagnostics', async () => {
            const output = vscode.window.createOutputChannel('OCLite Diagnostics');
            output.show(true);
            output.appendLine('=== OCLite Diagnostics v0.1.12 ===');
            output.appendLine(`Time: ${new Date().toISOString()}`);
            output.appendLine('');

            // 1. Decode secrets
            try {
                const apiUrl = getOcliteApiUrl();
                const apiKey = getOcliteApiKey();
                const pollUrl = getOclitePollUrl();
                output.appendLine(`API URL: ${apiUrl}`);
                output.appendLine(`API Key: ${apiKey.substring(0, 15)}...`);
                output.appendLine(`Poll URL: ${pollUrl}`);
                output.appendLine('✅ Secrets decrypted successfully');
            } catch (e: any) {
                output.appendLine(`❌ Secret decryption FAILED: ${e.message}`);
                return;
            }

            // 2. Test API connectivity
            output.appendLine('');
            output.appendLine('--- Testing API connectivity ---');
            try {
                const apiUrl = getOcliteApiUrl();
                const apiKey = getOcliteApiKey();
                const resp = await axios.post(apiUrl, {
                    model: 'sdxl-lightning',
                    prompt: 'diagnostic test - a simple red circle on white background',
                    disableSafety: false,
                }, {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                    },
                    timeout: 30000,
                });
                output.appendLine(`✅ API Response: HTTP ${resp.status}`);
                output.appendLine(`   Status: ${resp.data.status}`);
                output.appendLine(`   ID: ${resp.data.id || 'N/A'}`);
                if (resp.data.remaining_balance !== undefined) {
                    output.appendLine(`   Balance: ${resp.data.remaining_balance}`);
                }

                // 3. Test polling
                if (resp.data.id && (resp.data.status === 'queued' || resp.data.status === 'processing' || resp.data.status === 'starting')) {
                    output.appendLine('');
                    output.appendLine('--- Testing Poll endpoint ---');
                    const pollUrl = `${getOclitePollUrl()}${resp.data.id}`;
                    const pollResp = await axios.get(pollUrl, {
                        headers: { 'Authorization': `Bearer ${apiKey}` },
                        timeout: 10000,
                    });
                    output.appendLine(`✅ Poll Response: HTTP ${pollResp.status}`);
                    output.appendLine(`   Status: ${pollResp.data.status}`);
                    
                    // Check for new format (images array) or legacy format (output array)
                    if (pollResp.data.images?.length) {
                        output.appendLine(`   Images: ${pollResp.data.images.length} URL(s)`);
                        output.appendLine(`   First URL: ${pollResp.data.images[0].substring(0, 80)}...`);
                    } else if (pollResp.data.output?.length) {
                        output.appendLine(`   Output: ${pollResp.data.output.length} URL(s) (legacy format)`);
                        output.appendLine(`   First URL: ${pollResp.data.output[0].substring(0, 80)}...`);
                    }
                }
            } catch (e: any) {
                output.appendLine(`❌ API call FAILED:`);
                output.appendLine(`   HTTP Status: ${e.response?.status || 'N/A'}`);
                output.appendLine(`   Response body: ${JSON.stringify(e.response?.data || 'none').substring(0, 500)}`);
                output.appendLine(`   Error message: ${e.message}`);
                output.appendLine(`   Request URL: ${e.config?.url || 'N/A'}`);
                output.appendLine(`   Request headers: ${JSON.stringify(e.config?.headers || {})}`);
            }

            output.appendLine('');
            output.appendLine('=== Diagnostics complete ===');
            vscode.window.showInformationMessage('OCLite diagnostics complete. Check the output panel.');
        })
    );

    console.log('[OCLite] Extension activated.');
}

// ── Deactivate ─────────────────────────────────────────────────────────────

export function deactivate() {
    sendTelemetryEvent('extension.deactivated');
    OCLiteChatParticipant.cleanup();
    console.log('[OCLite] Extension deactivated.');
}
