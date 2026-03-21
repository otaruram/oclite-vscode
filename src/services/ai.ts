import * as vscode from 'vscode';
import * as path from 'path';
import { callLLM } from './llm';
import { getOcliteApiKey } from '../utilities/secrets';

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
     * Get OCLite API key (embedded, auto-configured).
     */
    public getApiKey(): string | undefined {
        return getOcliteApiKey();
    }

    /**
     * Check if the AI service has an API key configured.
     */
    public isConfigured(): boolean {
        const key = this.getApiKey();
        return !!key;
    }

    // ─── Core: Call GPT-4o mini via shared LLM gateway (see llm.ts) ──

    // ─── Phase 1: Prompt Refinement ─────────────────────────────────────
    /**
     * Flow: User prompt → GPT-4o mini (refine) → refined prompt → image model
     * Falls back to local preset enhancement if GPT-4o mini is unavailable.
     */
    async refinePrompt(userPrompt: string, category?: string): Promise<{ prompt: string; fromLLM: boolean }> {
        const categoryHint = category && category !== 'None' && CATEGORY_PRESETS[category]
            ? `\nCategory focus: ${CATEGORY_PRESETS[category]}`
            : '';

        const systemPrompt = `YOU ARE A GAME ART DIRECTOR. YOUR ONLY JOB IS TO WRITE ASSET DESCRIPTIONS.

ABSOLUTE RULES:
1. NEVER ask questions - FORBIDDEN
2. NEVER say you need more info - FORBIDDEN  
3. ALWAYS write a complete game asset description
4. If input is vague, make professional assumptions
5. Output ONLY the description (max 75 words)

Format: [Art Style] [Asset Type], [Technical Details], [Quality Markers]

Examples:
"warrior" → "Stylized fantasy warrior character, dynamic combat pose, detailed plate armor with PBR textures, dramatic rim lighting, game-ready asset, AAA quality"

"tree" → "Hand-painted fantasy tree, modular design, optimized for real-time rendering, ambient occlusion baked, vibrant colors, production quality"

"car" → "Realistic sports car asset, high-poly model with PBR materials, detailed interior, dynamic reflections, 4K textures, game-ready"

Input: "${userPrompt}"${categoryHint}

Description (start writing NOW):`;

        console.log('[OCLite] Refining prompt...');
        try {
            const result = await callLLM(userPrompt, systemPrompt, 60_000, undefined, 'chatParticipant');
            
            if (result && !result.startsWith('⚠️')) {
                const cleaned = result.replace(/^["']|["']$/g, '').trim();
                
                // Check if AI is still asking questions
                if (cleaned.includes('?') || cleaned.toLowerCase().includes('could you') || cleaned.toLowerCase().includes('please provide')) {
                    console.warn('[OCLite] AI ignored instructions, using fallback');
                    return { prompt: this.localRefinePrompt(userPrompt, category), fromLLM: false };
                }
                
                if (cleaned.length > 10) {
                    console.log('[OCLite] AI refinement succeeded');
                    return { prompt: cleaned, fromLLM: true };
                }
            }
        } catch (error) {
            console.warn('[OCLite] AI refinement failed:', error);
        }

        console.warn('[OCLite] Using local fallback');
        return { prompt: this.localRefinePrompt(userPrompt, category), fromLLM: false };
    }

    /**
     * Local fallback prompt enhancement when LLM is unavailable.
     * Analyses the user prompt to pick contextual style, lighting, and composition
     * boosters instead of dumping a generic boilerplate.
     */
    private localRefinePrompt(userPrompt: string, category?: string): string {
        const prompt = userPrompt.trim().toLowerCase();

        // Game-focused style detection
        const GAME_STYLE_RULES: { keywords: string[]; style: string }[] = [
            { keywords: ['character', 'warrior', 'knight', 'hero', 'wizard', 'person', 'npc', 'player'],
              style: 'AAA game character asset, stylized art style, dynamic pose, detailed armor and clothing, PBR materials, game-ready topology, production quality' },
            { keywords: ['weapon', 'sword', 'gun', 'axe', 'bow', 'staff'],
              style: 'Game weapon asset, detailed textures, PBR materials, optimized for real-time rendering, game-ready, production quality' },
            { keywords: ['environment', 'landscape', 'terrain', 'world', 'scene', 'level'],
              style: 'Game environment asset, stylized or realistic style, optimized for real-time rendering, modular design, production quality' },
            { keywords: ['building', 'house', 'castle', 'structure', 'architecture'],
              style: 'Game architecture asset, modular design, tileable textures, optimized for real-time rendering, production quality' },
            { keywords: ['prop', 'object', 'item', 'furniture', 'decoration'],
              style: 'Game prop asset, detailed textures, PBR materials, optimized mesh, game-ready, production quality' },
            { keywords: ['ui', 'icon', 'button', 'interface', 'hud'],
              style: 'Game UI asset, clean vector style, high contrast, scalable design, production quality' },
            { keywords: ['texture', 'material', 'surface'],
              style: 'Seamless game texture, PBR-ready, tileable, high detail, optimized for real-time rendering' },
            { keywords: ['effect', 'vfx', 'particle', 'magic', 'spell'],
              style: 'Game VFX asset, stylized effect, optimized for real-time rendering, production quality' }
        ];

        let detectedStyle = 'AAA game asset, stylized art style, detailed textures, PBR materials, optimized for real-time rendering, production quality';
        
        for (const rule of GAME_STYLE_RULES) {
            if (rule.keywords.some(kw => prompt.includes(kw))) {
                detectedStyle = rule.style;
                break;
            }
        }

        // Category preset override
        const categoryPreset = category && category !== 'None' && CATEGORY_PRESETS[category]
            ? CATEGORY_PRESETS[category]
            : '';

        // Build final prompt with game industry focus
        const parts = [
            userPrompt.trim(),
            categoryPreset || detectedStyle,
            'Unreal Engine 5 quality, game-ready asset, highly detailed, masterpiece'
        ].filter(Boolean);

        const refined = parts.join(', ');
        const words = refined.split(/\s+/);
        return words.length > 75 ? words.slice(0, 75).join(' ') : refined;
    }

    // ─── Phase 4: Smart Auto-Naming ─────────────────────────────────────
    /**
     * Asks GPT-4o mini to produce a descriptive snake_case filename.
     * Falls back to keyword extraction if unavailable.
     */
    async generateName(prompt: string, category?: string): Promise<string> {
        const categoryHint = category ? ` (category: ${category})` : '';

        const systemPrompt = `Generate a descriptive filename in snake_case format with .png extension.
Use 2-4 words that describe the content. Add suffix _01 for versioning.
Avoid generic words like image, asset, picture.
Output ONLY the filename. Example: dragon_concept_art_01.png`;

        const result = await callLLM(`Prompt: "${prompt}"${categoryHint}`, systemPrompt, 60_000, undefined, 'ocliteGenerator');
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
     * Generate Mermaid syntax diagram from prompt
     */
    async generateMermaid(prompt: string, style: string = 'flowchart'): Promise<string> {
        // Map style to Mermaid syntax
        const styleMap: Record<string, string> = {
            'Flowchart': 'flowchart TD',
            'Sequence Diagram': 'sequenceDiagram',
            'Class Diagram': 'classDiagram',
            'State Diagram': 'stateDiagram-v2',
            'Entity Relationship Diagram': 'erDiagram',
            'User Journey': 'journey',
            'Gantt Chart': 'gantt',
            'Pie Chart': 'pie'
        };
        
        const mermaidType = styleMap[style] || 'flowchart TD';
        
        const systemPrompt = `YOU ARE A MERMAID CODE GENERATOR. YOU MUST ALWAYS OUTPUT VALID MERMAID.JS CODE.

ABSOLUTE RULES - NO EXCEPTIONS:
1. ALWAYS start your response with "${mermaidType}"
2. NEVER ask questions
3. NEVER explain anything
4. NEVER say you need more information
5. If input is vague, make reasonable assumptions and generate anyway
6. Output format: ONLY Mermaid code, nothing else

Diagram type: ${style}

Your response MUST be valid Mermaid code that starts with "${mermaidType}".

User input: "${prompt}"

Generate Mermaid code now (start with ${mermaidType}):`;

        console.log('[OCLite] Generating Mermaid diagram...');
        try {
            const result = await callLLM(prompt, systemPrompt, 60_000, undefined, 'ocliteGenerator');
            
            if (!result || result.trim().length === 0) {
                // Fallback: generate basic diagram
                return this.generateFallbackMermaid(prompt, mermaidType);
            }
            
            if (result.startsWith('⚠️')) {
                throw new Error(result);
            }
            
            // Clean up response
            let cleanResult = result
                .replace(/^```[\s\S]*?\n/g, '')
                .replace(/```$/g, '')
                .replace(/^mermaid\n/i, '')
                .trim();
            
            // Validate Mermaid syntax
            const mermaidKeywords = ['flowchart', 'sequenceDiagram', 'classDiagram', 'stateDiagram', 'erDiagram', 'journey', 'gantt', 'pie'];
            const hasKeyword = mermaidKeywords.some(kw => cleanResult.toLowerCase().includes(kw.toLowerCase()));
            
            if (!hasKeyword) {
                console.warn('[OCLite] AI did not generate Mermaid code, using fallback');
                return this.generateFallbackMermaid(prompt, mermaidType);
            }
            
            console.log('[OCLite] Generated Mermaid code successfully');
            return cleanResult;
        } catch (error: any) {
            console.error('[OCLite] generateMermaid error, using fallback:', error.message);
            return this.generateFallbackMermaid(prompt, mermaidType);
        }
    }
    
    private generateFallbackMermaid(prompt: string, mermaidType: string): string {
        // Generate basic diagram based on prompt keywords
        const words = prompt.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        const mainTopic = words[0] || 'Topic';
        
        if (mermaidType === 'flowchart TD') {
            return `flowchart TD
    A[Start: ${mainTopic}] --> B[Process]
    B --> C{Decision}
    C -->|Yes| D[Action 1]
    C -->|No| E[Action 2]
    D --> F[End]
    E --> F`;
        } else if (mermaidType === 'sequenceDiagram') {
            return `sequenceDiagram
    participant User
    participant System
    User->>System: Request ${mainTopic}
    System->>System: Process
    System->>User: Response`;
        } else if (mermaidType === 'classDiagram') {
            return `classDiagram
    class ${mainTopic.charAt(0).toUpperCase() + mainTopic.slice(1)} {
        +property1
        +property2
        +method1()
        +method2()
    }`;
        } else if (mermaidType === 'pie') {
            return `pie title ${mainTopic}
    "Category A": 40
    "Category B": 30
    "Category C": 20
    "Category D": 10`;
        } else {
            return `${mermaidType}
    [*] --> State1
    State1 --> State2: ${mainTopic}
    State2 --> [*]`;
        }
    }
    
    private getMermaidExample(style: string): string {
        const examples: Record<string, string> = {
            'Flowchart': 'flowchart TD\n    A[Start] --> B[Process]\n    B --> C{Decision}\n    C -->|Yes| D[End]\n    C -->|No| B',
            'Sequence Diagram': 'sequenceDiagram\n    participant A as User\n    participant B as System\n    A->>B: Request\n    B->>A: Response',
            'Class Diagram': 'classDiagram\n    class Animal {\n        +String name\n        +makeSound()\n    }\n    class Dog {\n        +bark()\n    }\n    Animal <|-- Dog',
            'State Diagram': 'stateDiagram-v2\n    [*] --> Idle\n    Idle --> Processing\n    Processing --> Complete\n    Complete --> [*]',
            'Entity Relationship Diagram': 'erDiagram\n    USER ||--o{ ORDER : places\n    ORDER ||--|{ ITEM : contains',
            'User Journey': 'journey\n    title User Journey\n    section Login\n        Enter credentials: 5: User\n        Verify: 3: System',
            'Gantt Chart': 'gantt\n    title Project Timeline\n    section Phase 1\n    Task 1: 2024-01-01, 7d\n    Task 2: 2024-01-08, 5d',
            'Pie Chart': 'pie title Distribution\n    "Category A": 45\n    "Category B": 30\n    "Category C": 25'
        };
        
        return examples[style] || examples['Flowchart'];
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
