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
import { getOcliteApiKey, getOcliteApiUrl, getOclitePollUrl, getGeneratorUrl } from '../utilities/secrets';

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

                // ── Feature: Slash Commands ──
                const userPrompt = request.prompt.trim();
                
                // /batch command - Generate multiple variations
                if (userPrompt.startsWith('/batch ')) {
                    const basePrompt = userPrompt.substring(7).trim();
                    return await this.handleBatchGeneration(basePrompt, stream, token, config, apiKey);
                }
                
                // /style command - Apply specific art style
                if (userPrompt.startsWith('/style ')) {
                    const parts = userPrompt.substring(7).split(':');
                    if (parts.length === 2) {
                        const style = parts[0].trim();
                        const content = parts[1].trim();
                        return await this.handleStyleGeneration(style, content, stream, token, config, apiKey);
                    }
                }
                
                // /remix command - Remix existing image with new prompt
                if (userPrompt.startsWith('/remix ')) {
                    stream.markdown('🎨 **Remix Mode** - Attach an image and describe changes!\n\n');
                    stream.markdown('💡 Tip: Drag an image into chat, then use `/remix your changes here`\n\n');
                    return { metadata: { command: 'remix' } };
                }
                
                // /compare command - Generate side-by-side comparisons
                if (userPrompt.startsWith('/compare ')) {
                    const comparePrompt = userPrompt.substring(9).trim();
                    return await this.handleCompareGeneration(comparePrompt, stream, token, config, apiKey);
                }
                
                // /workspace command - Generate based on workspace context
                if (userPrompt.startsWith('/workspace')) {
                    return await this.handleWorkspaceGeneration(stream, token, config, apiKey);
                }

                // ── Feature: Smart Image Analysis with Vision AI ──
                let imageUrl: string | undefined;
                let attachedDocuments: string[] = [];
                
                if (request.references && request.references.length > 0) {
                    for (const ref of request.references) {
                        if (ref.value instanceof vscode.Uri) {
                            const filePath = ref.value.fsPath;
                            const ext = path.extname(filePath).toLowerCase();
                            
                            // Handle image attachments
                            if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) {
                                stream.markdown('📸 **Image detected!** Analyzing with Vision AI...\n\n');
                                try {
                                    const { callLLM } = require('../services/llm');
                                    const imageBuffer = fs.readFileSync(filePath);
                                    const base64Image = `data:image/${ext.slice(1)};base64,${imageBuffer.toString('base64')}`;
                                    
                                    const analysis = await callLLM(
                                        request.prompt || 'Analyze this image comprehensively',
                                        'You are an expert image analyst and creative director. Provide: 1) Detailed visual description 2) Style analysis 3) Color palette 4) Mood/atmosphere 5) Technical composition. Be specific and professional.',
                                        30000,
                                        base64Image,
                                        'chatParticipant'
                                    );
                                    
                                    if (analysis) {
                                        stream.markdown(`### 🎨 Vision AI Analysis\n\n${analysis}\n\n`);
                                        stream.markdown('### 💡 Quick Actions\n\n');
                                        stream.button({ 
                                            command: 'oclite.generateFromPrompt', 
                                            title: '🔄 Generate Variations',
                                            arguments: [`/batch ${analysis.substring(0, 150)}`]
                                        });
                                        stream.button({ 
                                            command: 'oclite.generateFromPrompt', 
                                            title: '🎨 Extract Style',
                                            arguments: [`Create new image in this style: ${analysis.substring(0, 100)}`]
                                        });
                                        stream.button({ 
                                            command: 'oclite.generateFromPrompt', 
                                            title: '🌈 Different Color Palette',
                                            arguments: [`Same composition but with vibrant neon colors: ${analysis.substring(0, 100)}`]
                                        });
                                        return { metadata: { command: 'imageAnalysis' } };
                                    }
                                } catch (err: any) {
                                    stream.markdown(`⚠️ Image analysis failed: ${err.message}\n\n`);
                                }
                            }
                            
                            // Handle document attachments (PDF, DOCX, TXT, MD)
                            if (['.pdf', '.docx', '.txt', '.md'].includes(ext)) {
                                try {
                                    let content = '';
                                    if (ext === '.txt' || ext === '.md') {
                                        content = fs.readFileSync(filePath, 'utf-8');
                                    }
                                    if (content) {
                                        attachedDocuments.push(content.substring(0, 2000)); // Limit to 2000 chars
                                        stream.markdown(`📄 **Document attached:** ${path.basename(filePath)}\n\n`);
                                    }
                                } catch (err: any) {
                                    console.warn('[OCLite] Failed to read document:', err.message);
                                }
                            }
                        }
                    }
                }
                
                // If documents attached, enhance prompt with context
                let finalPrompt = request.prompt;
                if (attachedDocuments.length > 0) {
                    const docContext = attachedDocuments.join('\n\n---\n\n');
                    stream.markdown('📚 **Using document context to enhance generation...**\n\n');
                    const { callLLM } = require('../services/llm');
                    const enhancedPrompt = await callLLM(
                        `User request: ${request.prompt}\n\nDocument context:\n${docContext}`,
                        'Based on the document context, create a detailed image generation prompt that captures the key concepts, themes, and visual elements. Be specific about style, composition, and mood.',
                        30000,
                        undefined,
                        'chatParticipant'
                    );
                    if (enhancedPrompt) {
                        finalPrompt = enhancedPrompt;
                        stream.markdown(`**📝 Enhanced prompt:** _${enhancedPrompt}_\n\n`);
                    }
                }

                // Refine prompt
                let refinedPrompt = finalPrompt;
                try {
                    stream.progress('🤖 Refining prompt with GPT-4o mini...');
                    const refined = await this.aiService.refinePrompt(finalPrompt);
                    if (refined.prompt !== finalPrompt) {
                        refinedPrompt = refined.prompt;
                        const label = refined.fromLLM ? '🤖 Refined by GPT-4o mini' : '⚡ Enhanced locally';
                        stream.markdown(`**${label}:** _${refinedPrompt}_\n\n`);
                    }
                } catch {
                    /* use original */
                }

                if (token.isCancellationRequested) return { metadata: { command: '' } };

                stream.progress('⏳ Generating asset using OCLite AI...');


                try {
                    const model = config.get<string>('model') || 'sdxl-lightning';
                    const imageUrl = await this.pollGeneration(apiKey, model, refinedPrompt, stream, token);
                    if (!imageUrl) throw new Error('Generation did not produce an image URL.');

                    stream.progress('📥 Downloading generated image...');
                    const localPath = await this.downloadToTemp(imageUrl, refinedPrompt);

                    // Upload otomatis ke gallery (cloud) dengan logging yang lebih baik
                    let cloudShareUrl = null;
                    try {
                        if (fs.existsSync(localPath)) {
                            console.log('[OCLite] Auto-uploading to gallery...');
                            const buf = fs.readFileSync(localPath);
                            console.log(`[OCLite] Buffer size: ${buf.length} bytes`);
                            
                            // uploadGeneratedImage dari blobStorage
                            cloudShareUrl = await uploadGeneratedImage(buf, refinedPrompt, model);
                            console.log(`[OCLite] Cloud upload result: ${cloudShareUrl}`);
                        }
                    } catch (e) {
                        // Tidak fatal, hanya log
                        console.error('[OCLite] Auto-upload to gallery failed:', e && typeof e === 'object' && 'message' in e ? (e as any).message : String(e));
                    }

                    stream.markdown(
                        `### 🎨 Generated Asset\n\n✅ **Image ready!**\n\n**Prompt:** _${refinedPrompt}_\n\n**Model:** ${model}`
                    );
                    stream.button({ command: 'oclite.saveImage', title: '💾 Save', arguments: [localPath, refinedPrompt] });
                    stream.button({ command: 'oclite.previewImage', title: '👁️ Preview', arguments: [localPath] });
                    stream.button({ command: 'oclite.viewGallery', title: '🖼️ Gallery' });
                    stream.button({ command: 'oclite.generateFromPrompt', title: '🔄 Variations', arguments: [`/batch ${refinedPrompt}`] });

                    // Jika ada cloud URL, tampilkan tombol share
                    if (cloudShareUrl) {
                        stream.button({ command: 'oclite.copyShareLink', title: '📋 Share', arguments: [cloudShareUrl] });
                    }

                    // Cloud upload sudah dilakukan di atas, tidak perlu duplikat
                    // await this.tryCloudUpload(localPath, refinedPrompt, model, stream);
                } catch (error: any) {
                    const detail = error.response?.data?.detail || error.response?.data?.error || error.response?.data?.message;
                    const status = error.response?.status ? ` (HTTP ${error.response.status})` : '';
                    const msg = detail || error.message || 'Unknown error';
                    const reqUrl = error.config?.url || 'unknown';
                    console.error(`[OCLite] Generation error${status}:`, JSON.stringify(error.response?.data || error.message).substring(0, 300));
                    console.error(`[OCLite] Request URL was: ${reqUrl}`);
                    stream.markdown(`❌ **Generation Failed**\n\n**Reason:** ${msg}${status}\n\n_URL: ${reqUrl}_`);
                }

                return { metadata: { command: '' } };
            }
        );
        participant.iconPath = vscode.Uri.joinPath(this.context.extensionUri, 'assets', 'icon.png');
        return participant;
    }

    // ── Generation helpers ─────────────────────────────────────────────────

    // ── New Feature: Batch Generation ──
    private async handleBatchGeneration(
        basePrompt: string,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken,
        config: vscode.WorkspaceConfiguration,
        apiKey: string
    ): Promise<any> {
        stream.markdown('### 🎨 Batch Generation Mode\n\n');
        stream.markdown('Generating 3 variations with different styles...\n\n');
        
        const styles = ['cinematic', 'anime', 'photorealistic'];
        const variations = [];
        
        for (let i = 0; i < 3; i++) {
            if (token.isCancellationRequested) break;
            
            const stylePrompt = `${basePrompt}, ${styles[i]} style, high quality`;
            stream.progress(`⏳ Generating variation ${i + 1}/3 (${styles[i]})...`);
            
            try {
                const model = config.get<string>('model') || 'sdxl-lightning';
                const imageUrl = await this.pollGeneration(apiKey, model, stylePrompt, stream, token);
                
                if (imageUrl) {
                    const localPath = await this.downloadToTemp(imageUrl, `${basePrompt}_${styles[i]}`);
                    variations.push({ path: localPath, style: styles[i], prompt: stylePrompt });
                    
                    stream.markdown(`✅ **Variation ${i + 1} (${styles[i]})** ready!\n\n`);
                    stream.button({ 
                        command: 'oclite.previewImage', 
                        title: `👁️ Preview ${styles[i]}`, 
                        arguments: [localPath] 
                    });
                }
            } catch (err: any) {
                stream.markdown(`⚠️ Variation ${i + 1} failed: ${err.message}\n\n`);
            }
        }
        
        stream.markdown(`\n### 📊 Batch Complete: ${variations.length}/3 successful\n\n`);
        return { metadata: { command: 'batch', count: variations.length } };
    }
    
    // ── New Feature: Style-Specific Generation ──
    private async handleStyleGeneration(
        style: string,
        content: string,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken,
        config: vscode.WorkspaceConfiguration,
        apiKey: string
    ): Promise<any> {
        const stylePresets: Record<string, string> = {
            'anime': 'anime style, cel shading, vibrant colors, manga aesthetic, Studio Ghibli quality',
            'realistic': 'photorealistic, 8k uhd, professional photography, natural lighting, highly detailed',
            'cyberpunk': 'cyberpunk style, neon lights, futuristic, dark atmosphere, blade runner aesthetic',
            'fantasy': 'fantasy art, magical atmosphere, epic composition, concept art, trending on artstation',
            'minimalist': 'minimalist design, clean lines, simple composition, modern aesthetic, negative space',
            'watercolor': 'watercolor painting, soft edges, artistic, traditional media, gentle colors',
        };
        
        const styleEnhancement = stylePresets[style.toLowerCase()] || style;
        const enhancedPrompt = `${content}, ${styleEnhancement}`;
        
        stream.markdown(`### 🎨 Style: ${style}\n\n`);
        stream.markdown(`**Enhanced prompt:** _${enhancedPrompt}_\n\n`);
        
        try {
            const model = config.get<string>('model') || 'sdxl-lightning';
            const imageUrl = await this.pollGeneration(apiKey, model, enhancedPrompt, stream, token);
            
            if (imageUrl) {
                const localPath = await this.downloadToTemp(imageUrl, enhancedPrompt);
                stream.markdown(`✅ **${style} style image ready!**\n\n`);
                stream.button({ command: 'oclite.previewImage', title: '👁️ Preview', arguments: [localPath] });
                stream.button({ command: 'oclite.saveImage', title: '💾 Save', arguments: [localPath, enhancedPrompt] });
                return { metadata: { command: 'style', style } };
            }
        } catch (err: any) {
            stream.markdown(`❌ Generation failed: ${err.message}\n\n`);
        }
        
        return { metadata: { command: 'style' } };
    }
    
    // ── New Feature: Compare Generation ──
    private async handleCompareGeneration(
        comparePrompt: string,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken,
        config: vscode.WorkspaceConfiguration,
        apiKey: string
    ): Promise<any> {
        stream.markdown('### 🔍 Compare Mode\n\n');
        stream.markdown('Generating with 2 different models for comparison...\n\n');
        
        const models = ['sdxl-lightning', 'flux-schnell'];
        const results = [];
        
        for (const model of models) {
            if (token.isCancellationRequested) break;
            
            stream.progress(`⏳ Generating with ${model}...`);
            
            try {
                const imageUrl = await this.pollGeneration(apiKey, model, comparePrompt, stream, token);
                
                if (imageUrl) {
                    const localPath = await this.downloadToTemp(imageUrl, `${comparePrompt}_${model}`);
                    results.push({ path: localPath, model });
                    
                    stream.markdown(`✅ **${model}** complete!\n\n`);
                    stream.button({ 
                        command: 'oclite.previewImage', 
                        title: `👁️ View ${model}`, 
                        arguments: [localPath] 
                    });
                }
            } catch (err: any) {
                stream.markdown(`⚠️ ${model} failed: ${err.message}\n\n`);
            }
        }
        
        stream.markdown(`\n### 📊 Comparison Complete\n\nReview both results to see which model works best for your needs!\n\n`);
        return { metadata: { command: 'compare', count: results.length } };
    }
    
    // ── New Feature: Workspace-Aware Generation ──
    private async handleWorkspaceGeneration(
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken,
        config: vscode.WorkspaceConfiguration,
        apiKey: string
    ): Promise<any> {
        stream.markdown('### 🏢 Workspace Analysis\n\n');
        stream.progress('🔍 Analyzing workspace...');
        
        const suggestion = await this.aiService.getWorkspaceSuggestion();
        
        if (!suggestion) {
            stream.markdown('⚠️ No workspace detected. Open a project folder to use this feature.\n\n');
            return { metadata: { command: 'workspace' } };
        }
        
        stream.markdown(`**Detected:** ${suggestion.type} project\n\n`);
        stream.markdown(`**Recommended style:** ${suggestion.suggestion}\n\n`);
        
        const prompts = {
            'React': 'modern UI icon set, flat design, colorful, professional',
            'Unity': 'game character concept art, dynamic pose, detailed',
            'Godot': 'pixel art game sprite, 16-bit style, retro',
            'Unreal Engine': 'environment concept art, cinematic, photorealistic',
        };
        
        const defaultPrompt = prompts[suggestion.type as keyof typeof prompts] || 'professional asset';
        
        stream.markdown(`💡 **Suggested prompt:** _${defaultPrompt}_\n\n`);
        stream.button({ 
            command: 'oclite.generateFromPrompt', 
            title: '🎨 Generate Suggested Asset', 
            arguments: [defaultPrompt] 
        });
        
        return { metadata: { command: 'workspace', type: suggestion.type } };
    }

    private async pollGeneration(
        apiKey: string,
        model: string,
        prompt: string,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<string | null> {
        // Use Azure Function for image generation
        const generatorUrl = getGeneratorUrl();
        
        console.log(`[OCLite] POST ${generatorUrl} | prompt_len=${prompt.length}`);
        
        try {
            const response = await axios.post(
                generatorUrl,
                { prompt: prompt },
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 120000, // 2 minutes for image generation
                    cancelToken: new axios.CancelToken((c) => token.onCancellationRequested(() => c())),
                }
            );
            
            console.log(`[OCLite] Generate OK: HTTP ${response.status} | ${JSON.stringify(response.data).substring(0, 200)}`);
            
            let imageUrl = null;
            if (response.data.status === 'succeeded' && response.data.images && response.data.images.length > 0) {
                imageUrl = response.data.images[0];
            } else if (response.data.output && response.data.output.length > 0) {
                // Legacy format support
                imageUrl = response.data.output[0];
            }
            
            if (!imageUrl) {
                console.error('[OCLite] No image URL in response:', JSON.stringify(response.data));
                throw new Error('No image URL in response');
            }
            
            // Validate the URL
            if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
                console.error('[OCLite] Invalid image URL format:', imageUrl);
                throw new Error(`Invalid image URL format: ${imageUrl}`);
            }
            
            console.log(`[OCLite] Generated image URL: ${imageUrl}`);
            return imageUrl;
            
        } catch (err: any) {
            const status = err.response?.status;
            const errBody = JSON.stringify(err.response?.data || err.message).substring(0, 300);
            console.error(`[OCLite] Generate failed: HTTP ${status} | ${errBody}`);
            throw err;
        }
    }

    private async tryCloudUpload(
        localPath: string,
        prompt: string,
        model: string,
        stream: vscode.ChatResponseStream
    ): Promise<void> {
        try {
            const user = getCurrentUser();
            if (user && fs.existsSync(localPath)) {
                stream.progress('☁️ Uploading to cloud...');
                const buf = fs.readFileSync(localPath);
                const shareUrl = await uploadGeneratedImage(buf, prompt, model);
                if (shareUrl) {
                    stream.button({ command: 'oclite.copyShareLink', title: '📋 Share', arguments: [shareUrl] });
                    sendTelemetryEvent('generation.cloudUpload.success');
                }
            } else if (!user) {
                stream.markdown('\n💡 **Tip:** Sign in with Microsoft to enable cloud sharing.');
                sendTelemetryEvent('generation.cloudUpload.skipped', { reason: 'no_auth' });
            }
        } catch (err: any) {
            stream.markdown('\n💡 **Note:** Cloud sharing unavailable right now.');
            sendTelemetryEvent('generation.cloudUpload.error', { error: err.message });
        }
    }

    // ── Image Preview Webview ──────────────────────────────────────────

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
            // Convert local file path to webview URI
            const fileUri = vscode.Uri.file(imagePath);
            imageUri = panel.webview.asWebviewUri(fileUri).toString();
            fileName = path.basename(imagePath);
        } else {
            // Use URL directly for remote images (blob storage URLs)
            imageUri = imagePath;
            fileName = 'Remote Image';
            
            // Extract filename from URL if possible
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
        
        console.log(`[OCLite] Creating image preview: ${fileName}`);
        console.log(`[OCLite] Image URI: ${imageUri}`);
        
        panel.webview.html = `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${panel.webview.cspSource} https: http: data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
                <title>${title}</title>
                <style>
                    html, body { 
                        height: 100%; 
                        width: 100%; 
                        margin: 0; 
                        padding: 0; 
                        background: var(--vscode-editor-background);
                        color: var(--vscode-editor-foreground);
                        font-family: var(--vscode-font-family);
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                    }
                    .container {
                        max-width: 95%;
                        max-height: 95%;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        gap: 16px;
                    }
                    .image-container {
                        max-width: 100%;
                        max-height: 80vh;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 8px;
                        overflow: hidden;
                        background: var(--vscode-editor-inactiveSelectionBackground);
                        position: relative;
                    }
                    img {
                        max-width: 100%;
                        max-height: 100%;
                        object-fit: contain;
                        display: block;
                    }
                    .info {
                        text-align: center;
                        padding: 12px;
                        background: var(--vscode-editor-inactiveSelectionBackground);
                        border-radius: 6px;
                        border: 1px solid var(--vscode-panel-border);
                        max-width: 100%;
                    }
                    .filename {
                        font-weight: 600;
                        margin-bottom: 4px;
                        word-break: break-all;
                    }
                    .path {
                        font-size: 12px;
                        opacity: 0.7;
                        font-family: var(--vscode-editor-font-family);
                        word-break: break-all;
                    }
                    .loading {
                        text-align: center;
                        opacity: 0.7;
                        position: absolute;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                    }
                    .error {
                        color: var(--vscode-errorForeground);
                        text-align: center;
                        padding: 20px;
                        position: absolute;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                    }
                    .hidden {
                        display: none !important;
                    }
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
                    console.log('[OCLite Preview] Loading image:', '${imageUri}');
                    
                    const img = document.getElementById('previewImage');
                    const loading = document.getElementById('loading');
                    const error = document.getElementById('error');
                    
                    img.onload = function() {
                        console.log('[OCLite Preview] Image loaded successfully');
                        loading.classList.add('hidden');
                        error.classList.add('hidden');
                        img.style.display = 'block';
                    };
                    
                    img.onerror = function() {
                        console.log('[OCLite Preview] Image failed to load');
                        loading.classList.add('hidden');
                        error.classList.remove('hidden');
                    };
                    
                    // Set a timeout for loading
                    setTimeout(function() {
                        if (loading && !loading.classList.contains('hidden')) {
                            console.log('[OCLite Preview] Image load timeout');
                            loading.classList.add('hidden');
                            error.classList.remove('hidden');
                        }
                    }, 10000); // 10 second timeout
                </script>
            </body>
            </html>`;
    }

    // ── Temp file management ───────────────────────────────────────────────

    private async downloadToTemp(imageUrl: string, prompt: string): Promise<string> {
        console.log(`[OCLite] Downloading image from: ${imageUrl}`);
        console.log(`[OCLite] Prompt: ${prompt.substring(0, 50)}...`);
        
        // Validate URL before attempting download
        if (!imageUrl || !imageUrl.startsWith('http')) {
            throw new Error(`Invalid image URL: ${imageUrl}`);
        }
        
        try {
            const response = await axios.get(imageUrl, { 
                responseType: 'arraybuffer', 
                timeout: 30000,
                headers: {
                    'User-Agent': 'OCLite-VSCode-Extension'
                }
            });
            
            console.log(`[OCLite] Download response status: ${response.status}`);
            console.log(`[OCLite] Content-Type: ${response.headers['content-type']}`);
            console.log(`[OCLite] Content-Length: ${response.data.byteLength} bytes`);
            
            if (!response.data || response.data.byteLength === 0) {
                throw new Error('Downloaded image is empty');
            }
            
            // Validate content type
            const contentType = response.headers['content-type'] || '';
            if (!contentType.startsWith('image/')) {
                console.warn(`[OCLite] Unexpected content type: ${contentType}`);
                // Don't throw error, some servers don't set proper content-type
            }
            
            const tempDir = path.join(os.tmpdir(), 'oclite');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
                console.log(`[OCLite] Created temp directory: ${tempDir}`);
            }

            const slug = prompt.slice(0, 30).replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
            const tempPath = path.join(tempDir, `${slug}_${Date.now()}.png`);
            
            // Write the buffer to file
            const buffer = Buffer.from(response.data);
            fs.writeFileSync(tempPath, buffer);
            
            // Verify the file was written correctly
            const stats = fs.statSync(tempPath);
            console.log(`[OCLite] Saved image to: ${tempPath}`);
            console.log(`[OCLite] File size: ${stats.size} bytes`);
            
            if (stats.size === 0) {
                throw new Error('Saved image file is empty');
            }

            downloadedImages.set(tempPath, tempPath);
            setTimeout(() => OCLiteChatParticipant.cleanupTempFile(tempPath), 30 * 60 * 1000);
            return tempPath;
        } catch (error: any) {
            console.error(`[OCLite] Download failed:`, error);
            if (error.code === 'ENOTFOUND') {
                throw new Error(`Failed to download image: Network error - could not resolve host`);
            } else if (error.code === 'ETIMEDOUT') {
                throw new Error(`Failed to download image: Request timed out`);
            } else {
                throw new Error(`Failed to download image: ${error.message}`);
            }
        }
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
                
                let name = 'oclite_asset.png';
                try { 
                    name = await this.aiService.generateName(prompt); 
                    console.log(`[OCLite] Generated filename: ${name}`);
                } catch (e) { 
                    console.warn(`[OCLite] Failed to generate name, using default: ${name}`);
                }

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
                    OCLiteChatParticipant.cleanupTempFile(tempPath);
                    sendTelemetryEvent('command.saveImage.success');
                }
            } catch (e: any) {
                console.error(`[OCLite] Save error:`, e);
                vscode.window.showErrorMessage(`Failed to save image: ${e.message}`);
                sendTelemetryEvent('command.saveImage.error', { error: e.message });
            }
        });

        const preview = vscode.commands.registerCommand('oclite.previewImage', async (imagePath: string) => {
            try {
                if (!imagePath) {
                    vscode.window.showErrorMessage('👁️ Preview failed: No image path provided.');
                    return;
                }

                console.log('[OCLite] Preview image request:', imagePath);
                console.log('[OCLite] Is URL?', imagePath.startsWith('http'));
                console.log('[OCLite] File exists?', fs.existsSync(imagePath));

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
                    // Convert local path to webview URI for proper display
                    const fileName = path.basename(imagePath);
                    await this.createImagePreviewWebview(imagePath, `Preview: ${fileName}`, true);
                    sendTelemetryEvent('command.previewImage.success', { type: 'local' });
                } else {
                    // File doesn't exist, show error with helpful message
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
        });
        
        const generateFromPrompt = vscode.commands.registerCommand('oclite.generateFromPrompt', async (prompt: string) => {
            // Trigger chat with the prompt
            await vscode.commands.executeCommand('workbench.action.chat.open', {
                query: `@oclite ${prompt}`
            });
            sendTelemetryEvent('command.generateFromPrompt.triggered');
        });

        return [saveImage, preview, generateFromPrompt];
    }
}
