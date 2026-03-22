import * as vscode from "vscode";
import { getUri } from "../utilities/getUri";
import { getNonce } from "../utilities/getNonce";
import { AIService } from "../services/ai";
import axios from "axios";
import { getOcliteApiKey, getOcliteApiUrl, getOclitePollUrl } from '../utilities/secrets';

import { WorkspaceScanner, ProjectInfo } from '../services/workspaceScanner';

export class SidebarProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = "oclite.sidebarView";

    private _view?: vscode.WebviewView;
    private _aiService: AIService;
    private _scanner: WorkspaceScanner;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        aiService: AIService
    ) {
        this._aiService = aiService;
        this._scanner = new WorkspaceScanner();
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
                    // Scan README.md for keywords and project name
                    const keywords = await this._scanner.extractReadmeKeywords();
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
        const mainUri = getUri(webview, this._extensionUri, ["media", "main.js"]);
        const styleUri = getUri(webview, this._extensionUri, ["media", "main.css"]);
        const nonce = getNonce();

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
      </head>
      <body>
        <!-- Branding Header -->
        <div class="oc-header">
          <span class="oc-header-icon">✨</span>
          <div class="oc-header-text">
            <h3>Diagram Wizard</h3>
            <span>AI-powered diagram generation</span>
          </div>
        </div>

        <!-- Project Detection Banner -->
        <div id="project-banner" class="project-banner hidden">
          <span id="project-icon"></span>
          <span id="project-message"></span>
        </div>

        <!-- Input Section -->
        <section class="input-section">
          <div class="input-group">
            <label for="prompt-input">Describe your diagram</label>
            <textarea
              id="prompt-input"
              placeholder="E.g., A user authentication flow, from login to dashboard..."
              rows="3"></textarea>
          </div>

          <div class="input-group">
            <label for="style-dropdown">Diagram Style</label>
            <select id="style-dropdown">
              <option value="Auto (Let AI Choose)">🤖 Auto (Let AI Choose)</option>
              <option value="Flowchart">📊 Flowchart</option>
              <option value="Sequence Diagram">🔁 Sequence Diagram</option>
              <option value="Class Diagram">📦 Class Diagram</option>
              <option value="State Diagram">🚦 State Diagram</option>
              <option value="Entity Relationship Diagram">🔗 Entity Relationship</option>
              <option value="User Journey">🚶 User Journey</option>
              <option value="Gantt Chart">📅 Gantt Chart</option>
              <option value="Pie Chart">🥧 Pie Chart</option>
            </select>
          </div>

          <button id="generate-btn" class="btn-primary">
            <span class="spinner"></span>
            <span class="btn-text">⚡ Generate Diagram</span>
          </button>
        </section>

        <!-- Status Section -->
        <section class="status-section">
          <div class="status-bar">
            <span class="status-dot"></span>
            <span id="status-text">Ready to generate diagram</span>
          </div>

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
          <div class="code-container">
            <pre id="mermaid-result-code"></pre>
          </div>
          <div class="result-actions">
            <button id="open-excalidraw-btn" class="btn-secondary">
              📋 Copy & Open in Excalidraw
            </button>
          </div>
        </section>

        <!-- Suggestion Area -->
        <div id="suggestion-area" class="suggestion-area hidden">
          <span class="badge">💡 Suggestion</span>
          <p id="suggestion-text"></p>
        </div>

        <script nonce="${nonce}" src="${mainUri}"></script>
      </body>
      </html>
    `;
    }
}
