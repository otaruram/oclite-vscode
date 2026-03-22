import * as vscode from 'vscode';

export interface ProjectInfo {
    type: 'unity' | 'unreal' | 'godot' | 'react' | 'vue' | 'angular' | 'python' | 'generic';
    name: string;
    suggestedStyle: string;
    message: string;
    icon: string;
}

const PROJECT_DETECTORS: { pattern: string; exclude: string; info: ProjectInfo }[] = [
    {
        pattern: '**/*.unity',
        exclude: '**/Library/**',
        info: { type: 'unity', name: 'Unity', suggestedStyle: 'Pixel Art', message: 'Unity project detected. Suggesting sprite-ready PNG with transparent background.', icon: '🎮' }
    },
    {
        pattern: '**/Assets/**/*.cs',
        exclude: '**/Library/**',
        info: { type: 'unity', name: 'Unity', suggestedStyle: 'Texture', message: 'Unity C# scripts detected. Suggesting game textures or sprites.', icon: '🎮' }
    },
    {
        pattern: '**/*.uproject',
        exclude: '',
        info: { type: 'unreal', name: 'Unreal Engine', suggestedStyle: 'Texture', message: 'Unreal project detected. Suggesting high-res PBR textures.', icon: '🎯' }
    },
    {
        pattern: '**/project.godot',
        exclude: '',
        info: { type: 'godot', name: 'Godot', suggestedStyle: 'Pixel Art', message: 'Godot project detected. Suggesting 2D sprites or pixel art.', icon: '🤖' }
    },
    {
        pattern: '**/package.json',
        exclude: '**/node_modules/**',
        info: { type: 'react', name: 'Web/Node.js', suggestedStyle: 'UI Icon', message: 'Web project detected. Suggesting UI icons with transparent background.', icon: '💻' }
    },
    {
        pattern: '**/*.py',
        exclude: '**/venv/**',
        info: { type: 'python', name: 'Python', suggestedStyle: 'Vector', message: 'Python project detected. Suggesting clean vector graphics.', icon: '🐍' }
    }
];

export class WorkspaceScanner {
    
    /**
     * Phase 3: Enhanced Workspace Scanner
     * Detects project type and provides contextual suggestions
     */
    public async analyzeWorkspace(): Promise<ProjectInfo | null> {
        for (const detector of PROJECT_DETECTORS) {
            const files = await vscode.workspace.findFiles(
                detector.pattern,
                detector.exclude || undefined,
                1
            );

            if (files.length > 0) {
                let detectedProject = { ...detector.info };

                // Additional detection for React/Vue/Angular
                if (detector.info.type === 'react') {
                    const pkgInfo = await this.detectWebFramework();
                    if (pkgInfo) {
                        detectedProject = { ...detector.info, ...pkgInfo };
                    }
                }
                return detectedProject;
            }
        }
        return null;
    }

    /**
     * Detect specific web framework from package.json
     */
    private async detectWebFramework(): Promise<Partial<ProjectInfo> | null> {
        try {
            const pkgFiles = await vscode.workspace.findFiles('package.json', '**/node_modules/**', 1);
            if (pkgFiles.length === 0) return null;

            const content = await vscode.workspace.fs.readFile(pkgFiles[0]);
            const pkg = JSON.parse(content.toString());
            const deps = { ...pkg.dependencies, ...pkg.devDependencies };

            if (deps['react'] || deps['next']) {
                return { name: 'React', message: 'React project detected. Suggesting UI icons with transparent background.', icon: '⚛️' };
            }
            if (deps['vue'] || deps['nuxt']) {
                return { name: 'Vue.js', message: 'Vue.js project detected. Suggesting clean UI components.', icon: '💚' };
            }
            if (deps['@angular/core']) {
                return { name: 'Angular', message: 'Angular project detected. Suggesting Material Design icons.', icon: '🅰️' };
            }
        } catch {
            return null;
        }
        return null;
    }

    /**
     * Extract project name and up to 3 keywords from README.md (first 100 lines)
     */
    public async extractReadmeKeywords(): Promise<string[]> {
        try {
            const files = await vscode.workspace.findFiles('README.md', '**/node_modules/**', 1);
            if (!files.length) return [];
            const content = await vscode.workspace.fs.readFile(files[0]);
            const text = content.toString().split('\n').slice(0, 100).join(' ');
            
            // Simple keyword extraction: most frequent capitalized words (not stopwords)
            const stopwords = ['The', 'And', 'For', 'With', 'This', 'That', 'From', 'Your', 'You', 'Are', 'Have', 'Will', 'Can', 'But', 'Not', 'All', 'Use', 'More', 'Than', 'Was', 'Has', 'Had', 'Its', 'May', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
            const matches = text.match(/\b([A-Z][a-zA-Z0-9\-]*)\b/g) || [];
            
            const freq: Record<string, number> = {};
            for (const word of matches) {
                if (stopwords.includes(word)) continue;
                freq[word] = (freq[word] || 0) + 1;
            }
            
            const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
            return sorted.slice(0, 3).map(([w]) => w);
        } catch {
            return [];
        }
    }
}
