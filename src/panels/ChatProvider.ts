/**
 * ChatProvider.ts — Slim orchestrator for the OCLite Chat sidebar panel.
 * All HTML/CSS/JS lives in src/panels/webview/.
 */
import * as vscode from 'vscode';
import { getNonce } from '../utilities/getNonce';
import { sendTelemetryEvent } from '../services/telemetry';
import { ChatMessageHandler, ChatMessage } from './handlers/ChatMessageHandler';
import { ChatHistoryService, ChatSession } from '../services/chatHistory';
import { buildChatHtml } from './webview/chatWebviewHtml';

export class ChatProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'oclite.chatView';

    private _view?: vscode.WebviewView;
    private messageHandler: ChatMessageHandler;
    private historyService: ChatHistoryService;
    private currentSession: ChatSession | null = null;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly context: vscode.ExtensionContext
    ) {
        this.messageHandler = new ChatMessageHandler();
        this.historyService = new ChatHistoryService(context);
        this.initializeSession();
    }

    private initializeSession(): void {
        const sessions = this.historyService.getAllSessions();
        this.currentSession = sessions.length > 0
            ? sessions[0]
            : this.historyService.createNewSession();
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        };

        webviewView.webview.html = buildChatHtml(webviewView.webview, getNonce());

        // Load history after webview is ready
        setTimeout(() => this.loadCurrentSessionToWebview(), 150);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            await this.handleWebviewMessage(data, webviewView);
        });
    }

    private loadCurrentSessionToWebview(): void {
        if (!this._view || !this.currentSession) { return; }
        this._view.webview.postMessage({
            type: 'loadHistory',
            messages: this.currentSession.messages,
            sessionTitle: this.currentSession.title,
            sessionId: this.currentSession.id,
        });
    }

    private async handleWebviewMessage(data: any, webviewView: vscode.WebviewView): Promise<void> {
        switch (data.type) {
            case 'askAI':
            case 'explainCode':
            case 'improveCode':
            case 'brainstormIdeas':
                await this.handleChatMessage(data, webviewView);
                break;
            case 'insertCode':       this.handleInsertCode(data.value); break;
            case 'generateImage':    await this.handleGenerateImage(data.value); break;
            case 'switchToParticipant': await this.handleSwitchToParticipant(); break;
            case 'newSession':       await this.handleNewSession(); break;
            case 'loadSession':      await this.handleLoadSession(data.sessionId); break;
            case 'deleteSession':    await this.handleDeleteSession(data.sessionId); break;
            case 'clearHistory':     await this.handleClearHistory(); break;
            case 'exportHistory':    await this.handleExportHistory(); break;
            case 'getSessionList':   await this.handleGetSessionList(); break;
            case 'previewImage':     await this.handlePreviewImage(data.path); break;
            case 'saveImage':        await this.handleSaveImage(data.path, data.prompt); break;
            case 'viewGallery':      await this.handleViewGallery(); break;
            case 'copyLink':         await this.handleCopyLink(data.url, data.blobName); break;
            case 'generateVariations': await this.handleGenerateVariations(data.prompt); break;
        }
    }

    private async handleChatMessage(data: ChatMessage, webviewView: vscode.WebviewView): Promise<void> {
        if (!this.currentSession) {
            this.currentSession = this.historyService.createNewSession();
        }

        sendTelemetryEvent('chat.message.sent', {
            messageType: data.type,
            messageLength: data.value.length.toString(),
            sessionId: this.currentSession.id,
        });

        this.historyService.addMessage(this.currentSession.id, {
            type: 'user',
            content: data.value,
            attachedFileName: data.attachedFileName,
            attachedImage: data.attachedImage,
        });

        const answer = await this.messageHandler.handleMessage(data);

        this.historyService.addMessage(this.currentSession.id, {
            type: 'ai',
            content: answer,
        });

        webviewView.webview.postMessage({ type: 'addResponse', value: answer });
    }

    private async handleNewSession(): Promise<void> {
        this.currentSession = this.historyService.createNewSession();
        this._view?.webview.postMessage({
            type: 'newSessionCreated',
            sessionId: this.currentSession.id,
            sessionTitle: this.currentSession.title,
        });
        sendTelemetryEvent('chat.session.new_created', { sessionId: this.currentSession.id });
    }

    private async handleLoadSession(sessionId: string): Promise<void> {
        const session = this.historyService.getSession(sessionId);
        if (session) {
            this.currentSession = session;
            this.loadCurrentSessionToWebview();
            sendTelemetryEvent('chat.session.loaded', {
                sessionId,
                messageCount: session.messages.length.toString(),
            });
        }
    }

    private async handleDeleteSession(sessionId: string): Promise<void> {
        if (this.historyService.deleteSession(sessionId)) {
            if (this.currentSession?.id === sessionId) {
                this.currentSession = this.historyService.createNewSession();
                this.loadCurrentSessionToWebview();
            }
            this._view?.webview.postMessage({ type: 'sessionDeleted', sessionId });
        }
    }

    private async handleClearHistory(): Promise<void> {
        const choice = await vscode.window.showWarningMessage(
            '🗑️ Hapus semua riwayat chat? Tindakan ini tidak dapat dibatalkan.',
            'Hapus Semua', 'Batal'
        );
        if (choice === 'Hapus Semua') {
            this.historyService.clearAllHistory();
            this.currentSession = this.historyService.createNewSession();
            this._view?.webview.postMessage({ type: 'historyCleared' });
            vscode.window.showInformationMessage('✅ Semua riwayat chat telah dihapus.');
        }
    }

    private async handleExportHistory(): Promise<void> {
        try {
            const historyJson = this.historyService.exportHistory();
            const stats = this.historyService.getHistoryStats();
            const saveUri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(`oclite-chat-history-${new Date().toISOString().split('T')[0]}.json`),
                filters: { 'JSON Files': ['json'], 'All Files': ['*'] },
            });
            if (saveUri) {
                await vscode.workspace.fs.writeFile(saveUri, Buffer.from(historyJson, 'utf8'));
                vscode.window.showInformationMessage(
                    `📁 Exported: ${stats.totalSessions} sessions, ${stats.totalMessages} messages`
                );
            }
        } catch (error: any) {
            vscode.window.showErrorMessage(`❌ Export failed: ${error.message}`);
        }
    }

    private async handleGetSessionList(): Promise<void> {
        const sessions = this.historyService.getAllSessions();
        const stats = this.historyService.getHistoryStats();
        this._view?.webview.postMessage({
            type: 'sessionList',
            sessions: sessions.map(s => ({
                id: s.id,
                title: s.title,
                messageCount: s.messages.length,
                lastModified: s.lastModified,
                createdAt: s.createdAt,
            })),
            stats,
            currentSessionId: this.currentSession?.id,
        });
    }

    private handleInsertCode(code: string): void {
        sendTelemetryEvent('chat.code.inserted');
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            editor.edit(edit => edit.insert(editor.selection.active, code));
        } else {
            vscode.window.showWarningMessage('Open a file first to insert code.');
        }
    }

    private async handleGenerateImage(prompt: string): Promise<void> {
        sendTelemetryEvent('chat.image.generation.triggered');
        
        if (!this._view) {
            vscode.window.showWarningMessage('Chat panel is not open.');
            return;
        }

        // Show generating message
        this._view.webview.postMessage({ 
            type: 'addResponse', 
            value: `🎨 Generating image: "${prompt}"\n\n⏳ Please wait...` 
        });

        try {
            const { getHttpTrigger1Url, getHttpTrigger2Url, getHttpTrigger4Url, getOcliteApiKey } = require('../utilities/secrets');
            const axios = require('axios');
            
            const apiKey = getOcliteApiKey();
            if (!apiKey) {
                throw new Error('OCLite API key not configured');
            }

            // STEP 1: Refine prompt with HttpTrigger2
            this._view.webview.postMessage({ 
                type: 'addResponse', 
                value: `🤖 Refining prompt...` 
            });
            
            const trigger2Url = getHttpTrigger2Url();
            const refineResponse = await axios.post(
                trigger2Url,
                { prompt: prompt, type: 'chatParticipant' },
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 30000,
                }
            );
            
            const refinedPrompt = refineResponse.data.response || refineResponse.data.message || prompt;
            
            this._view.webview.postMessage({ 
                type: 'addResponse', 
                value: `✨ Refined: _${refinedPrompt}_` 
            });

            // STEP 2: Generate image with HttpTrigger1
            this._view.webview.postMessage({ 
                type: 'addResponse', 
                value: `🖼️ Generating image...` 
            });
            
            const trigger1Url = getHttpTrigger1Url();
            const generateResponse = await axios.post(
                trigger1Url,
                { prompt: refinedPrompt },
                {
                    headers: { 
                        'Content-Type': 'application/json',
                        'x-oclite-signature': `oclite-${Date.now()}`,
                        'x-oclite-timestamp': Date.now().toString()
                    },
                    timeout: 120000,
                }
            );
            
            if (generateResponse.data.status !== 'succeeded' || !generateResponse.data.imageData) {
                throw new Error('Image generation failed');
            }
            
            const imageBase64 = generateResponse.data.imageData;

            // STEP 3: Upload to blob with HttpTrigger4
            this._view.webview.postMessage({ 
                type: 'addResponse', 
                value: `☁️ Uploading to cloud storage...` 
            });
            
            const trigger4Url = getHttpTrigger4Url();
            const uploadResponse = await axios.post(
                trigger4Url,
                { 
                    imageData: imageBase64, 
                    prompt: refinedPrompt,
                    model: 'sdxl-lightning'
                },
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 60000,
                }
            );
            
            if (uploadResponse.data.status !== 'success' || !uploadResponse.data.sasUrl) {
                throw new Error('Cloud upload failed');
            }
            
            const sasUrl = uploadResponse.data.sasUrl;
            const blobName = uploadResponse.data.blobName;

            // Store in gallery
            await this.storeInGallery(sasUrl, refinedPrompt, blobName);

            // Download to temp for preview
            const tempPath = await this.downloadImageToTemp(sasUrl, refinedPrompt);

            // Show success with action buttons
            this._view.webview.postMessage({ 
                type: 'imageGenerated', 
                imageUrl: sasUrl,
                tempPath: tempPath,
                prompt: refinedPrompt,
                blobName: blobName
            });

            sendTelemetryEvent('chat.image.generation.success', {
                promptLength: prompt.length.toString(),
                flow: 'complete'
            });

        } catch (error: any) {
            console.error('[OCLite] Image generation error:', error);
            this._view.webview.postMessage({ 
                type: 'addResponse', 
                value: `❌ Generation failed: ${error.message}` 
            });
            
            sendTelemetryEvent('chat.image.generation.error', {
                error: error.message
            });
        }
    }

    private async storeInGallery(sasUrl: string, prompt: string, blobName: string): Promise<void> {
        try {
            const galleryItems = this.context.globalState.get<any[]>('oclite.galleryItems', []);
            
            const newItem = {
                url: sasUrl,
                shareUrl: sasUrl,
                name: blobName,
                originalPrompt: prompt,
                model: 'sdxl-lightning',
                lastModified: new Date().toISOString(),
                timestamp: Date.now()
            };
            
            galleryItems.unshift(newItem);

            if (galleryItems.length > 100) {
                galleryItems.splice(100);
            }

            await this.context.globalState.update('oclite.galleryItems', galleryItems);
            console.log(`[OCLite] Stored in gallery: ${blobName}`);
        } catch (error: any) {
            console.error('[OCLite] Failed to store in gallery:', error);
        }
    }

    private async downloadImageToTemp(sasUrl: string, prompt: string): Promise<string> {
        const axios = require('axios');
        const fs = require('fs');
        const path = require('path');
        const os = require('os');

        const response = await axios.get(sasUrl, { 
            responseType: 'arraybuffer', 
            timeout: 90000 
        });
        
        const tempDir = path.join(os.tmpdir(), 'oclite');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const slug = prompt.slice(0, 30).replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        const tempPath = path.join(tempDir, `${slug}_${Date.now()}.png`);
        
        const buffer = Buffer.from(response.data);
        fs.writeFileSync(tempPath, buffer);
        
        return tempPath;
    }

    private async handlePreviewImage(imagePath: string): Promise<void> {
        await vscode.commands.executeCommand('oclite.previewImage', imagePath);
    }

    private async handleSaveImage(tempPath: string, prompt: string): Promise<void> {
        await vscode.commands.executeCommand('oclite.saveImage', tempPath, prompt);
    }

    private async handleViewGallery(): Promise<void> {
        await vscode.commands.executeCommand('oclite.viewGallery');
    }

    private async handleCopyLink(url: string, blobName: string): Promise<void> {
        await vscode.commands.executeCommand('oclite.copyShareLink', url, blobName);
    }

    private async handleGenerateVariations(prompt: string): Promise<void> {
        // Generate 3 variations by calling generateImage 3 times
        if (!this._view) {
            return;
        }

        this._view.webview.postMessage({ 
            type: 'addResponse', 
            value: `🔄 Generating 3 variations of: "${prompt}"\n\nPlease wait...` 
        });

        for (let i = 1; i <= 3; i++) {
            this._view.webview.postMessage({ 
                type: 'addResponse', 
                value: `\n🎨 Variation ${i}/3...` 
            });
            
            await this.handleGenerateImage(prompt);
            
            // Small delay between generations
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        this._view.webview.postMessage({ 
            type: 'addResponse', 
            value: `\n✅ All 3 variations completed!` 
        });
    }

    private async handleSwitchToParticipant(): Promise<void> {
        sendTelemetryEvent('chat.switch.to.participant');
        await vscode.commands.executeCommand('workbench.action.chat.open', { query: '@oclite ' });
    }

    public async processAgentRequest(brief: string, prompts: string[]): Promise<void> {
        sendTelemetryEvent('agent.results.displayed', {
            briefLength: brief.length.toString(),
            promptCount: prompts.length.toString(),
        });
        if (!this._view) {
            vscode.window.showWarningMessage('OCLite Chat panel is not open. Please open it first.');
            return;
        }
        this._view.webview.postMessage({ type: 'addResponse', value: `🤖 **Agent Analysis:**\n${brief}` });
        for (const prompt of prompts) {
            this._view.webview.postMessage({ type: 'addResponse', value: `🎨 **Prompt:** ${prompt}` });
        }
        this._view.show?.(true);
    }
}
