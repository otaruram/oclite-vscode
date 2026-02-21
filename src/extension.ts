import * as vscode from 'vscode';
import axios from 'axios';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { AIService } from './services/ai';
import { SidebarProvider } from './panels/SidebarProvider';
import { ChatProvider } from './panels/ChatProvider';
import { AgentOrchestrator } from './agents/AgentOrchestrator';
import { initializeTelemetry, sendTelemetryEvent } from './services/telemetry';
import { 
    initializeBlobStorage, 
    fetchImageGallery, 
    uploadGeneratedImage,
    getCurrentUser,
    isBlobStorageAvailable,
    GalleryImage 
} from './services/blobStorage';

interface ChatResult extends vscode.ChatResult {
    metadata: {
        command: string;
    };
}

const OCLITE_API_URL = 'https://oclite-api.onrender.com/api/v1/generate';

// Store downloaded images temporarily
const downloadedImages: Map<string, string> = new Map();

class OCLiteExtension {
    private handler: vscode.ChatParticipant;
    private aiService: AIService;

    constructor(
        private readonly context: vscode.ExtensionContext,
        aiService: AIService
    ) {
        this.aiService = aiService;
        this.handler = this.createChatParticipant();
    }

    public register() {
        this.context.subscriptions.push(
            this.handler,
            ...this.registerCommands()
        );
    }

    private createChatParticipant(): vscode.ChatParticipant {
        const participant = vscode.chat.createChatParticipant('oclite.chat', async (request, context, stream, token) => {
            const config = vscode.workspace.getConfiguration('oclite');
            const ocliteApiKey = config.get<string>('apiKey');

            if (!ocliteApiKey) {
                this.showMissingApiKeyNotification(stream, 'OCLite');
                return { metadata: { command: '' } };
            }

            let promptToUse = request.prompt;
            try {
                stream.progress('🤖 Refining prompt with GPT-4o mini...');
                const refined = await this.aiService.refinePrompt(request.prompt);
                if (refined.prompt !== request.prompt) {
                    promptToUse = refined.prompt;
                    if (refined.fromLLM) {
                        stream.markdown(`**🤖 Refined by GPT-4o mini:** _${refined.prompt}_\n\n`);
                    } else {
                        stream.markdown(`**⚡ Enhanced locally:** _${refined.prompt}_\n\n`);
                    }
                }
            } catch (err) {
                console.error("OCLite: Prompt refinement failed, using original prompt.", err);
            }

            if (token.isCancellationRequested) return { metadata: { command: '' } };

            stream.progress('⏳ Generating asset using OCLite AI...');
            
            try {
                const model = config.get<string>('model') || 'sdxl-lightning';
                const imageUrl = await this.generateImage(ocliteApiKey, model, promptToUse, stream, token);

                if (!imageUrl) {
                    throw new Error("Timeout or failure: Generation did not produce an image URL.");
                }

                stream.progress('📥 Downloading generated image...');
                let localImagePath: string;
                try {
                    localImagePath = await this.downloadImageToTemp(imageUrl, promptToUse);
                } catch (dlError: any) {
                    throw new Error(`Failed to download image: ${dlError.message}`);
                }

                stream.markdown(`### 🎨 Generated Asset\n\n✅ **Image ready!** Downloaded successfully.\n\n**Prompt:** _${promptToUse}_\n\n**Model:** ${model}`);
                
                // Action buttons
                stream.button({
                    command: 'oclite.saveImage',
                    title: '💾 Save to Workspace',
                    arguments: [localImagePath, promptToUse]
                });
                stream.button({
                    command: 'oclite.previewImage',
                    title: '👁️ Preview Image',
                    arguments: [localImagePath]
                });
                stream.button({
                    command: 'oclite.shareImage',
                    title: '🚀 Share Image',
                    arguments: [imageUrl, promptToUse]
                });

                // Try to upload to cloud storage for sharing
                try {
                    const user = getCurrentUser();
                    if (user && localImagePath && fs.existsSync(localImagePath)) {
                        stream.progress('☁️ Uploading to cloud for sharing...');
                        const imageBuffer = fs.readFileSync(localImagePath);
                        const cloudUrl = await uploadGeneratedImage(imageBuffer, promptToUse, model);
                        if (cloudUrl) {
                            stream.markdown(`\n🌐 **Cloud URL:** ${cloudUrl}\n`);
                            stream.button({
                                command: 'oclite.copyShareLink',
                                title: '📋 Copy Share Link',
                                arguments: [cloudUrl]
                            });
                            sendTelemetryEvent('generation.cloudUpload.success');
                        }
                    } else if (user && (!localImagePath || !fs.existsSync(localImagePath))) {
                        console.warn('[OCLite] Cloud upload skipped: temp file not found');
                        sendTelemetryEvent('generation.cloudUpload.skipped', { reason: 'temp_file_missing' });
                    }
                } catch (uploadError: any) {
                    console.log('[OCLite] Cloud upload failed:', uploadError.message);
                    sendTelemetryEvent('generation.cloudUpload.error', { error: uploadError.message });
                }

            } catch (error: any) {
                console.error('OCLite Generation Error:', error);
                const errorMessage = error.response?.data?.detail || error.message || 'An unknown error occurred.';
                stream.markdown(`❌ **Generation Failed**\n\n**Reason:** ${errorMessage}`);
            }

            return { metadata: { command: '' } };
        });

        participant.iconPath = vscode.Uri.joinPath(this.context.extensionUri, 'assets', 'icon.png');
        return participant;
    }

