import * as vscode from 'vscode';
import axios from 'axios';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { AIService } from './services/ai';
import { SidebarProvider } from './panels/SidebarProvider';
import { ChatProvider } from './panels/ChatProvider';
import { AgentOrchestrator } from './agents/AgentOrchestrator';

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
            if (!tempPath || !downloadedImages.has(tempPath)) {
                vscode.window.showErrorMessage('Save failed: Image source is invalid or has expired.');
                return;
            }

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
                try {
                    const imageData = fs.readFileSync(tempPath);
                    fs.writeFileSync(saveUri.fsPath, imageData);
                    vscode.window.showInformationMessage(`Image saved to ${path.basename(saveUri.fsPath)}`);
                    // Clean up temp file
                    fs.unlinkSync(tempPath);
                    downloadedImages.delete(tempPath);
                } catch (error) {
                    console.error('Failed to save image:', error);
                    vscode.window.showErrorMessage('Failed to save image.');
                }
            }
        });

        const previewImageCommand = vscode.commands.registerCommand('oclite.previewImage', (imagePath: string) => {
            if (imagePath && fs.existsSync(imagePath)) {
                vscode.commands.executeCommand('vscode.open', vscode.Uri.file(imagePath));
            } else {
                vscode.window.showErrorMessage('Preview failed: Image file not found.');
            }
        });

        return [setApiKeyCommand, saveImageCommand, previewImageCommand];
    }

    /**
     * Download image and save to temp folder
     */
    private async downloadImageToTemp(imageUrl: string, prompt: string): Promise<string> {
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
        
        fs.writeFileSync(tempPath, Buffer.from(response.data));
        downloadedImages.set(tempPath, tempPath); // Store reference
        return tempPath;
    }
}

export function activate(context: vscode.ExtensionContext) {
    console.log('OCLite extension is activating.');

    // Initialize AI Service
    const aiService = new AIService(context);
    
    // Initialize and register the main extension features
    const extension = new OCLiteExtension(context, aiService);
    extension.register();

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
            if (!resourceUri) {
                vscode.window.showErrorMessage('Please right-click on a file or folder in Explorer.');
                return;
            }

            const result = await AgentOrchestrator.run(resourceUri);
            if (result) {
                await chatProvider.processAgentRequest(result.brief, result.prompts);
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

    console.log('OCLite extension has been activated.');
}

export function deactivate() {
    // Clean up temp files on deactivation
    const tempDir = path.join(os.tmpdir(), 'oclite');
    if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
    console.log('OCLite extension deactivated and temp files cleaned up.');
}
