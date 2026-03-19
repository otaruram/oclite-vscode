/**
 * chatWebviewHtml.ts — HTML template builder for the OCLite Chat webview
 */
import * as vscode from 'vscode';
import { getChatStyles } from './chatStyles';
import { getChatScript } from './chatScript';

export function buildChatHtml(webview: vscode.Webview, nonce: string): string {
    const styles = getChatStyles();
    const script = getChatScript();
    const btnStyle = 'background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:1px solid var(--vscode-button-border,transparent);border-radius:4px;padding:6px 10px;font-size:12px;cursor:pointer;min-height:30px;touch-action:manipulation;flex:1';

    return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy"
        content="default-src 'none';
                 style-src ${webview.cspSource} 'unsafe-inline';
                 img-src ${webview.cspSource} data: https:;
                 script-src 'nonce-${nonce}';" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>OCLite Chat</title>
    <style>${styles}</style>
</head>
<body>
    <div class="header">
        <div class="header-title">🤖 OCLite Chat</div>
        <div class="header-controls">
            <button id="historyBtn"          title="Chat History"    style="${btnStyle}">📚 History</button>
            <button id="newSessionBtn"       title="New Session"     style="${btnStyle}">➕ New</button>
            <button id="switchToParticipant" title="Generate Images" style="${btnStyle}">🎨 Images</button>
        </div>
    </div>

    <div id="chat">
        <div class="welcome">
            <div class="icon">💬</div>
            <strong>Chat with OCLite AI</strong>
            <p>Ask anything — code help, prompt ideas, or just say hi!</p>
            <div style="margin-top:16px;display:flex;flex-wrap:wrap;gap:8px;justify-content:center">
                <button class="quick-btn enhanced-btn" data-action="explain">
                    <span class="btn-icon">🧠</span>
                    <span class="btn-text">Explain Code</span>
                    <span class="btn-desc">Understand how it works</span>
                </button>
                <button class="quick-btn enhanced-btn" data-action="improve">
                    <span class="btn-icon">⚡</span>
                    <span class="btn-text">Improve Code</span>
                    <span class="btn-desc">Optimize &amp; enhance</span>
                </button>
                <button class="quick-btn enhanced-btn" data-action="brainstorm">
                    <span class="btn-icon">🚀</span>
                    <span class="btn-text">Brainstorm Ideas</span>
                    <span class="btn-desc">Creative solutions</span>
                </button>
            </div>
        </div>
    </div>

    <div id="historyPanel" class="history-panel">
        <div class="history-header">
            <span>📚 Chat History</span>
            <button id="closeHistoryBtn" style="background:none;border:none;color:var(--vscode-foreground);cursor:pointer;font-size:16px">✕</button>
        </div>
        <div class="history-content" id="historyContent">
            <div style="text-align:center;padding:20px;opacity:0.7">
                <div style="font-size:24px;margin-bottom:8px">📚</div>
                <div>Loading chat history...</div>
            </div>
        </div>
        <div class="history-stats" id="historyStats"></div>
        <div class="history-actions">
            <button class="history-action-btn" id="exportHistoryBtn">📁 Export</button>
            <button class="history-action-btn danger" id="clearHistoryBtn">🗑️ Clear All</button>
        </div>
    </div>

    <div class="input-area">
        <textarea id="prompt" rows="3" placeholder="Ask OCLite something…"></textarea>
        <input type="file" id="fileInput" style="display:none" accept="image/*,.txt,.md,.js,.ts,.json,.html,.css,.py,.pdf,.doc,.docx" />
        <div id="attachedFile" style="font-size:11px;padding:4px;display:none;margin-bottom:4px;color:var(--vscode-descriptionForeground);background:var(--vscode-editor-inactiveSelectionBackground);border-radius:4px"></div>
        <div style="display:flex;gap:8px">
            <button class="send-btn" id="uploadBtn" style="flex:1;background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);padding:4px">📎 Attach File</button>
            <button class="send-btn" id="sendBtn" style="flex:2">Send</button>
        </div>
    </div>

    <script nonce="${nonce}">${script}</script>
</body>
</html>`;
}