    private async generateImage(apiKey: string, model: string, prompt: string, stream: vscode.ChatResponseStream, token: vscode.CancellationToken): Promise<string | null> {
        const response = await axios.post(OCLITE_API_URL, {
            model: model,
            prompt: prompt,
            disableSafety: false
        }, {
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            cancelToken: new axios.CancelToken(c => token.onCancellationRequested(() => c()))
        });

        if (response.data.status === 'processing' || response.data.status === 'starting') {
            const predictionId = response.data.id;
            stream.progress(`Creation started with ${model}. Polling for result...`);
            
            for (let i = 0; i < 30; i++) { // Poll for 60 seconds max
                if (token.isCancellationRequested) return null;
                await new Promise(r => setTimeout(r, 2000));

                const pollUrl = `https://oclite-api.onrender.com/api/predictions/${predictionId}`;
                const pollResponse = await axios.get(pollUrl, { headers: { 'Authorization': `Bearer ${apiKey}` } });

                if (pollResponse.data.status === 'succeeded') {
                    return pollResponse.data.output?.[0] || null;
                }
                if (pollResponse.data.status === 'failed' || pollResponse.data.status === 'canceled') {
                    throw new Error(`Generation ${pollResponse.data.status}. Reason: ${pollResponse.data.error || 'Unknown'}`);
                }
            }
        } else if (response.data.status === 'succeeded' && response.data.output?.length > 0) {
            return response.data.output[0];
        }
        
        return null; // Timeout or unexpected status
    }

    private showMissingApiKeyNotification(stream: vscode.ChatResponseStream, keyType: 'OCLite') {
        stream.markdown(`⚠️ **Missing OCLite API Key**\nGet your key from https://oclite.site then set it via the command palette.`);
        stream.button({ command: 'oclite.setApiKey', title: 'Set OCLite API Key' });
    }

