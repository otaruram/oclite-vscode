import * as vscode from "vscode";
import { getUri } from "../utilities/getUri";
import { getNonce } from "../utilities/getNonce";
import { AIService } from "../services/ai";
import axios from "axios";
import { getOcliteApiKey, getOcliteApiUrl, getOclitePollUrl } from '../utilities/secrets';

// Project type definitions for workspace detection
interface ProjectInfo {
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

export class SidebarProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = "oclite.sidebarView";

    private _view?: vscode.WebviewView;
    private _aiService: AIService;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        aiService: AIService
    ) {
        this._aiService = aiService;
    }

    // State to track generation context
    private _lastPrompt: string = "";
    private _lastCategory: string = "";
    private _detectedProject: ProjectInfo | null = null;

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview, this._extensionUri);

        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case "generate":
                    this._lastPrompt = message.prompt;
                    this._lastCategory = message.style;
                    await this.handleGenerate(message.prompt, message.style);
                    break;
                case "get-workspace-suggestion":
                    // ...existing code...
                    const suggestion = await this._aiService.getWorkspaceSuggestion();
                    if (suggestion) {
                        this._view?.webview.postMessage({ command: 'workspace-suggestion', ...suggestion });
                    }
                    break;
                case "set-api-key":
                    vscode.commands.executeCommand('oclite.setApiKey');
                    break;
                case "requestSuggestion":
                    // New: scan README.md for keywords and project name
                    const keywords = await this.extractReadmeKeywords();
                    if (keywords && keywords.length) {
                        this._view?.webview.postMessage({ type: 'aiSuggestion', suggestion: `Smart Suggestions: ${keywords.join(', ')}` });
                    }
                    break;
                case "open-excalidraw":
                    vscode.commands.executeCommand('oclite.openCanvas');
                    await vscode.env.clipboard.writeText(message.code);
                    vscode.window.showInformationMessage('📋 Mermaid code copied! In Excalidraw, select Insert -> Mermaid to Excalidraw and paste.');
                    break;
            }
        });
    }

    /**
     * Extract project name and up to 3 keywords from README.md (first 100 lines)
     */
    private async extractReadmeKeywords(): Promise<string[]> {
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

    /**
     * Phase 3: Enhanced Workspace Scanner
     * Detects project type and provides contextual suggestions
     */
    private async analyzeWorkspace() {
        for (const detector of PROJECT_DETECTORS) {
            const files = await vscode.workspace.findFiles(
                detector.pattern,
                detector.exclude || undefined,
                1
            );

            if (files.length > 0) {
                this._detectedProject = detector.info;

                // Additional detection for React/Vue/Angular
                if (detector.info.type === 'react') {
                    const pkgInfo = await this.detectWebFramework();
                    if (pkgInfo) {
                        this._detectedProject = { ...detector.info, ...pkgInfo };
                    }
                }

                this.postMessage({
                    type: 'projectDetected',
                    project: this._detectedProject
                });

                this.postMessage({
                    type: 'suggestion',
                    style: this._detectedProject.suggestedStyle
                });

                return;
            }
        }

        // No specific project detected
        this._detectedProject = null;
        this.postMessage({ type: 'status', value: 'Ready to generate assets.' });
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
            if (deps['electron']) {
                return { name: 'Electron', message: 'Electron app detected. Suggesting app icons and UI assets.', icon: '⚡' };
            }
        } catch (e) {
            console.warn('Failed to parse package.json', e);
        }
        return null;
    }

    private async handleGenerate(userPrompt: string, style: string) {
        if (!this._view) return;

        const apiKey = getOcliteApiKey();

        if (!apiKey) {
            this.postMessage({
                type: 'error',
                value: 'OCLite API Key missing or service unavailable.'
            });
            return;
        }

        try {
            this.postMessage({
                type: 'status',
                value: `📊 Generating ${style} Diagram...`,
                step: 1,
                totalSteps: 2
            });

            const mermaidCode = await this._aiService.generateMermaid(userPrompt, style);

            this.postMessage({
                type: 'status',
                value: '✨ Diagram Code Ready!',
                step: 2,
                totalSteps: 2
            });

            this.postMessage({
                type: 'success_mermaid',
                code: mermaidCode,
                prompt: userPrompt
            });
        } catch (error: any) {
            const errorMsg = error.response?.data?.error || error.message || 'Unknown error occurred while generating diagram.';
            this.postMessage({ type: 'error', value: errorMsg });
        }
    }

    /**
     * Phase 4: Save to Project with Smart Naming
     */
    private async handleSave(imageUrl: string) {
        try {
            this.postMessage({ type: 'status', value: '💾 Mengunduh gambar...' });

            const response = await axios.get(imageUrl, {
                responseType: 'arraybuffer',
                timeout: 30000
            });
            const buffer = Buffer.from(response.data, 'binary');

            // Smart Naming using AI (Phase 4)
            this.postMessage({ type: 'status', value: '🏷️ Generating smart filename...' });
            const smartName = await this._aiService.generateName(this._lastPrompt || "asset", this._lastCategory);
            const fileName = smartName || `oclite_asset_${Date.now()}.png`;

            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                vscode.window.showErrorMessage('No workspace folder open. Please open a folder first.');
                this.postMessage({ type: 'status', value: 'Error: No workspace open' });
                return;
            }

            // Detect common asset folders
            const assetFolders = ['assets', 'images', 'public', 'src/assets', 'static'];
            let targetFolder = workspaceFolder.uri;

            for (const folder of assetFolders) {
                try {
                    const folderUri = vscode.Uri.joinPath(workspaceFolder.uri, folder);
                    await vscode.workspace.fs.stat(folderUri);
                    targetFolder = folderUri;
                    break;
                } catch {
                    // Folder doesn't exist, continue checking
                }
            }

            const defaultUri = vscode.Uri.joinPath(targetFolder, fileName);

            // Show save dialog with smart defaults
            const fileUri = await vscode.window.showSaveDialog({
                defaultUri: defaultUri,
                filters: { 'PNG Images': ['png'], 'All Files': ['*'] },
                saveLabel: 'Save Asset to Project'
            });

            if (fileUri) {
                await vscode.workspace.fs.writeFile(fileUri, new Uint8Array(buffer));

                const relativePath = vscode.workspace.asRelativePath(fileUri);
                vscode.window.showInformationMessage(`✅ Asset saved: ${relativePath}`);

                this.postMessage({
                    type: 'saved',
                    fileName: relativePath
                });
            } else {
                this.postMessage({ type: 'status', value: 'Save cancelled' });
            }
        } catch (error: any) {
            const errorMsg = error.message || 'Failed to save file';
            vscode.window.showErrorMessage(`Failed to save: ${errorMsg}`);
            this.postMessage({ type: 'error', value: errorMsg });
        }
    }

    public postMessage(message: any) {
        this._view?.webview.postMessage(message);
    }

    private _getHtmlForWebview(webview: vscode.Webview, extensionUri: vscode.Uri) {
        const toolkitUri = getUri(webview, this._extensionUri, [
            "dist",
            "toolkit.js",
        ]);

        const mainUri = getUri(webview, this._extensionUri, ["media", "main.js"]);
        const styleUri = getUri(webview, this._extensionUri, ["media", "main.css"]);
        const nonce = getNonce();

        // Enhanced CSP to allow images from common CDNs
        const csp = [
            `default-src 'none'`,
            `style-src ${webview.cspSource} 'unsafe-inline'`,
            `script-src 'nonce-${nonce}'`,
            `img-src ${webview.cspSource} https: http: data: blob:`,
            `font-src ${webview.cspSource}`,
            `connect-src https: http:`
        ].join('; ');

        return /*html*/ `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="${csp}">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="${styleUri}" rel="stylesheet">
        <script type="module" nonce="${nonce}" src="${toolkitUri}"></script>
        <script type="module" nonce="${nonce}" src="${mainUri}"></script>
      </head>
      <body>
        <div class="container">
          <!-- Project Detection Banner -->
          <div id="project-banner" class="project-banner hidden">
            <span id="project-icon"></span>
            <span id="project-message"></span>
          </div>

          <!-- Input Section -->
          <section class="input-section">
            <div class="input-group">
              <label for="prompt-input">Describe your diagram data / flow</label>
              <vscode-text-area 
                id="prompt-input" 
                placeholder="E.g., A user authentication flow, from login to dashboard..." 
                rows="3" 
                resize="vertical">
              </vscode-text-area>
            </div>
            
            <div class="input-group">
              <label for="style-dropdown">Diagram Style</label>
              <vscode-dropdown id="style-dropdown">
                <vscode-option value="Auto (Let AI Choose)">🤖 Auto (Let AI Choose)</vscode-option>
                <vscode-option value="Flowchart">📊 Flowchart</vscode-option>
                <vscode-option value="Sequence Diagram">🔁 Sequence Diagram</vscode-option>
                <vscode-option value="Class Diagram">📦 Class Diagram</vscode-option>
                <vscode-option value="State Diagram">🚦 State Diagram</vscode-option>
                <vscode-option value="Entity Relationship Diagram">🔗 Entity Relationship Diagram</vscode-option>
                <vscode-option value="User Journey">🚶 User Journey</vscode-option>
                <vscode-option value="Gantt Chart">📅 Gantt Chart</vscode-option>
                <vscode-option value="Pie Chart">🥧 Pie Chart</vscode-option>
              </vscode-dropdown>
            </div>

            <vscode-button id="generate-btn" appearance="primary">
              Generate Diagram
            </vscode-button>
          </section>

          <!-- Status Section -->
          <section class="status-section">
            <div class="status-bar">
              <vscode-progress-ring id="progress-ring" class="hidden"></vscode-progress-ring>
              <span id="status-text">Ready to generate diagram</span>
            </div>
            
            <!-- Step Progress Indicator -->
            <div id="step-indicator" class="step-indicator hidden">
              <div class="step" data-step="1">
                <div class="step-circle">1</div>
                <span>Analyze</span>
              </div>
              <div class="step-line"></div>
              <div class="step" data-step="2">
                <div class="step-circle">2</div>
                <span>Generate</span>
              </div>
            </div>
          </section>

          <!-- Mermaid Result Area -->
          <section id="mermaid-result-area" class="result-area hidden">
            <div class="code-container" style="background:#1e1e1e; padding:10px; border-radius:6px; margin-bottom:10px; max-height:200px; overflow-y:auto; font-family:monospace; font-size:12px;">
              <pre id="mermaid-result-code" style="margin:0; white-space:pre-wrap; word-wrap:break-word;"></pre>
            </div>
            <div class="actions">
              <vscode-button id="open-excalidraw-btn" appearance="primary">
                📋 Copy & Open in Excalidraw
              </vscode-button>
            </div>
          </section>

          <!-- Suggestion Area -->
          <div id="suggestion-area" class="suggestion-area hidden">
            <vscode-badge>💡 Suggestion</vscode-badge>
            <p id="suggestion-text"></p>
          </div>
        </div>
      </body>
      </html>
    `;
    }
}
