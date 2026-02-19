import axios from 'axios';
import * as vscode from 'vscode';
import * as path from 'path';

// OCLite API endpoints (image generation only — not secret)
const OCLITE_API_BASE_URL = 'https://oclite-api.onrender.com';

// Azure Function base URL (the ?code= key is stored in SecretStorage)
const AZURE_CHAT_BASE_URL =
    'https://oclite-llm-key-c4hkcvdfejf6f8e5.canadacentral-01.azurewebsites.net/api/ChatWithAI';

// Category-specific style presets for SDXL optimization
const CATEGORY_PRESETS: Record<string, string> = {
    'Character': 'Focus on character design, dynamic pose, expressive features, detailed costume/armor, professional concept art style, anatomically correct, strong silhouette, ambient occlusion.',
    'UI Icon': 'Clean vector-style icon, minimal design, centered composition, solid or gradient background, high contrast, crisp edges, suitable for UI/UX, flat design or subtle 3D effect.',
    'Environment': 'Cinematic environment, atmospheric perspective, volumetric lighting, detailed background elements, wide composition, Unreal Engine 5 quality, matte painting style.',
    'Texture': 'Seamless tileable texture, high detail PBR-ready, consistent lighting, no obvious seams, 4K quality, material-focused, neutral lighting for game assets.',
    'Pixel Art': '16-bit pixel art style, retro game aesthetic, limited color palette, clean pixel edges, nostalgic Nintendo/SNES style, sprite-ready composition.',
    'Vector': 'Vector flat illustration, clean geometric shapes, bold colors, minimal gradients, scalable design, modern flat design aesthetic, Adobe Illustrator style.'
};

export class AIService {
    /**
     * Initialize with extension context
     */
    constructor(private context: vscode.ExtensionContext) {}

    private get config() {
        return vscode.workspace.getConfiguration('oclite');
    }

    /**
     * Get OCLite API key from VS Code configuration.
     * Users must set this via oclite.setApiKey command.
     */
    public getApiKey(): string | undefined {
        return this.config.get<string>('apiKey');
    }

    /**
     * Check if the AI service has an API key configured.
     */
    public isConfigured(): boolean {
        const key = this.getApiKey();
        return !!key;
    }

    // ─── Core: Call LLM via Azure Function (key from SecretStorage) ───
    /**
     * Send a prompt to the Azure Function AI gateway.
     * The function key (?code=...) is stored in VS Code SecretStorage.
     * Returns the assistant message content, or null on failure.
     */
    private async callLLM(systemPrompt: string, userMessage: string): Promise<string | null> {
        try {
            const functionKey = await this.context.secrets.get('oclite.azureChatKey');
            if (!functionKey) {
                console.warn('[OCLite LLM] No Azure Function key stored. Skipping LLM call.');
                return null;
            }

            const url = `${AZURE_CHAT_BASE_URL}?code=${functionKey}`;
            const combinedPrompt = `${systemPrompt}\n\nUser: ${userMessage}`;

            console.log('[OCLite LLM] Calling Azure Function AI gateway...');

            const response = await axios.post(url, {
                prompt: combinedPrompt
            }, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 30000
            });

            const body = response.data;
            const content = (
                body.result ??
                body.response ??
                body.message ??
                body.choices?.[0]?.message?.content ??
                ''
            ).trim();

            if (content) {
                console.log('[OCLite LLM] Response:', content.substring(0, 120));
                return content;
            }

            console.warn('[OCLite LLM] Empty response from Azure Function');
        } catch (error: any) {
            console.error('[OCLite LLM] Call failed:', error.response?.status, error.response?.data || error.message);
        }