    private registerCommands(): vscode.Disposable[] {
        const setApiKeyCommand = vscode.commands.registerCommand('oclite.setApiKey', async () => {
            const apiKey = await vscode.window.showInputBox({
                prompt: 'Enter your OCLite API Key from https://oclite.site',
                placeHolder: 'sk-oclite-xxxxxxxxxx',
                password: true,
                ignoreFocusOut: true,
            });
            if (apiKey) {
                await vscode.workspace.getConfiguration('oclite').update('apiKey', apiKey, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage('OCLite API Key has been set.');
            }
        });

        const saveImageCommand = vscode.commands.registerCommand('oclite.saveImage', async (tempPath: string, prompt: string) => {
            // Validate file exists before proceeding
            if (!tempPath || !fs.existsSync(tempPath)) {
                vscode.window.showErrorMessage('Save failed: Image file not found or has been removed.');
                return;
            }

            try {
                let defaultName = 'oclite_asset.png';
                try {
                    defaultName = await this.aiService.generateName(prompt);
                } catch (e) {
                    console.warn("Smart naming failed, using fallback.", e);
                }

                const defaultFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
                const defaultUri = defaultFolder ? vscode.Uri.joinPath(defaultFolder, defaultName) : undefined;

                const saveUri = await vscode.window.showSaveDialog({
                    defaultUri: defaultUri,
                    filters: { 'Images': ['png'] }
                });

                if (saveUri) {
                    const imageData = fs.readFileSync(tempPath);
                    fs.writeFileSync(saveUri.fsPath, imageData);
                    vscode.window.showInformationMessage(`💾 Image saved to ${path.basename(saveUri.fsPath)}`);
                    
                    // Clean up temp file safely
                    this.cleanupTempFile(tempPath);
                    sendTelemetryEvent('command.saveImage.success');
                }
            } catch (error: any) {
                console.error('Failed to save image:', error);
                vscode.window.showErrorMessage(`Failed to save image: ${error.message}`);
                sendTelemetryEvent('command.saveImage.error', { error: error.message });
            }
        });

        const previewImageCommand = vscode.commands.registerCommand('oclite.previewImage', (imagePath: string) => {
            if (imagePath && fs.existsSync(imagePath)) {
                try {
                    vscode.commands.executeCommand('vscode.open', vscode.Uri.file(imagePath));
                    sendTelemetryEvent('command.previewImage.success');
                } catch (error: any) {
                    console.error('Preview failed:', error);
                    vscode.window.showErrorMessage(`Preview failed: ${error.message}`);
                    sendTelemetryEvent('command.previewImage.error', { error: error.message });
                }
            } else {
                vscode.window.showErrorMessage('👁️ Preview failed: Image file not found.');
                sendTelemetryEvent('command.previewImage.error', { error: 'file_not_found' });
            }
        });

        return [setApiKeyCommand, saveImageCommand, previewImageCommand];
    }
    
    /**
     * Register additional sharing commands
     */
    public registerSharingCommands(context: vscode.ExtensionContext): vscode.Disposable[] {
        // Share image command
        const shareImageCommand = vscode.commands.registerCommand('oclite.shareImage', async (imageUrl?: string, prompt?: string) => {
            if (!imageUrl) {
                imageUrl = await vscode.window.showInputBox({
                    prompt: 'Enter image URL to share',
                    placeHolder: 'https://...blob.core.windows.net/.../image.png'
                });
            }
            
            if (imageUrl) {
                const { copyImageLink } = await import('./services/blobStorage');
                await copyImageLink(imageUrl, prompt || 'Shared OCLite image');
                sendTelemetryEvent('command.shareImage.used');
            }
        });

        // Copy share link command
        const copyShareLinkCommand = vscode.commands.registerCommand('oclite.copyShareLink', async (url: string) => {
            try {
                await vscode.env.clipboard.writeText(url);
                vscode.window.showInformationMessage('📋 Share link copied to clipboard!');
                sendTelemetryEvent('command.copyShareLink.success');
            } catch (error: any) {
                vscode.window.showErrorMessage(`Failed to copy link: ${error.message}`);
            }
        });

        return [shareImageCommand, copyShareLinkCommand];
    }

    /**
     * Safely cleanup temporary files
     */
    private cleanupTempFile(tempPath: string): void {
        try {
            if (fs.existsSync(tempPath)) {
                fs.unlinkSync(tempPath);
                downloadedImages.delete(tempPath);
                console.log(`[OCLite] Cleaned up temp file: ${path.basename(tempPath)}`);
            }
        } catch (error: any) {
            console.warn(`[OCLite] Failed to cleanup temp file: ${error.message}`);
        }
    }

    /**
     * Download image and save to temp folder with robust error handling
     */
    private async downloadImageToTemp(imageUrl: string, prompt: string): Promise<string> {
        try {
            const response = await axios.get(imageUrl, { 
                responseType: 'arraybuffer',
                timeout: 30000
            });
            
            const tempDir = path.join(os.tmpdir(), 'oclite');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            
            const sanitizedPrompt = prompt.slice(0, 30).replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
            const filename = `${sanitizedPrompt}_${Date.now()}.png`;
            const tempPath = path.join(tempDir, filename);
            
            // Write file with error handling
            fs.writeFileSync(tempPath, Buffer.from(response.data));
            
            // Verify file was written successfully
            if (!fs.existsSync(tempPath)) {
                throw new Error('Failed to write temp file');
            }
            
            // Store reference with cleanup timeout
            downloadedImages.set(tempPath, tempPath);
            
            // Auto-cleanup after 30 minutes to prevent temp file buildup
            setTimeout(() => {
                this.cleanupTempFile(tempPath);
            }, 30 * 60 * 1000);
            
            console.log(`[OCLite] Downloaded image to temp: ${tempPath}`);
            return tempPath;
            
        } catch (error: any) {
            console.error('[OCLite] Download failed:', error);
            throw new Error(`Download failed: ${error.message}`);
        }
    }
}

export async function activate(context: vscode.ExtensionContext) {
    console.log('OCLite extension is activating.');

    // Initialize AI Service
    const aiService = new AIService(context);
    
    // Initialize and register the main extension features
    const extension = new OCLiteExtension(context, aiService);
    extension.register();
    
    // Register additional sharing commands
    const sharingCommands = extension.registerSharingCommands(context);
    sharingCommands.forEach(cmd => context.subscriptions.push(cmd));

    // Register Sidebar Provider (Image Generator)
    const sidebarProvider = new SidebarProvider(context.extensionUri, aiService);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            SidebarProvider.viewType,
            sidebarProvider
        )
    );

    // Register Chat Provider (Azure AI Chat)
    const chatProvider = new ChatProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            ChatProvider.viewType,
            chatProvider
        )
    );

    // ── OCLite Agent: Analyze & Generate ──
    const analyzeAndGenerateCommand = vscode.commands.registerCommand(
        'oclite-vscode.analyzeAndGenerate',
        async (resourceUri: vscode.Uri) => {
            sendTelemetryEvent('command.analyzeAndGenerate.triggered');
            
            if (!resourceUri) {
                sendTelemetryEvent('command.analyzeAndGenerate.error', { reason: 'no-resource-uri' });
                vscode.window.showErrorMessage('Please right-click on a file or folder in Explorer.');
                return;
            }

            const result = await AgentOrchestrator.run(resourceUri);
            if (result) {
                await chatProvider.processAgentRequest(result.brief, result.prompts);
                sendTelemetryEvent('command.analyzeAndGenerate.success');
            } else {
                sendTelemetryEvent('command.analyzeAndGenerate.failed');
            }
        },
    );

    context.subscriptions.push(analyzeAndGenerateCommand);

    // ── Clear OCLite API key command ──
    context.subscriptions.push(
        vscode.commands.registerCommand('oclite.clearApiKey', async () => {
            await vscode.workspace.getConfiguration('oclite').update('apiKey', undefined, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage('OCLite API key has been cleared.');
        })
    );

    // ── View Image Gallery command ──
    context.subscriptions.push(
        vscode.commands.registerCommand('oclite.viewGallery', async () => {
            sendTelemetryEvent('command.viewGallery.triggered');
            
            if (!isBlobStorageAvailable()) {
                vscode.window.showWarningMessage('Blob storage is not configured. Generated images are only saved locally.');
                sendTelemetryEvent('command.viewGallery.unavailable');
                return;
            }

            vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Loading image gallery...',
                    cancellable: false
                },
                async () => {
                    const images = await fetchImageGallery(20); // Get last 20 images
                    
                    if (images.length === 0) {
                        vscode.window.showInformationMessage('Your gallery is empty. Generate some images first!');
                        sendTelemetryEvent('command.viewGallery.empty');
                        return;
                    }

                    // Create a simple gallery display
                    const galleryHtml = createGalleryHtml(images);
                    const panel = vscode.window.createWebviewPanel(
                        'ocliteGallery',
                        'OCLite Gallery',
                        vscode.ViewColumn.One,
                        {
                            enableScripts: true,
                            retainContextWhenHidden: true
                        }
                    );
                    
                    panel.webview.html = galleryHtml;
                    sendTelemetryEvent('command.viewGallery.opened', {
                        imageCount: images.length.toString()
                    });
                }
            );
        })
    );

    // ── Microsoft Authentication Commands ──
    context.subscriptions.push(
        vscode.commands.registerCommand('oclite.signInMicrosoft', async () => {
            sendTelemetryEvent('command.signIn.triggered');
            
            try {
                const session = await vscode.authentication.getSession('microsoft', ['https://graph.microsoft.com/User.Read'], { createIfNone: true });
                if (session) {
                    vscode.window.showInformationMessage(`✅ Signed in as ${session.account.label}`);
                    sendTelemetryEvent('command.signIn.success');
                    
                    // Reinitialize blob storage with new auth
                    await initializeBlobStorage();
                } else {
                    vscode.window.showErrorMessage('❌ Microsoft sign-in failed');
                    sendTelemetryEvent('command.signIn.failed');
                }
            } catch (error: any) {
                vscode.window.showErrorMessage(`❌ Sign-in error: ${error.message}`);
                sendTelemetryEvent('command.signIn.error', { error: error.message });
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('oclite.signOut', async () => {
            const { signOutUser } = await import('./services/blobStorage');
            await signOutUser();
            sendTelemetryEvent('command.signOut.triggered');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('oclite.configureStorage', async () => {
            sendTelemetryEvent('command.configureStorage.triggered');
            
            const connectionString = await vscode.window.showInputBox({
                prompt: '🔒 Enter Azure Storage Connection String (will be encrypted)',
                placeHolder: 'DefaultEndpointsProtocol=https;AccountName=...;AccountKey=...;EndpointSuffix=core.windows.net',
                password: true,
                ignoreFocusOut: true
            });
            
            if (connectionString) {
                const config = vscode.workspace.getConfiguration('oclite');
                await config.update('blobStorage.connectionString', connectionString, vscode.ConfigurationTarget.Global);
                
                vscode.window.showInformationMessage('🔒 Storage connection saved securely!');
                sendTelemetryEvent('command.configureStorage.success');
                
                // Reinitialize blob storage
                await initializeBlobStorage();
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('oclite.rateLimitStatus', async () => {
            const { getRateLimitStatus, getCurrentUser } = await import('./services/blobStorage');
            
            const user = getCurrentUser();
            if (!user) {
                vscode.window.showWarningMessage('⚠️ Please sign in to view rate limit status.');
                return;
            }
            
            const status = getRateLimitStatus();
            if (status) {
                const resetMinutes = Math.ceil((status.resetTime - Date.now()) / 60000);
                vscode.window.showInformationMessage(
                    `⚡ Rate Limit Status for ${user.label}:\n` +
                    `Remaining: ${status.remaining} requests\n` +
                    `Resets in: ${resetMinutes > 0 ? resetMinutes + ' minutes' : 'now'}`
                );
            }
            
            sendTelemetryEvent('command.rateLimitStatus.viewed');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('oclite.clearStorageSettings', async () => {
            const { clearStorageSettings } = await import('./services/blobStorage');
            
            const confirm = await vscode.window.showWarningMessage(
                '🗑️ This will clear all storage settings and disable cloud features.',
                'Clear Settings',
                'Cancel'
            );
            
            if (confirm === 'Clear Settings') {
                await clearStorageSettings();
                sendTelemetryEvent('command.clearStorageSettings.executed');
            }
        })
    );

    // ── Sharing Commands ──
    context.subscriptions.push(
        vscode.commands.registerCommand('oclite.shareImage', async (imageUrl?: string) => {
            if (!imageUrl) {
                imageUrl = await vscode.window.showInputBox({
                    prompt: 'Enter image URL to share',
                    placeHolder: 'https://...blob.core.windows.net/.../image.png'
                });
            }
            
            if (imageUrl) {
                const { copyImageLink } = await import('./services/blobStorage');
                await copyImageLink(imageUrl, 'Shared image');
                sendTelemetryEvent('command.shareImage.used');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('oclite.configureTelemetry', async () => {
            const connectionString = await vscode.window.showInputBox({
                placeHolder: 'Enter Azure Application Insights connection string',
                prompt: 'Configure telemetry for usage analytics (optional)',
                password: true,
                ignoreFocusOut: true
            });
            
            if (connectionString) {
                const { configureTelemetryConnectionString } = await import('./services/telemetry');
                await configureTelemetryConnectionString(context, connectionString);
                vscode.window.showInformationMessage('✅ Telemetry configured successfully!');
            }
        }),

        vscode.commands.registerCommand('oclite.sharingStats', async () => {
            const { getSharingStats, getCurrentUser } = await import('./services/blobStorage');
            
            const user = getCurrentUser();
            if (!user) {
                vscode.window.showWarningMessage('⚠️ Please sign in to view sharing statistics.');
                return;
            }
            
            vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Loading sharing statistics...'
                },
                async () => {
                    const stats = await getSharingStats();
                    const sizeMB = (stats.totalSize / (1024 * 1024)).toFixed(2);
                    const oldestDate = stats.oldestImage ? stats.oldestImage.toLocaleDateString() : 'N/A';
                    
                    vscode.window.showInformationMessage(
                        `📊 Sharing Stats for ${user.label}:\n` +
                        `Images: ${stats.totalImages}\n` +
                        `Storage Used: ${sizeMB} MB\n` +
                        `Oldest Image: ${oldestDate}`
                    );
                    
                    sendTelemetryEvent('command.sharingStats.viewed', {
                        imageCount: stats.totalImages.toString(),
                        storageUsedMB: sizeMB
                    });
                }
            );
        })
    );

    console.log('OCLite extension has been activated.');

    // Initialize the telemetry service
    initializeTelemetry(context);
    sendTelemetryEvent('extension.activated');

    // Initialize blob storage service
    await initializeBlobStorage();
}

export function deactivate() {
    // Send one last event on deactivation  
    sendTelemetryEvent('extension.deactivated');

    // Clean up all temp files on deactivation
    try {
        const tempDir = path.join(os.tmpdir(), 'oclite');
        if (fs.existsSync(tempDir)) {
            // Clean up all files in temp directory
            const files = fs.readdirSync(tempDir);
            files.forEach(file => {
                try {
                    const filePath = path.join(tempDir, file);
                    fs.unlinkSync(filePath);
                } catch (err) {
                    console.warn(`[OCLite] Failed to cleanup temp file ${file}:`, err);
                }
            });
            
            // Remove directory if empty
            try {
                fs.rmdirSync(tempDir);
            } catch (err) {
                // Directory might not be empty, that's ok
                console.log('[OCLite] Temp directory cleanup completed');
            }
        }
        
        // Clear downloaded images map
        downloadedImages.clear();
        
        console.log('[OCLite] Extension deactivated and temp files cleaned up successfully.');
    } catch (error: any) {
        console.error('[OCLite] Error during cleanup:', error.message);
    }
}

function createGalleryHtml(images: GalleryImage[]): string {
    const imageCards = images.map(img => `
        <div class="image-card">
            <img src="${img.url}" alt="${img.originalPrompt}" loading="lazy" />
            <div class="image-info">
                <h3>${img.originalPrompt}</h3>
                <p><strong>Model:</strong> ${img.model}</p>
                <p><strong>Generated:</strong> ${img.lastModified.toLocaleDateString()}</p>
                <div class="sharing-actions">
                    <a href="${img.url}" target="_blank" class="action-link">🔗 View Full Size</a>
                    <button onclick="copyToClipboard('${img.url}', '${img.originalPrompt}')" class="action-link copy-btn">📋 Copy Share Link</button>
                    <button onclick="shareToSocial('${img.url}', '${img.originalPrompt}')" class="action-link share-btn">🚀 Share</button>
                </div>
            </div>
        </div>
    `).join('');

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>OCLite Gallery - Shareable AI Images</title>
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    background: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                    padding: 20px;
                    margin: 0;
                }
                .gallery-header {
                    text-align: center;
                    margin-bottom: 30px;
                }
                .gallery-header h1 {
                    margin: 0 0 10px 0;
                    font-size: 24px;
                }
                .gallery-header p {
                    color: var(--vscode-descriptionForeground);
                    margin: 0;
                }
                .gallery-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
                    gap: 25px;
                }
                .image-card {
                    background: var(--vscode-editor-inactiveSelectionBackground);
                    border-radius: 12px;
                    overflow: hidden;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                    transition: transform 0.2s ease, box-shadow 0.2s ease;
                }
                .image-card:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px rgba(0,0,0,0.2);
                }
                .image-card img {
                    width: 100%;
                    height: 220px;
                    object-fit: cover;
                }
                .image-info {
                    padding: 18px;
                }
                .image-info h3 {
                    margin: 0 0 12px 0;
                    font-size: 14px;
                    font-weight: 600;
                    color: var(--vscode-editor-foreground);
                    line-height: 1.3;
                }
                .image-info p {
                    margin: 6px 0;
                    font-size: 12px;
                    opacity: 0.8;
                }
                .sharing-actions {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    margin-top: 15px;
                }
                .action-link {
                    display: inline-block;
                    padding: 8px 12px;
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    text-decoration: none;
                    border-radius: 6px;
                    font-size: 12px;
                    font-weight: 500;
                    text-align: center;
                    transition: background-color 0.2s ease;
                    border: none;
                    cursor: pointer;
                    font-family: inherit;
                }
                .action-link:hover {
                    background: var(--vscode-button-hoverBackground);
                }
                .copy-btn {
                    background: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                }
                .copy-btn:hover {
                    background: var(--vscode-button-secondaryHoverBackground);
                }
                .share-btn {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                }
                .share-btn:hover {
                    background: linear-gradient(135deg, #5a6fd8 0%, #6a4190 100%);
                }
                .toast {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: var(--vscode-notifications-background);
                    color: var(--vscode-notifications-foreground);
                    padding: 12px 16px;
                    border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                    z-index: 1000;
                    opacity: 0;
                    transform: translateX(100%);
                    transition: all 0.3s ease;
                }
                .toast.show {
                    opacity: 1;
                    transform: translateX(0);
                }
            </style>
        </head>
        <body>
            <div class="gallery-header">
                <h1>🎨 Your OCLite Gallery</h1>
                <p>AI-generated images with shareable public links</p>
            </div>
            
            <div class="gallery-grid">
                ${imageCards}
            </div>

            <div id="toast" class="toast"></div>

            <script>
                function copyToClipboard(url, prompt) {
                    navigator.clipboard.writeText(url).then(() => {
                        showToast('📋 Link copied to clipboard!');
                    }).catch(() => {
                        // Fallback for older browsers
                        const textArea = document.createElement('textarea');
                        textArea.value = url;
                        document.body.appendChild(textArea);
                        textArea.select();
                        document.execCommand('copy');
                        document.body.removeChild(textArea);
                        showToast('📋 Link copied to clipboard!');
                    });
                }

                function shareToSocial(url, prompt) {
                    const text = encodeURIComponent('Check out this AI-generated image: "' + prompt + '"');
                    const shareUrl = encodeURIComponent(url);
                    
                    // Create sharing menu
                    const platforms = [
                        { name: 'Twitter', url: 'https://twitter.com/intent/tweet?text=' + text + '&url=' + shareUrl },
                        { name: 'Facebook', url: 'https://www.facebook.com/sharer/sharer.php?u=' + shareUrl },
                        { name: 'LinkedIn', url: 'https://www.linkedin.com/sharing/share-offsite/?url=' + shareUrl },
                        { name: 'Reddit', url: 'https://reddit.com/submit?url=' + shareUrl + '&title=' + text }
                    ];
                    
                    // Show simple selection
                    const choice = prompt('Share to:\\n1. Twitter\\n2. Facebook\\n3. LinkedIn\\n4. Reddit\\n5. Copy link only\\n\\nEnter number (1-5):');
                    
                    if (choice >= '1' && choice <= '4') {
                        window.open(platforms[parseInt(choice) - 1].url, '_blank');
                    } else if (choice === '5') {
                        copyToClipboard(url, prompt);
                    }
                }

                function showToast(message) {
                    const toast = document.getElementById('toast');
                    toast.textContent = message;
                    toast.classList.add('show');
                    setTimeout(() => {
                        toast.classList.remove('show');
                    }, 3000);
                }
            </script>
        </body>
        </html>
    `;
}
