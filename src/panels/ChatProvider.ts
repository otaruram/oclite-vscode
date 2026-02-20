import * as vscode from "vscode";
import { getNonce } from "../utilities/getNonce";
import { callLLM } from "../services/llm";

/**
 * ChatProvider — Sidebar WebviewViewProvider for chatting with OCLite AI.
 *
 * Calls the Azure Function gateway that securely retrieves the LLM API key
 * from Azure Key Vault, then proxies the request to GPT-4o mini.
 */

export class ChatProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = "oclite.chatView";

    private _view?: vscode.WebviewView;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    /* ------------------------------------------------------------------ */
    /*  Lifecycle                                                          */
    /* ------------------------------------------------------------------ */

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        };

        webviewView.webview.html = this._getHtml(webviewView.webview);

        // Listen for messages from the webview
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case "askAI": {
                    const answer = await this._callAzureAI(data.value);
                    webviewView.webview.postMessage({
                        type: "addResponse",
                        value: answer,
                    });
                    break;
                }
                case "insertCode": {
                    // Insert code snippet into the active editor
                    const editor = vscode.window.activeTextEditor;
                    if (editor) {
                        editor.edit((edit) => {
                            edit.insert(editor.selection.active, data.value);
                        });
                    } else {
                        vscode.window.showWarningMessage(
                            "Open a file first to insert code."
                        );
                    }
                    break;
                }
            }
        });
    }

    /* ------------------------------------------------------------------ */
    /*  Agent Pipeline: Receive prompts from AgentOrchestrator             */
    /* ------------------------------------------------------------------ */

    /**
     * Called by the AgentOrchestrator to display generated prompts
     * and (future) images in the chat webview.
     */
    public async processAgentRequest(brief: string, prompts: string[]): Promise<void> {
        if (!this._view) {
            vscode.window.showWarningMessage(
                'OCLite Chat panel is not open. Please open it first.',
            );
            return;
        }

        // Send the brief as a system message
        this._view.webview.postMessage({
            type: 'addResponse',
            value: `🤖 **Agent Analysis:**\n${brief}`,
        });

        // Send each prompt
        for (const prompt of prompts) {
            this._view.webview.postMessage({
                type: 'addResponse',
                value: `🎨 **Prompt:** ${prompt}`,
            });
        }

        // Make sure the panel is visible
        this._view.show?.(true);
    }

    /* ------------------------------------------------------------------ */
    /*  Azure Function call (uses shared LLM gateway)                      */
    /* ------------------------------------------------------------------ */

    private async _callAzureAI(prompt: string): Promise<string> {
        try {
            const systemPrompt = "You are OCLite AI, a helpful creative assistant for game developers. Respond concisely and helpfully.";
            const result = await callLLM(prompt, systemPrompt, 60_000);
            return result ?? "⚠️ No response from AI. Please try again.";
        } catch (err: any) {
            console.error("OCLite ChatProvider error:", err);
            return `⚠️ Error: ${err.message}`;
        }
    }

    /* ------------------------------------------------------------------ */
    /*  Webview HTML                                                       */
    /* ------------------------------------------------------------------ */

    private _getHtml(webview: vscode.Webview): string {
        const nonce = getNonce();

        return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta
        http-equiv="Content-Security-Policy"
        content="default-src 'none';
               style-src ${webview.cspSource} 'unsafe-inline';
               script-src 'nonce-${nonce}';"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>OCLite Chat</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            padding: 0;
            display: flex;
            flex-direction: column;
            height: 100vh;
        }

        /* ---- Header ---- */
        .header {
            padding: 10px 12px;
            font-weight: 600;
            font-size: 13px;
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            align-items: center;
            gap: 6px;
        }

        /* ---- Chat area ---- */
        #chat {
            flex: 1;
            overflow-y: auto;
            padding: 10px 12px;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .msg {
            padding: 8px 10px;
            border-radius: 6px;
            line-height: 1.45;
            word-wrap: break-word;
            white-space: pre-wrap;
            max-width: 95%;
        }

        .user {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            align-self: flex-end;
            border-bottom-right-radius: 2px;
        }

        .ai {
            background: var(--vscode-editor-inactiveSelectionBackground, var(--vscode-editor-background));
            border: 1px solid var(--vscode-panel-border);
            align-self: flex-start;
            border-bottom-left-radius: 2px;
        }

        .ai .label { font-weight: 600; margin-bottom: 4px; }

        /* ---- Code blocks in AI response ---- */
        .code-block {
            position: relative;
            background: var(--vscode-textCodeBlock-background, #1e1e1e);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            margin: 6px 0;
            padding: 8px 10px;
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
            overflow-x: auto;
            white-space: pre;
        }

        .insert-btn {
            position: absolute;
            top: 4px;
            right: 4px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 3px;
            padding: 2px 8px;
            font-size: 11px;
            cursor: pointer;
            opacity: 0;
            transition: opacity 0.15s;
        }
        .code-block:hover .insert-btn { opacity: 1; }

        /* ---- Typing indicator ---- */
        .typing {
            display: flex;
            gap: 4px;
            padding: 8px 10px;
            align-self: flex-start;
        }
        .typing span {
            width: 6px; height: 6px;
            background: var(--vscode-foreground);
            border-radius: 50%;
            opacity: 0.4;
            animation: blink 1.2s infinite;
        }
        .typing span:nth-child(2) { animation-delay: 0.2s; }
        .typing span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes blink {
            0%, 80%, 100% { opacity: 0.4; }
            40% { opacity: 1; }
        }

        /* ---- Input area ---- */
        .input-area {
            padding: 8px 12px 12px;
            border-top: 1px solid var(--vscode-panel-border);
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        textarea {
            width: 100%;
            resize: none;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
            border-radius: 4px;
            padding: 8px;
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            outline: none;
        }
        textarea:focus {
            border-color: var(--vscode-focusBorder);
        }

        .send-btn {
            width: 100%;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            padding: 8px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
        }
        .send-btn:hover {
            background: var(--vscode-button-hoverBackground);
        }
        .send-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        /* ---- Welcome ---- */
        .welcome {
            text-align: center;
            padding: 24px 16px;
            opacity: 0.7;
        }
        .welcome .icon { font-size: 32px; margin-bottom: 8px; }
        .welcome p { margin-top: 6px; font-size: 12px; }
    </style>
</head>
<body>
    <div class="header">🤖 OCLite Chat</div>

    <div id="chat">
        <div class="welcome">
            <div class="icon">💬</div>
            <strong>Chat with OCLite AI</strong>
            <p>Ask anything — code help, prompt ideas, or just say hi!</p>
        </div>
    </div>

    <div class="input-area">
        <textarea id="prompt" rows="3" placeholder="Ask OCLite something…"></textarea>
        <button class="send-btn" id="sendBtn">Send</button>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const chatDiv = document.getElementById('chat');
        const promptEl = document.getElementById('prompt');
        const sendBtn = document.getElementById('sendBtn');

        let firstMessage = true;

        /* ---------- helpers ---------- */

        function scrollToBottom() {
            chatDiv.scrollTop = chatDiv.scrollHeight;
        }

        /** Escape HTML to prevent XSS */
        function esc(str) {
            const d = document.createElement('div');
            d.textContent = str;
            return d.innerHTML;
        }

        /** Render AI text — detect code fences and add Insert buttons */
        function renderAIContent(text) {
            // Split on triple-backtick code blocks
            const parts = text.split(/(\\x60\\x60\\x60[\\s\\S]*?\\x60\\x60\\x60)/g);
            let html = '';
            for (const part of parts) {
                if (part.startsWith('\\x60\\x60\\x60') && part.endsWith('\\x60\\x60\\x60')) {
                    const code = part.slice(3, -3).replace(/^\\w*\\n?/, ''); // strip lang tag
                    html += '<div class="code-block"><button class="insert-btn" data-code="'
                        + esc(code).replace(/"/g, '&quot;')
                        + '">Insert</button>' + esc(code) + '</div>';
                } else {
                    html += esc(part);
                }
            }
            return html;
        }

        /* ---------- send message ---------- */

        function sendMessage() {
            const text = promptEl.value.trim();
            if (!text) return;

            // Clear welcome on first message
            if (firstMessage) {
                chatDiv.innerHTML = '';
                firstMessage = false;
            }

            // User bubble
            const userDiv = document.createElement('div');
            userDiv.className = 'msg user';
            userDiv.textContent = text;
            chatDiv.appendChild(userDiv);

            // Typing indicator
            const typing = document.createElement('div');
            typing.className = 'typing';
            typing.id = 'typing';
            typing.innerHTML = '<span></span><span></span><span></span>';
            chatDiv.appendChild(typing);

            scrollToBottom();

            // Disable input while waiting
            promptEl.value = '';
            promptEl.disabled = true;
            sendBtn.disabled = true;

            vscode.postMessage({ type: 'askAI', value: text });
        }

        sendBtn.addEventListener('click', sendMessage);

        promptEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        /* ---------- receive response ---------- */

        window.addEventListener('message', (event) => {
            const msg = event.data;
            if (msg.type === 'addResponse') {
                // Remove typing indicator
                const typing = document.getElementById('typing');
                if (typing) typing.remove();

                // AI bubble
                const aiDiv = document.createElement('div');
                aiDiv.className = 'msg ai';
                aiDiv.innerHTML = '<div class="label">OCLite</div>' + renderAIContent(msg.value || '(no response)');
                chatDiv.appendChild(aiDiv);

                scrollToBottom();

                // Re-enable input
                promptEl.disabled = false;
                sendBtn.disabled = false;
                promptEl.focus();
            }
        });

        /* ---------- Insert code button delegation ---------- */

        chatDiv.addEventListener('click', (e) => {
            if (e.target && e.target.classList.contains('insert-btn')) {
                const code = e.target.getAttribute('data-code');
                if (code) {
                    vscode.postMessage({ type: 'insertCode', value: code });
                }
            }
        });
    </script>
</body>
</html>`;
    }
}