        return null;
    }

    // ─── Phase 1: Prompt Refinement ─────────────────────────────────────
    /**
     * Sends user prompt to Azure Function AI gateway for refinement.
     * The LLM determines the optimal style, colors, lighting, composition.
     * Falls back to local preset enhancement if LLM is unavailable.
     */
    async refinePrompt(userPrompt: string, category?: string): Promise<{ prompt: string; fromLLM: boolean }> {
        const categoryHint = category && category !== 'None' && CATEGORY_PRESETS[category]
            ? `\nIMPORTANT aspect for ${category} category: ${CATEGORY_PRESETS[category]}`
            : '';

        const systemPrompt = `You are a professional prompt engineer for Stable Diffusion XL image generation.
Transform the user's short description into a professional, detailed SDXL prompt.
Determine the best artistic STYLE, optimal COLORS and color palette, LIGHTING details, COMPOSITION details, and QUALITY tags.
Do NOT add any text or watermark instructions. Maximum 75 words.
Output ONLY the final prompt, no explanations.${categoryHint}`;

        console.log('[OCLite] Attempting LLM prompt refinement via Azure Function...');
        const result = await this.callLLM(systemPrompt, userPrompt);
        if (result) {
            const cleaned = result.replace(/^["']|["']$/g, '').trim();
            if (cleaned.length > 10) {
                console.log('[OCLite] LLM refinement succeeded.');
                return { prompt: cleaned, fromLLM: true };
            }
        }

        console.warn('[OCLite] LLM refinement failed or returned empty. Using local fallback.');
        return { prompt: this.localRefinePrompt(userPrompt, category), fromLLM: false };
    }

    /**
     * Local fallback prompt enhancement when LLM is unavailable
     */
    private localRefinePrompt(userPrompt: string, category?: string): string {
        const categoryPreset = category && category !== 'None' && CATEGORY_PRESETS[category]
            ? CATEGORY_PRESETS[category]
            : '';

        const qualityBoosters = 'highly detailed, masterpiece, professional quality, 8K, sharp focus';
        const lightingBoosters = 'volumetric lighting, ambient occlusion, rim light';

        const parts = [
            userPrompt.trim(),
            categoryPreset,
            qualityBoosters,
            lightingBoosters,
        ].filter(Boolean);

        const refined = parts.join(', ');
        const words = refined.split(/\s+/);
        if (words.length > 75) {
            return words.slice(0, 75).join(' ');
        }
        return refined;
    }

    // ─── Phase 4: Smart Auto-Naming ─────────────────────────────────────
    /**
     * Asks LLM via Azure Function to produce a descriptive
     * snake_case filename. Falls back to keyword extraction.
     */
    async generateName(prompt: string, category?: string): Promise<string> {
        const categoryHint = category ? ` (category: ${category})` : '';

        const systemPrompt = `Generate a descriptive filename in snake_case format with .png extension.
Use 2-4 words that describe the content. Add suffix _01 for versioning.
Avoid generic words like image, asset, picture.
Output ONLY the filename. Example: dragon_concept_art_01.png`;

        const result = await this.callLLM(systemPrompt, `Prompt: "${prompt}"${categoryHint}`);
        if (result) {
            let name = result.replace(/[^a-zA-Z0-9_.-]/g, '').toLowerCase();
            if (name.length > 3) {
                if (!name.endsWith('.png')) {
                    name += '.png';
                }
                return name;
            }
        }

        return this.generateFallbackName(prompt, category);
    }

    /**
     * Generate descriptive filename from prompt keywords (fallback)
     */
    private generateFallbackName(prompt: string, category?: string): string {
        const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'image', 'asset', 'picture', 'generate', 'create', 'make']);
        const words = prompt.toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .split(/\s+/)
            .filter(w => w.length > 2 && !stopWords.has(w))
            .slice(0, 3);

        const prefix = category && category !== 'None' ? category.toLowerCase().replace(/\s+/g, '_') : '';
        const core = words.length > 0 ? words.join('_') : 'oclite_asset';
        const name = prefix ? `${prefix}_${core}` : core;
        return `${name}_01.png`;
    }

    /**
     * Phase 3: Analyze workspace to suggest optimal settings
     */
    async getWorkspaceSuggestion(): Promise<{ type: string, suggestion: string } | null> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return null;
        }

        const rootPath = workspaceFolders[0].uri.fsPath;

        // Simple detection logic
        if (await this.pathExists(path.join(rootPath, 'package.json'))) {
            const packageJsonContent = await this.readFile(path.join(rootPath, 'package.json'));
            if (packageJsonContent.includes('"react"')) return { type: 'React', suggestion: 'UI Icon' };
            if (packageJsonContent.includes('"vue"')) return { type: 'Vue', suggestion: 'UI Icon' };
            if (packageJsonContent.includes('"@angular/core"')) return { type: 'Angular', suggestion: 'UI Icon' };
        }
        if (await this.pathExists(path.join(rootPath, 'ProjectSettings/ProjectVersion.txt'))) {
            return { type: 'Unity', suggestion: 'Character' };
        }
        if (await this.pathExists(path.join(rootPath, '.godot'))) {
            return { type: 'Godot', suggestion: 'Pixel Art' };
        }
        if (await this.pathExists(path.join(rootPath, 'config/game.ini'))) { // A common pattern for Unreal
            return { type: 'Unreal Engine', suggestion: 'Environment' };
        }

        return null;
    }

    private async pathExists(p: string): Promise<boolean> {
        try {
            await vscode.workspace.fs.stat(vscode.Uri.file(p));
            return true;
        } catch {
            return false;
        }
    }

    private async readFile(p: string): Promise<string> {
        const data = await vscode.workspace.fs.readFile(vscode.Uri.file(p));
        return Buffer.from(data).toString('utf-8');
    }
}
