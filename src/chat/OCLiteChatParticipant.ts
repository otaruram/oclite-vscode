/**
 * chat/OCLiteChatParticipant.ts — VS Code Chat Participant for image generation.
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import axios from 'axios';
import { AIService } from '../services/ai';
import { sendTelemetryEvent } from '../services/telemetry';
import { uploadGeneratedImage, getCurrentUser, isBlobStorageAvailable } from '../services/blobStorage';
import { getOcliteApiKey, getOcliteApiUrl, getOclitePollUrl } from '../utilities/secrets';

/** Map of temp files for cleanup */
const downloadedImages = new Map<string, string>();

export class OCLiteChatParticipant {
    private handler: vscode.ChatParticipant;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly aiService: AIService
    ) {
        this.handler = this.create();
    }

    /** Push the participant + basic commands into context.subscriptions */
    public register(): void {
        this.context.subscriptions.push(
            this.handler,
            ...this.registerCoreCommands()
        );
    }

    // ── Chat handler ───────────────────────────────────────────────────────

    private create(): vscode.ChatParticipant {
        const participant = vscode.chat.createChatParticipant(
            'oclite.chat',
            async (request, _context, stream, token) => {
                const config = vscode.workspace.getConfiguration('oclite');
                const apiKey = getOcliteApiKey();

                if (!apiKey) {
                    stream.markdown('⚠️ **OCLite service unavailable.** Please try again later.');
                    return { metadata: { command: '' } };
                }

                // Refine prompt
                let prompt = request.prompt;
                try {
                    stream.progress('🤖 Refining prompt with GPT-4o mini...');
                    const refined = await this.aiService.refinePrompt(request.prompt);
                    if (refined.prompt !== request.prompt) {
                        prompt = refined.prompt;
                        const label = refined.fromLLM ? '🤖 Refined by GPT-4o mini' : '⚡ Enhanced locally';
                        stream.markdown(`**${label}:** _${prompt}_\n\n`);
                    }
                } catch {
                    /* use original */
                }

                if (token.isCancellationRequested) return { metadata: { command: '' } };

                stream.progress('⏳ Generating asset using OCLite AI...');

                try {
                    const model = config.get<string>('model') || 'sdxl-lightning';
                    const imageUrl = await this.pollGeneration(apiKey, model, prompt, stream, token);
                    if (!imageUrl) throw new Error('Generation did not produce an image URL.');

                    stream.progress('📥 Downloading generated image...');
                    const localPath = await this.downloadToTemp(imageUrl, prompt);

                    stream.markdown(
                        `### 🎨 Generated Asset\n\n✅ **Image ready!**\n\n**Prompt:** _${prompt}_\n\n**Model:** ${model}`
                    );
                    stream.button({ command: 'oclite.saveImage', title: '💾 Save to Workspace', arguments: [localPath, prompt] });
                    stream.button({ command: 'oclite.previewImage', title: '👁️ Preview Image', arguments: [localPath] });

                    // Cloud upload first, then show share button with the correct URL
                    const shareUrl = await this.tryCloudUpload(localPath, prompt, model, stream);
                    const linkToShare = shareUrl || imageUrl; // fallback to raw URL if cloud fails
                    stream.button({ command: 'oclite.shareImage', title: '🚀 Share Image', arguments: [linkToShare, prompt] });
                } catch (error: any) {
                    const msg = error.response?.data?.detail || error.message || 'Unknown error';
                    stream.markdown(`❌ **Generation Failed**\n\n**Reason:** ${msg}`);
                }

                return { metadata: { command: '' } };
            }
        );
        participant.iconPath = vscode.Uri.joinPath(this.context.extensionUri, 'assets', 'icon.png');
        return participant;
    }

    // ── Generation helpers ─────────────────────────────────────────────────

    private async pollGeneration(
        apiKey: string,
        model: string,
        prompt: string,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<string | null> {
        const response = await axios.post(
            getOcliteApiUrl(),
            { model, prompt, disableSafety: false },
            {
                headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                cancelToken: new axios.CancelToken((c) => token.onCancellationRequested(() => c())),
            }
        );

        if (response.data.status === 'processing' || response.data.status === 'starting') {
            const predictionId = response.data.id;
            stream.progress(`Creation started with ${model}. Polling for result...`);
            for (let i = 0; i < 30; i++) {
                if (token.isCancellationRequested) return null;
                await new Promise((r) => setTimeout(r, 2000));
                const poll = await axios.get(
                    `${getOclitePollUrl()}${predictionId}`,
                    { headers: { Authorization: `Bearer ${apiKey}` } }
                );
                if (poll.data.status === 'succeeded') return poll.data.output?.[0] || null;
                if (poll.data.status === 'failed' || poll.data.status === 'canceled') {
                    throw new Error(`Generation ${poll.data.status}: ${poll.data.error || 'Unknown'}`);
                }
            }
        } else if (response.data.status === 'succeeded' && response.data.output?.length) {
            return response.data.output[0];
        }
        return null;
    }

    private async tryCloudUpload(
        localPath: string,
        prompt: string,
        model: string,
        stream: vscode.ChatResponseStream
    ): Promise<string | null> {
        try {
            const user = getCurrentUser();
            if (user && fs.existsSync(localPath)) {
                stream.progress('☁️ Uploading to cloud for sharing...');
                const buf = fs.readFileSync(localPath);
                const shareUrl = await uploadGeneratedImage(buf, prompt, model);
                if (shareUrl) {
                    stream.markdown(`\n🔗 **Share Link:** ${shareUrl}\n`);
                    stream.button({ command: 'oclite.copyShareLink', title: '📋 Copy Share Link', arguments: [shareUrl] });
                    sendTelemetryEvent('generation.cloudUpload.success');
                    return shareUrl;
                }
            } else if (!user) {
                stream.markdown('\n💡 **Tip:** Microsoft sign-in is required for sharing and gallery features.');
                sendTelemetryEvent('generation.cloudUpload.skipped', { reason: 'no_auth' });
            }
        } catch (err: any) {
            stream.markdown('\n💡 **Note:** Cloud sharing unavailable. Configure Azure storage to enable sharing.');
            sendTelemetryEvent('generation.cloudUpload.error', { error: err.message });
        }
        return null;
    }

    // ── Temp file management ───────────────────────────────────────────────

    private async downloadToTemp(imageUrl: string, prompt: string): Promise<string> {
        const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
        const tempDir = path.join(os.tmpdir(), 'oclite');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        const slug = prompt.slice(0, 30).replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        const tempPath = path.join(tempDir, `${slug}_${Date.now()}.png`);
        fs.writeFileSync(tempPath, Buffer.from(response.data));

        downloadedImages.set(tempPath, tempPath);
        setTimeout(() => OCLiteChatParticipant.cleanupTempFile(tempPath), 30 * 60 * 1000);
        return tempPath;
    }

    public static cleanupTempFile(p: string): void {
        try {
            if (fs.existsSync(p)) { fs.unlinkSync(p); downloadedImages.delete(p); }
        } catch { /* best-effort */ }
    }

    /** Clean all temp files (call on deactivate). */
    public static cleanupAll(): void {
        const tempDir = path.join(os.tmpdir(), 'oclite');
        try {
            if (fs.existsSync(tempDir)) {
                fs.readdirSync(tempDir).forEach((f) => {
                    try { fs.unlinkSync(path.join(tempDir, f)); } catch { /* ignore */ }
                });
                try { fs.rmdirSync(tempDir); } catch { /* maybe not empty */ }
            }
            downloadedImages.clear();
        } catch { /* best-effort */ }
    }

    // ── Core commands (save, preview) ────────────────────────────────────

    private registerCoreCommands(): vscode.Disposable[] {
        const saveImage = vscode.commands.registerCommand('oclite.saveImage', async (tempPath: string, prompt: string) => {
            if (!tempPath || !fs.existsSync(tempPath)) {
                vscode.window.showErrorMessage('Save failed: Image file not found.');
                return;
            }
            try {
                let name = 'oclite_asset.png';
                try { name = await this.aiService.generateName(prompt); } catch { /* fallback */ }

                const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
                const defaultUri = folder ? vscode.Uri.joinPath(folder, name) : undefined;
                const saveUri = await vscode.window.showSaveDialog({ defaultUri, filters: { Images: ['png'] } });

                if (saveUri) {
                    fs.writeFileSync(saveUri.fsPath, fs.readFileSync(tempPath));
                    vscode.window.showInformationMessage(`💾 Image saved to ${path.basename(saveUri.fsPath)}`);
                    OCLiteChatParticipant.cleanupTempFile(tempPath);
                    sendTelemetryEvent('command.saveImage.success');
                }
            } catch (e: any) {
                vscode.window.showErrorMessage(`Failed to save image: ${e.message}`);
                sendTelemetryEvent('command.saveImage.error', { error: e.message });
            }
        });

        const preview = vscode.commands.registerCommand('oclite.previewImage', (imagePath: string) => {
            if (imagePath && fs.existsSync(imagePath)) {
                vscode.commands.executeCommand('vscode.open', vscode.Uri.file(imagePath));
                sendTelemetryEvent('command.previewImage.success');
            } else {
                vscode.window.showErrorMessage('👁️ Preview failed: Image file not found.');
            }
        });

        return [saveImage, preview];
    }
}
