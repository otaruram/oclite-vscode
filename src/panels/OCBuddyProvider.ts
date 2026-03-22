import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class OCBuddyProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'oclite.ocbuddyView';
    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
    ) { }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this._extensionUri, 'ocbuddy')
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        // Paths to local resources in ocbuddy folder
        const htmlPath = vscode.Uri.joinPath(this._extensionUri, 'ocbuddy', 'index.html');
        
        // Read raw HTML
        let htmlContent = fs.readFileSync(htmlPath.fsPath, 'utf8');

        // Prepare webview URIs
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'ocbuddy', 'style.css'));
        const secretsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'ocbuddy', 'secrets.js'));
        const authUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'ocbuddy', 'auth.js'));
        const appUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'ocbuddy', 'app.js'));

        // Replace local links with webview URIs in the HTML
        htmlContent = htmlContent.replace('href="style.css"', `href="${styleUri}"`);
        htmlContent = htmlContent.replace('src="secrets.js"', `src="${secretsUri}"`);
        htmlContent = htmlContent.replace('src="auth.js"', `src="${authUri}"`);
        htmlContent = htmlContent.replace('src="app.js"', `src="${appUri}"`);

        // To make API requests work without CORS/CSP blocking in VS Code:
        // Adjust the CSP to allow Microsoft login, external APIs, and local resources.
        const cspStr = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data: blob:; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-eval' 'unsafe-inline' https://alcdn.msauth.net; connect-src https:;">`;
        
        // Insert CSP into head
        htmlContent = htmlContent.replace('<title>', cspStr + '\\n    <title>');

        return htmlContent;
    }
}
