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
                    // This would be the place to hook into the main generation logic
                    // For now, we can just show an information message
                    vscode.window.showInformationMessage(`Generation started with prompt: ${message.prompt}`);
                    // In a real implementation, you would call a method in your extension's core logic
                    // e.g., this._aiService.generateImage(message.prompt, message.category);
                    break;
                case "get-workspace-suggestion":
                    const suggestion = await this._aiService.getWorkspaceSuggestion();
                    if (suggestion) {
                        this._view?.webview.postMessage({ command: 'workspace-suggestion', ...suggestion });
                    }
                    break;
                case "set-api-key":
                    vscode.commands.executeCommand('oclite.setApiKey');
                    break;
            }
        });
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

    /**
     * Phase 2 & 4: Handle Generation with Real-time Status Updates
     */
    private async handleGenerate(userPrompt: string, style: string) {
        if (!this._view) return;

        const config = vscode.workspace.getConfiguration('oclite');
        const apiKey = getOcliteApiKey();

        if (!apiKey) {
            this.postMessage({ 
                type: 'error', 
                value: 'OCLite service unavailable. Please try again later.' 
            });
            return;
        }

        try {
            // Step 1: Refine Prompt with AI Agent (Phase 1)
            this.postMessage({ 
                type: 'status', 
                value: '🧠 Agent sedang menyempurnakan prompt...',
                step: 1,
                totalSteps: 4
            });
            
            const refined = await this._aiService.refinePrompt(userPrompt, style);
            const refinedPrompt = refined.prompt;
            
            // Show refined prompt to user
            this.postMessage({ 
                type: 'refinedPrompt', 
                original: userPrompt,
                refined: refinedPrompt,
                fromLLM: refined.fromLLM
            });

            // Step 2: Send to SDXL Backend
            this.postMessage({ 
                type: 'status', 
                value: '🎨 Menghubungi SDXL...',
                step: 2,
                totalSteps: 4
            });

            const model = config.get<string>('model') || 'sdxl-lightning';

            const response = await axios.post(getOcliteApiUrl(), {
                model: model,
                prompt: refinedPrompt,
                disableSafety: false
            }, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });

            // Step 3: Polling for Result
            let imageUrl = '';
            if (response.data.status === 'succeeded' && response.data.output?.length > 0) {
                imageUrl = response.data.output[0];
            } else if (response.data.status === 'processing' || response.data.status === 'starting' || response.data.status === 'queued') {
                const predictionId = response.data.id;
                
                this.postMessage({ 
                    type: 'status', 
                    value: '⏳ SDXL sedang merender gambar...',
                    step: 3,
                    totalSteps: 4
                });

                // Poll with progress updates
                for (let i = 0; i < 60; i++) {
                    await new Promise(r => setTimeout(r, 1500));
                    
                    // Update progress
                    const progress = Math.min(95, Math.round((i / 60) * 100));
                    this.postMessage({ 
                        type: 'progress', 
                        value: progress,
                        message: `⏳ Rendering... ${progress}%`
                    });

                    const pollUrl = `${getOclitePollUrl()}${predictionId}`;
                    const pollResponse = await axios.get(pollUrl, { 
                        headers: { 'Authorization': `Bearer ${apiKey}` },
                        timeout: 10000
                    });

                    if (pollResponse.data.status === 'succeeded' && pollResponse.data.output?.length > 0) {
                        imageUrl = pollResponse.data.output[0];
                        break;
                    } else if (pollResponse.data.status === 'failed') {
                        throw new Error(pollResponse.data.error || 'Generation failed on server.');
                    }
                }
            }

            if (!imageUrl) {
                throw new Error('Generation timeout. Please try again.');
            }

            // Step 4: Preparing Asset
            this.postMessage({ 
                type: 'status', 
                value: '📦 Menyiapkan aset di project...',
                step: 4,
                totalSteps: 4
            });

            // Small delay for UX
            await new Promise(r => setTimeout(r, 500));

            // Success!
            this.postMessage({ 
                type: 'success', 
                imageUrl: imageUrl,
                prompt: refinedPrompt
            });

        } catch (error: any) {
            const errorMsg = error.response?.data?.error || error.message || 'Unknown error occurred';
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
            "node_modules",
            "@vscode",
            "webview-ui-toolkit",
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
        <script type="module" nonce="${nonce}" src="${mainUri}"></script>
        <script nonce="${nonce}">
            const vscode = acquireVsCodeApi();
            window.addEventListener('load', () => {
                vscode.postMessage({ command: 'get-workspace-suggestion' });
            });
        </script>
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
              <label for="prompt-input">Describe your asset</label>
              <vscode-text-area 
                id="prompt-input" 
                placeholder="E.g., A fierce dragon breathing fire, fantasy game style..." 
                rows="3" 
                resize="vertical">
              </vscode-text-area>
            </div>
            
            <div class="input-group">
              <label for="style-dropdown">Asset Category</label>
              <vscode-dropdown id="style-dropdown">
                <vscode-option value="None">🔮 Auto (AI Smart Selection)</vscode-option>
                <vscode-option value="Character">👤 Character Design</vscode-option>
                <vscode-option value="UI Icon">🎯 UI Icon / Button</vscode-option>
                <vscode-option value="Environment">🏔️ Environment / Background</vscode-option>
                <vscode-option value="Texture">🧱 Texture / Material</vscode-option>
                <vscode-option value="Pixel Art">👾 Pixel Art (Retro)</vscode-option>
                <vscode-option value="Vector">📐 Vector Illustration</vscode-option>
              </vscode-dropdown>
            </div>

            <vscode-button id="generate-btn" appearance="primary">
              Generate Asset
            </vscode-button>
          </section>

          <!-- Status Section -->
          <section class="status-section">
            <div class="status-bar">
              <vscode-progress-ring id="progress-ring" class="hidden"></vscode-progress-ring>
              <span id="status-text">Ready to generate</span>
            </div>
            
            <!-- Step Progress Indicator -->
            <div id="step-indicator" class="step-indicator hidden">
              <div class="step" data-step="1">
                <div class="step-circle">1</div>
                <span>Refine</span>
              </div>
              <div class="step-line"></div>
              <div class="step" data-step="2">
                <div class="step-circle">2</div>
                <span>Generate</span>
              </div>
              <div class="step-line"></div>
              <div class="step" data-step="3">
                <div class="step-circle">3</div>
                <span>Render</span>
              </div>
              <div class="step-line"></div>
              <div class="step" data-step="4">
                <div class="step-circle">4</div>
                <span>Ready</span>
              </div>
            </div>
          </section>

          <!-- Refined Prompt Preview -->
          <div id="refined-prompt-area" class="refined-prompt-area hidden">
            <label>✨ AI-Enhanced Prompt:</label>
            <p id="refined-prompt-text"></p>
          </div>

          <!-- Result Section -->
          <section id="result-area" class="result-area hidden">
            <div class="image-container">
              <img id="result-image" class="image-preview" src="" alt="Generated Asset" />
            </div>
            <div class="actions">
              <vscode-button id="save-btn" appearance="primary">
                💾 Save to Project
              </vscode-button>
              <vscode-button id="regenerate-btn" appearance="secondary">
                🔄 Regenerate
              </vscode-button>
            </div>
          </section>

          <!-- Suggestion Area -->
          <div id="suggestion-area" class="suggestion-area hidden">
            <vscode-badge>💡 Suggestion</vscode-badge>
            <p id="suggestion-text"></p>
          </div>
        </div>
        <script nonce="${nonce}">
            const vscode = acquireVsCodeApi();
            window.addEventListener('load', () => {
                vscode.postMessage({ command: 'get-workspace-suggestion' });
            });
        </script>
      </body>
      </html>
    `;
    }
}
