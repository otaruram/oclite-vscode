/**
 * SlashCommandHandler.ts — Handles all slash commands for OCLite chat
 */
import * as vscode from 'vscode';
import { AIService } from '../../services/ai';
import { ImageGenerationService } from '../services/ImageGenerationService';
import { sendTelemetryEvent } from '../../services/telemetry';

export interface SlashCommandResult {
    handled: boolean;
    metadata: any;
}

export class SlashCommandHandler {
    constructor(
        private readonly aiService: AIService,
        private readonly imageService: ImageGenerationService
    ) {}

    /**
     * Process slash commands and return result
     */
    async handleSlashCommand(
        userPrompt: string,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken,
        config: vscode.WorkspaceConfiguration,
        apiKey: string
    ): Promise<SlashCommandResult> {
        const trimmedPrompt = userPrompt.trim();

        // /batch command - Generate multiple variations
        if (trimmedPrompt.startsWith('/batch ')) {
            const basePrompt = trimmedPrompt.substring(7).trim();
            const result = await this.handleBatchGeneration(basePrompt, stream, token, config, apiKey);
            return { handled: true, metadata: result };
        }

        // /style command - Apply specific art style
        if (trimmedPrompt.startsWith('/style ')) {
            const parts = trimmedPrompt.substring(7).split(':');
            if (parts.length === 2) {
                const style = parts[0].trim();
                const content = parts[1].trim();
                const result = await this.handleStyleGeneration(style, content, stream, token, config, apiKey);
                return { handled: true, metadata: result };
            }
        }

        // /remix command - Remix existing image with new prompt
        if (trimmedPrompt.startsWith('/remix ')) {
            stream.markdown('🎨 **Remix Mode** - Attach an image and describe changes!\n\n');
            stream.markdown('💡 Tip: Drag an image into chat, then use `/remix your changes here`\n\n');
            return { handled: true, metadata: { command: 'remix' } };
        }

        // /compare command - Generate side-by-side comparisons
        if (trimmedPrompt.startsWith('/compare ')) {
            const comparePrompt = trimmedPrompt.substring(9).trim();
            const result = await this.handleCompareGeneration(comparePrompt, stream, token, config, apiKey);
            return { handled: true, metadata: result };
        }

        // /workspace command - Generate based on workspace context
        if (trimmedPrompt.startsWith('/workspace')) {
            const result = await this.handleWorkspaceGeneration(stream, token, config, apiKey);
            return { handled: true, metadata: result };
        }

        return { handled: false, metadata: {} };
    }

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
                const imageUrl = await this.imageService.generateImage(apiKey, model, stylePrompt, stream, token);
                
                if (imageUrl) {
                    const localPath = await this.imageService.downloadToTemp(imageUrl, `${basePrompt}_${styles[i]}`);
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
        sendTelemetryEvent('chat.batch.completed', { 
            successCount: variations.length.toString(),
            totalRequested: '3'
        });
        
        return { command: 'batch', count: variations.length };
    }

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
            const imageUrl = await this.imageService.generateImage(apiKey, model, enhancedPrompt, stream, token);
            
            if (imageUrl) {
                const localPath = await this.imageService.downloadToTemp(imageUrl, enhancedPrompt);
                stream.markdown(`✅ **${style} style image ready!**\n\n`);
                stream.button({ command: 'oclite.previewImage', title: '👁️ Preview', arguments: [localPath] });
                stream.button({ command: 'oclite.saveImage', title: '💾 Save', arguments: [localPath, enhancedPrompt] });
                
                sendTelemetryEvent('chat.style.generated', { style: style.toLowerCase() });
                return { command: 'style', style };
            }
        } catch (err: any) {
            stream.markdown(`❌ Generation failed: ${err.message}\n\n`);
        }
        
        return { command: 'style' };
    }

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
                const imageUrl = await this.imageService.generateImage(apiKey, model, comparePrompt, stream, token);
                
                if (imageUrl) {
                    const localPath = await this.imageService.downloadToTemp(imageUrl, `${comparePrompt}_${model}`);
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
        sendTelemetryEvent('chat.compare.completed', { 
            successCount: results.length.toString(),
            modelsCompared: models.join(',')
        });
        
        return { command: 'compare', count: results.length };
    }

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
            return { command: 'workspace' };
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
        
        sendTelemetryEvent('chat.workspace.analyzed', { 
            projectType: suggestion.type,
            suggestion: suggestion.suggestion
        });
        
        return { command: 'workspace', type: suggestion.type };
    }
}