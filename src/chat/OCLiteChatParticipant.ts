/**
 * chat/OCLiteChatParticipant.ts — Clean, modular VS Code Chat Participant
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AIService } from '../services/ai';
import { sendTelemetryEvent } from '../services/telemetry';
import { getOcliteApiKey } from '../utilities/secrets';

// Import our modular handlers and services
import { SlashCommandHandler } from './handlers/SlashCommandHandler';
import { AttachmentHandler } from './handlers/AttachmentHandler';
import { ImageGenerationService } from './services/ImageGenerationService';
import { CloudUploadService } from './services/CloudUploadService';

export class OCLiteChatParticipant {
    private handler: vscode.ChatParticipant;
    private slashCommandHandler: SlashCommandHandler;
    private attachmentHandler: AttachmentHandler;
    private imageService: ImageGenerationService;
    private cloudService: CloudUploadService;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly aiService: AIService
    ) {
        // Initialize services
        this.imageService = new ImageGenerationService();
        this.cloudService = new CloudUploadService();
        this.slashCommandHandler = new SlashCommandHandler(this.aiService, this.imageService);
        this.attachmentHandler = new AttachmentHandler();
        
        // Create the chat participant
        this.handler = this.createChatParticipant();
    }

    /**
     * Register the participant and commands
     */
    public register(): void {
        this.context.subscriptions.push(
            this.handler,
            ...this.registerCoreCommands()
        );
    }

    /**
     * Create the main chat participant handler
     */
    private createChatParticipant(): vscode.ChatParticipant {
        const participant = vscode.chat.createChatParticipant(
            'oclite.chat',
            async (request, _context, stream, token) => {
                const config = vscode.workspace.getConfiguration('oclite');
                const apiKey = getOcliteApiKey();

                if (!apiKey) {
                    stream.markdown('⚠️ **OCLite service unavailable.** Please try again later.');
                    return { metadata: { command: '' } };
                }

                const userPrompt = request.prompt.trim();

                // Handle slash commands first
                const slashResult = await this.slashCommandHandler.handleSlashCommand(
                    userPrompt, stream, token, config, apiKey
                );
                
                if (slashResult.handled) {
                    return { metadata: slashResult.metadata };
                }

                // Handle file attachments
                const attachmentResult = await this.attachmentHandler.processAttachments(request, stream);
                
                if (attachmentResult.hasAttachments && attachmentResult.enhancedPrompt) {
                    // If we have an image analysis result, we're done
                    if (attachmentResult.imageUrl) {
                        return { metadata: { command: 'imageAnalysis' } };
                    }
                }

                // Determine final prompt (enhanced or original)
                const finalPrompt = attachmentResult.enhancedPrompt || request.prompt;

                // Refine prompt with AI
                let refinedPrompt = await this.refinePrompt(finalPrompt, stream);

                if (token.isCancellationRequested) {
                    return { metadata: { command: '' } };
                }

                // Generate image
                return await this.generateAndProcessImage(refinedPrompt, config, apiKey, stream, token);
            }
        );

        participant.iconPath = {
            light: vscode.Uri.joinPath(this.context.extensionUri, 'assets', 'icon-light.svg'),
            dark:  vscode.Uri.joinPath(this.context.extensionUri, 'assets', 'icon-participant.svg'),
        };
        return participant;
    }

    /**
     * Refine prompt using AI service
     */
    private async refinePrompt(prompt: string, stream: vscode.ChatResponseStream): Promise<string> {
        try {
            stream.progress('🤖 Refining prompt with GPT-4o mini...');
            const refined = await this.aiService.refinePrompt(prompt);
            
            if (refined.prompt !== prompt) {
                const label = refined.fromLLM ? '🤖 Refined by GPT-4o mini' : '⚡ Enhanced locally';
                stream.markdown(`**${label}:** _${refined.prompt}_\n\n`);
                return refined.prompt;
            }
        } catch (error) {
            console.warn('[OCLite] Prompt refinement failed:', error);
        }
        
        return prompt;
    }

    /**
     * Generate image and handle upload/sharing
     */
    private async generateAndProcessImage(
        prompt: string,
        config: vscode.WorkspaceConfiguration,
        apiKey: string,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<any> {
        stream.progress('⏳ Generating asset using OCLite AI...');

        try {
            const model = config.get<string>('model') || 'sdxl-lightning';
            
            // Generate image
            const imageUrl = await this.imageService.generateImage(apiKey, model, prompt, stream, token);
            if (!imageUrl) {
                throw new Error('Generation did not produce an image URL.');
            }

            // Download to temp
            stream.progress('📥 Downloading generated image...');
            const localPath = await this.imageService.downloadToTemp(imageUrl, prompt);

            // Upload to cloud
            const uploadResult = await this.cloudService.uploadImage(localPath, prompt, model, stream);

            // Show results
            this.showGenerationResults(stream, prompt, model, localPath, uploadResult);

            sendTelemetryEvent('chat.generation.completed', {
                model,
                promptLength: prompt.length.toString(),
                cloudUpload: uploadResult.success ? 'true' : 'false'
            });

            return { metadata: { command: 'generate', model } };

        } catch (error: any) {
            this.handleGenerationError(error, stream);
            return { metadata: { command: 'error' } };
        }
    }

    /**
     * Show generation results with action buttons
     */
    private showGenerationResults(
        stream: vscode.ChatResponseStream,
        prompt: string,
        model: string,
        localPath: string,
        uploadResult: { success: boolean; shareUrl?: string; blobName?: string }
    ): void {
        stream.markdown(
            `### 🎨 Generated Asset\n\n✅ **Image ready!**\n\n**Prompt:** _${prompt}_\n\n**Model:** ${model}`
        );

        // Core action buttons
        stream.button({ command: 'oclite.saveImage', title: '💾 Save', arguments: [localPath, prompt] });
        stream.button({ command: 'oclite.previewImage', title: '👁️ Preview', arguments: [localPath] });
        stream.button({ command: 'oclite.viewGallery', title: '🖼️ Gallery' });
        stream.button({ command: 'oclite.generateFromPrompt', title: '🔄 Variations', arguments: [`/batch ${prompt}`] });

        // Share button with secure URL if available
        if (uploadResult.success && uploadResult.shareUrl) {
            const shareButton = this.cloudService.createShareButton(uploadResult.shareUrl, uploadResult.blobName);
            stream.button(shareButton);
        } else {
            this.cloudService.showUploadTips(stream);
        }
    }

    /**
     * Handle generation errors
     */
    private handleGenerationError(error: any, stream: vscode.ChatResponseStream): void {
        const detail = error.response?.data?.detail || error.response?.data?.error || error.response?.data?.message;
        const status = error.response?.status ? ` (HTTP ${error.response.status})` : '';
        const msg = detail || error.message || 'Unknown error';
        const reqUrl = error.config?.url || 'unknown';
        
        console.error(`[OCLite] Generation error${status}:`, JSON.stringify(error.response?.data || error.message).substring(0, 300));
        console.error(`[OCLite] Request URL was: ${reqUrl}`);
        
        stream.markdown(`❌ **Generation Failed**\n\n**Reason:** ${msg}${status}\n\n_URL: ${reqUrl}_`);
        
        sendTelemetryEvent('chat.generation.error', {
            error: msg,
            status: error.response?.status?.toString() || 'unknown',
            url: reqUrl
        });
    }

    /**
     * Register core commands (save, preview, etc.)
     */
    private registerCoreCommands(): vscode.Disposable[] {
        const saveImage = vscode.commands.registerCommand('oclite.saveImage', async (tempPath: string, prompt: string) => {
            await this.handleSaveImage(tempPath, prompt);
        });

        const preview = vscode.commands.registerCommand('oclite.previewImage', async (imagePath: string) => {
            await this.handlePreviewImage(imagePath);
        });
        
        const generateFromPrompt = vscode.commands.registerCommand('oclite.generateFromPrompt', async (prompt: string) => {
            await vscode.commands.executeCommand('workbench.action.chat.open', {
                query: `@oclite ${prompt}`
            });
            sendTelemetryEvent('command.generateFromPrompt.triggered');
        });

        return [saveImage, preview, generateFromPrompt];
    }

    /**
     * Handle save image command
     */
    private async handleSaveImage(tempPath: string, prompt: string): Promise<void> {
        console.log(`[OCLite] Save image request: ${tempPath}`);
        
        if (!tempPath || !fs.existsSync(tempPath)) {
            console.error(`[OCLite] Save failed: Image file not found at ${tempPath}`);
            vscode.window.showErrorMessage('Save failed: Image file not found.');
            return;
        }
        
        try {
            // Check file size before proceeding
            const stats = fs.statSync(tempPath);
            console.log(`[OCLite] Temp file size: ${stats.size} bytes`);
            
            if (stats.size === 0) {
                console.error(`[OCLite] Save failed: Temp file is empty`);
                vscode.window.showErrorMessage('Save failed: Image file is empty.');
                return;
            }
            
            // Generate filename
            let name = 'oclite_asset.png';
            try { 
                name = await this.aiService.generateName(prompt); 
                console.log(`[OCLite] Generated filename: ${name}`);
            } catch (e) { 
                console.warn(`[OCLite] Failed to generate name, using default: ${name}`);
            }

            // Show save dialog
            const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
            const defaultUri = folder ? vscode.Uri.joinPath(folder, name) : undefined;
            const saveUri = await vscode.window.showSaveDialog({ 
                defaultUri, 
                filters: { 
                    'Images': ['png', 'jpg', 'jpeg', 'gif', 'webp'],
                    'PNG Images': ['png'],
                    'All Files': ['*']
                } 
            });

            if (saveUri) {
                console.log(`[OCLite] Saving to: ${saveUri.fsPath}`);
                
                // Read and verify the temp file content
                const imageBuffer = fs.readFileSync(tempPath);
                console.log(`[OCLite] Read ${imageBuffer.length} bytes from temp file`);
                
                if (imageBuffer.length === 0) {
                    throw new Error('Temp file is empty');
                }
                
                // Write to the target location
                fs.writeFileSync(saveUri.fsPath, imageBuffer);
                
                // Verify the saved file
                const savedStats = fs.statSync(saveUri.fsPath);
                console.log(`[OCLite] Saved file size: ${savedStats.size} bytes`);
                
                if (savedStats.size === 0) {
                    throw new Error('Saved file is empty');
                }
                
                vscode.window.showInformationMessage(`💾 Image saved to ${path.basename(saveUri.fsPath)}`);
                this.imageService.cleanupTempFile(tempPath);
                sendTelemetryEvent('command.saveImage.success');
            }
        } catch (e: any) {
            console.error(`[OCLite] Save error:`, e);
            vscode.window.showErrorMessage(`Failed to save image: ${e.message}`);
            sendTelemetryEvent('command.saveImage.error', { error: e.message });
        }
    }

    /**
     * Handle preview image command
     */
    private async handlePreviewImage(imagePath: string): Promise<void> {
        try {
            if (!imagePath) {
                vscode.window.showErrorMessage('👁️ Preview failed: No image path provided.');
                return;
            }

            console.log('[OCLite] Preview image request:', imagePath);

            // Check if it's a URL
            if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
                console.log('[OCLite] Creating webview for URL preview');
                await this.createImagePreviewWebview(imagePath, 'Remote Image Preview');
                sendTelemetryEvent('command.previewImage.success', { type: 'url' });
                return;
            }

            // It's a local file path
            if (fs.existsSync(imagePath)) {
                console.log('[OCLite] Creating webview for local file preview');
                const fileName = path.basename(imagePath);
                await this.createImagePreviewWebview(imagePath, `Preview: ${fileName}`, true);
                sendTelemetryEvent('command.previewImage.success', { type: 'local' });
            } else {
                const fileName = path.basename(imagePath);
                console.log('[OCLite] File not found:', fileName);
                
                const choice = await vscode.window.showErrorMessage(
                    `👁️ Preview failed: Image file "${fileName}" not found. It may have been moved or deleted.`,
                    'Open Gallery',
                    'OK'
                );
                
                if (choice === 'Open Gallery') {
                    await vscode.commands.executeCommand('oclite.viewGallery');
                }
                
                sendTelemetryEvent('command.previewImage.error', { error: 'file_not_found' });
            }
        } catch (error: any) {
            console.error('[OCLite] Preview error:', error);
            vscode.window.showErrorMessage(`👁️ Preview failed: ${error.message}`);
            sendTelemetryEvent('command.previewImage.error', { error: error.message });
        }
    }

    /**
     * Create image preview webview
     */
    private async createImagePreviewWebview(imagePath: string, title: string, isLocal: boolean = false): Promise<void> {
        const panel = vscode.window.createWebviewPanel(
            'ocliteImagePreview',
            title,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: isLocal ? [vscode.Uri.file(path.dirname(imagePath))] : [],
            }
        );

        let imageUri: string;
        let fileName: string;
        
        if (isLocal) {
            const fileUri = vscode.Uri.file(imagePath);
            imageUri = panel.webview.asWebviewUri(fileUri).toString();
            fileName = path.basename(imagePath);
        } else {
            imageUri = imagePath;
            fileName = 'Remote Image';
            
            try {
                const url = new URL(imagePath);
                const pathParts = url.pathname.split('/');
                if (pathParts.length > 0) {
                    const lastPart = pathParts[pathParts.length - 1];
                    if (lastPart && lastPart.includes('.')) {
                        fileName = lastPart;
                    }
                }
            } catch (e) {
                // Keep default filename
            }
        }
        
        panel.webview.html = this.getPreviewHtml(imageUri, fileName, imagePath, isLocal, panel.webview.cspSource);
    }

    /**
     * Generate HTML for image preview
     */
    private getPreviewHtml(imageUri: string, fileName: string, imagePath: string, isLocal: boolean, cspSource: string): string {
        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} https: http: data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
                <title>OCLite Image Preview</title>
                <style>
                    html, body { 
                        height: 100%; width: 100%; margin: 0; padding: 0; 
                        background: var(--vscode-editor-background);
                        color: var(--vscode-editor-foreground);
                        font-family: var(--vscode-font-family);
                        display: flex; flex-direction: column; align-items: center; justify-content: center;
                    }
                    .container { max-width: 95%; max-height: 95%; display: flex; flex-direction: column; align-items: center; gap: 16px; }
                    .image-container { 
                        max-width: 100%; max-height: 80vh; display: flex; align-items: center; justify-content: center;
                        border: 1px solid var(--vscode-panel-border); border-radius: 8px; overflow: hidden;
                        background: var(--vscode-editor-inactiveSelectionBackground); position: relative;
                    }
                    img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
                    .info { 
                        text-align: center; padding: 12px; 
                        background: var(--vscode-editor-inactiveSelectionBackground);
                        border-radius: 6px; border: 1px solid var(--vscode-panel-border); max-width: 100%;
                    }
                    .filename { font-weight: 600; margin-bottom: 4px; word-break: break-all; }
                    .path { font-size: 12px; opacity: 0.7; font-family: var(--vscode-editor-font-family); word-break: break-all; }
                    .loading { text-align: center; opacity: 0.7; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); }
                    .error { color: var(--vscode-errorForeground); text-align: center; padding: 20px; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); }
                    .hidden { display: none !important; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="image-container">
                        <div class="loading" id="loading">
                            <div style="font-size: 24px; margin-bottom: 8px;">🖼️</div>
                            <div>Loading image...</div>
                        </div>
                        <div class="error hidden" id="error">
                            <div style="font-size: 24px; margin-bottom: 8px;">❌</div>
                            <div>Failed to load image</div>
                            <div style="font-size: 12px; margin-top: 8px; opacity: 0.7;">The image file may be corrupted or inaccessible</div>
                        </div>
                        <img id="previewImage" src="${imageUri}" alt="${fileName}" style="display: none;" />
                    </div>
                    <div class="info">
                        <div class="filename">${fileName}</div>
                        <div class="path">${isLocal ? imagePath : 'Cloud Storage Image'}</div>
                    </div>
                </div>
                <script>
                    const img = document.getElementById('previewImage');
                    const loading = document.getElementById('loading');
                    const error = document.getElementById('error');
                    
                    img.onload = function() {
                        loading.classList.add('hidden');
                        error.classList.add('hidden');
                        img.style.display = 'block';
                    };
                    
                    img.onerror = function() {
                        loading.classList.add('hidden');
                        error.classList.remove('hidden');
                    };
                    
                    setTimeout(function() {
                        if (loading && !loading.classList.contains('hidden')) {
                            loading.classList.add('hidden');
                            error.classList.remove('hidden');
                        }
                    }, 10000);
                </script>
            </body>
            </html>`;
    }

    /**
     * Cleanup method for extension deactivation
     */
    public static cleanup(): void {
        ImageGenerationService.cleanupAll();
    }
}