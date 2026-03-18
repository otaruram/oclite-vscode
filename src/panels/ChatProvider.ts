import * as vscode from "vscode";
import { getNonce } from "../utilities/getNonce";
import { callLLM } from "../services/llm";
import { sendTelemetryEvent } from "../services/telemetry";

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
                    sendTelemetryEvent('chat.message.sent', {
                        messageLength: data.value.length.toString()
                    });
                    const answer = await this._callAzureAI(data.value, data.attachedImage, data.attachedText, data.attachedFileName, data.attachedBinary);
                    webviewView.webview.postMessage({
                        type: "addResponse",
                        value: answer,
                    });
                    break;
                }
                case "insertCode": {
                    sendTelemetryEvent('chat.code.inserted');
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
                case "generateImage": {
                    sendTelemetryEvent('chat.image.generation.triggered');
                    // Trigger image generation via chat participant
                    await vscode.commands.executeCommand('workbench.action.chat.open', {
                        query: `@oclite ${data.value}`
                    });
                    break;
                }
                case "explainCode": {
                    sendTelemetryEvent('chat.code.explain.triggered');
                    const explanation = await this._explainCode(data.value);
                    webviewView.webview.postMessage({
                        type: "addResponse",
                        value: explanation,
                    });
                    break;
                }
                case "improveCode": {
                    sendTelemetryEvent('chat.code.improve.triggered');
                    const improved = await this._improveCode(data.value);
                    webviewView.webview.postMessage({
                        type: "addResponse",
                        value: improved,
                    });
                    break;
                }
                case "generateTests": {
                    sendTelemetryEvent('chat.tests.generation.triggered');
                    const tests = await this._generateTests(data.value);
                    webviewView.webview.postMessage({
                        type: "addResponse",
                        value: tests,
                    });
                    break;
                }
                case "brainstormIdeas": {
                    sendTelemetryEvent('chat.brainstorm.triggered');
                    const ideas = await this._brainstormIdeas(data.value);
                    webviewView.webview.postMessage({
                        type: "addResponse",
                        value: ideas,
                    });
                    break;
                }
                case "switchToParticipant": {
                    sendTelemetryEvent('chat.switch.to.participant');
                    // Open GitHub Copilot Chat with @oclite
                    await vscode.commands.executeCommand('workbench.action.chat.open', {
                        query: '@oclite '
                    });
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
        sendTelemetryEvent('agent.results.displayed', {
            briefLength: brief.length.toString(),
            promptCount: prompts.length.toString()
        });

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
            this._view?.webview.postMessage({
                type: 'addResponse',
                value: `🎨 **Prompt:** ${prompt}`,
            });
        }

        // Make sure the panel is visible
        this._view.show?.(true);
    }

    /* ------------------------------------------------------------------ */
    /*  Creative Helper Methods                                            */
    /* ------------------------------------------------------------------ */

    private async _explainCode(code: string): Promise<string> {
        try {
            const systemPrompt = "You are an expert code explainer. Analyze the code and provide: 1) What it does 2) How it works 3) Key concepts 4) Potential improvements. Be clear and educational.";
            const result = await callLLM(`Explain this code:\n\`\`\`\n${code}\n\`\`\``, systemPrompt, 60_000, undefined, 'ocliteGenerator');
            return result || "⚠️ Failed to explain code.";
        } catch (err: any) {
            return `⚠️ Error: ${err.message}`;
        }
    }

    private async _improveCode(code: string): Promise<string> {
        try {
            const systemPrompt = "You are a senior software engineer. Review this code and suggest improvements for: 1) Performance 2) Readability 3) Best practices 4) Security. Provide the improved code with explanations.";
            const result = await callLLM(`Improve this code:\n\`\`\`\n${code}\n\`\`\``, systemPrompt, 60_000, undefined, 'ocliteGenerator');
            return result || "⚠️ Failed to improve code.";
        } catch (err: any) {
            return `⚠️ Error: ${err.message}`;
        }
    }

    private async _generateTests(code: string): Promise<string> {
        try {
            const systemPrompt = "You are a testing expert. Generate comprehensive unit tests for this code. Include: 1) Happy path tests 2) Edge cases 3) Error handling 4) Mock data. Use appropriate testing framework.";
            const result = await callLLM(`Generate tests for:\n\`\`\`\n${code}\n\`\`\``, systemPrompt, 60_000, undefined, 'ocliteGenerator');
            return result || "⚠️ Failed to generate tests.";
        } catch (err: any) {
            return `⚠️ Error: ${err.message}`;
        }
    }

    private async _brainstormIdeas(topic: string): Promise<string> {
        try {
            const systemPrompt = "You are a creative brainstorming assistant. Generate 10 innovative ideas related to the topic. Be creative, practical, and diverse in your suggestions. Format as a numbered list with brief descriptions.";
            const result = await callLLM(`Brainstorm ideas for: ${topic}`, systemPrompt, 60_000, undefined, 'ocliteGenerator');
            return result || "⚠️ Failed to brainstorm ideas.";
        } catch (err: any) {
            return `⚠️ Error: ${err.message}`;
        }
    }

    /* ------------------------------------------------------------------ */
    /*  Azure Function call (uses shared LLM gateway)                      */
    /* ------------------------------------------------------------------ */

    private async _callAzureAI(prompt: string, attachedImage?: string, attachedText?: string, attachedFileName?: string, attachedBinary?: string): Promise<string> {
        const startTime = Date.now();
        try {
            let finalPrompt = prompt;
            let imageUrl = attachedImage;

            // Extract context from active editor/tab if no manual attachment
            if (!attachedImage && !attachedText && !attachedBinary) {
                const activeTab = vscode.window.tabGroups.activeTabGroup?.activeTab;
                const editor = vscode.window.activeTextEditor;

                if (editor && editor.document.uri.scheme !== 'output') {
                    const fileName = editor.document.fileName.split(/[/\\]/).pop() || 'file';
                    const content = editor.document.getText();
                    if (content.trim().length > 0 && content.length < 50000) {
                        finalPrompt = `[Context from active file: ${fileName}]\n\`\`\`\n${content}\n\`\`\`\n\nUser Question: ${prompt}`;
                    }
                } else if (activeTab) {
                    const input = activeTab.input as any;
                    if (input && input.uri) {
                        const uri = input.uri as vscode.Uri;
                        const ext = uri.fsPath.split('.').pop()?.toLowerCase();
                        if (ext && ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
                            try {
                                const bytes = await vscode.workspace.fs.readFile(uri);
                                const base64 = Buffer.from(bytes).toString('base64');
                                const mimeType = ext === 'jpg' ? 'jpeg' : ext;
                                imageUrl = `data:image/${mimeType};base64,${base64}`;
                                finalPrompt = `[Context is attached as an image]\n\nUser Question: ${prompt}`;
                            } catch (e) {
                                console.warn('Failed to read image tab', e);
                            }
                        }
                    }
                }
            } else {
                // Manually attached file from the chat UI
                if (attachedFileName) {
                    const lowerName = attachedFileName.toLowerCase();
                    if (lowerName.endsWith('.pdf') && attachedBinary) {
                        // PDF comes in as base64 in attachedBinary
                        try {
                            // pdf-parse@1.x — pure Node.js, no DOM required
                            const pdfParse = require('pdf-parse');
                            const base64Data = attachedBinary.includes(',') ? attachedBinary.split(',')[1] : attachedBinary;
                            const buffer = Buffer.from(base64Data, 'base64');
                            const pdfData = await pdfParse(buffer);
                            const pdfText = pdfData?.text ?? '';
                            finalPrompt = `[Attached PDF Document: ${attachedFileName}]\n\`\`\`\n${pdfText.substring(0, 30000)}\n\`\`\`\n\nUser Question: ${prompt}`;
                        } catch (e) {
                            console.error('PDF Parse Error:', e);
                            finalPrompt = `[Failed to read PDF: ${attachedFileName}. Error: ${(e as any)?.message}]\n\nUser Question: ${prompt}`;
                        }
                    } else if ((lowerName.endsWith('.doc') || lowerName.endsWith('.docx')) && attachedBinary) {
                        try {
                            if (lowerName.endsWith('.doc') && !lowerName.endsWith('.docx')) {
                                finalPrompt = `[System: The user tried to attach a legacy .doc file named ${attachedFileName}, but only .docx is supported for text extraction. It cannot be read.]\n\nUser Question: ${prompt}`;
                            } else {
                                const mammoth = require("mammoth");
                                const base64Data = attachedBinary.split(',')[1];
                                const buffer = Buffer.from(base64Data, 'base64');
                                const result = await mammoth.extractRawText({ buffer });
                                finalPrompt = `[Attached Word Document: ${attachedFileName}]\n\`\`\`\n${result.value.substring(0, 30000)}\n\`\`\`\n\nUser Question: ${prompt}`;
                            }
                        } catch (e) {
                            console.error('DOCX Parse Error:', e);
                            finalPrompt = `[Failed to read Document: ${attachedFileName}]\n\nUser Question: ${prompt}`;
                        }
                    } else if (attachedText) {
                        finalPrompt = `[Attached Context: ${attachedFileName}]\n\`\`\`\n${attachedText.substring(0, 30000)}\n\`\`\`\n\nUser Question: ${prompt}`;
                    } else if (attachedImage) {
                        // Pass image as base64 directly so AI can analyse it
                        imageUrl = attachedImage;
                        finalPrompt = `[User attached an image: ${attachedFileName}]\n\nUser Question: ${prompt}`;
                    }
                }
            }

            const systemPrompt = "You are OCLite AI, a helpful software engineer and creative assistant. When context (code or image) is provided, use it to accurately answer the user's question.";
            const result = await callLLM(finalPrompt, systemPrompt, 60_000, imageUrl, 'chatProvider');
            
            const duration = Date.now() - startTime;
            if (result) {
                sendTelemetryEvent('chat.llm.success', {
                    promptLength: prompt.length.toString(),
                    responseLength: result.length.toString()
                }, {
                    duration: duration
                });
                return result;
            } else {
                sendTelemetryEvent('chat.llm.no_response', undefined, { duration: duration });
                return "⚠️ No response from AI. Please try again.";
            }
        } catch (err: any) {
            const duration = Date.now() - startTime;
            sendTelemetryEvent('chat.llm.error', {
                errorMessage: err.message || 'unknown'
            }, {
                duration: duration
            });
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
               img-src ${webview.cspSource} data: https:;
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
        
        /* ---- Quick Action Buttons ---- */
        .quick-btn {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: 1px solid var(--vscode-button-border, transparent);
            border-radius: 4px;
            padding: 6px 12px;
            font-size: 11px;
            cursor: pointer;
            transition: all 0.2s;
        }
        .quick-btn:hover {
            background: var(--vscode-button-secondaryHoverBackground);
            transform: translateY(-1px);
        }
    </style>
</head>
<body>
    <div class="header">
        🤖 OCLite Chat
        <button id="switchToParticipant" style="margin-left: auto; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; border-radius: 4px; padding: 4px 8px; font-size: 11px; cursor: pointer;">
            🎨 Generate Images
        </button>
    </div>

    <div id="chat">
        <div class="welcome">
            <div class="icon">💬</div>
            <strong>Chat with OCLite AI</strong>
            <p>Ask anything — code help, prompt ideas, or just say hi!</p>
            <div style="margin-top: 16px; display: flex; flex-wrap: wrap; gap: 6px; justify-content: center;">
                <button class="quick-btn" data-action="explain">💡 Explain Code</button>
                <button class="quick-btn" data-action="improve">⚡ Improve Code</button>
                <button class="quick-btn" data-action="tests">🧪 Generate Tests</button>
                <button class="quick-btn" data-action="image">🎨 Generate Image</button>
                <button class="quick-btn" data-action="brainstorm">🚀 Brainstorm Ideas</button>
            </div>
        </div>
    </div>

    <div class="input-area">
        <textarea id="prompt" rows="3" placeholder="Ask OCLite something…"></textarea>
        <!-- File input -->
        <input type="file" id="fileInput" style="display: none" accept="image/*,.txt,.md,.js,.ts,.json,.html,.css,.py,.pdf,.doc,.docx" />
        <div id="attachedFile" style="font-size: 11px; padding: 4px; display: none; margin-bottom: 4px; color: var(--vscode-descriptionForeground); background: var(--vscode-editor-inactiveSelectionBackground); border-radius: 4px;"></div>
        <div style="display: flex; gap: 8px;">
            <button class="send-btn" id="uploadBtn" style="flex: 1; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); padding: 4px;">📎 Attach File</button>
            <button class="send-btn" id="sendBtn" style="flex: 2;">Send</button>
        </div>
    </div>

    <script nonce="${nonce}">
        const vscode = (function() {
            if (typeof acquireVsCodeApi === 'function') {
                return acquireVsCodeApi();
            }
            return null;
        })();
        const chatDiv = document.getElementById('chat');
        const promptEl = document.getElementById('prompt');
        const sendBtn = document.getElementById('sendBtn');
        const uploadBtn = document.getElementById('uploadBtn');
        const fileInput = document.getElementById('fileInput');
        const attachedFileDiv = document.getElementById('attachedFile');
        const switchBtn = document.getElementById('switchToParticipant');

        let firstMessage = true;
        let attachedImageBase64 = null;
        let attachedTextData = null;
        let attachedBinaryBase64 = null;
        let attachedFileName = null;
        
        // Switch to @oclite chat participant for image generation
        if (switchBtn) {
            switchBtn.addEventListener('click', () => {
                vscode.postMessage({ type: 'switchToParticipant' });
            });
        }

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
            if (!text && !attachedImageBase64 && !attachedTextData && !attachedBinaryBase64) return;

            // Clear welcome on first message
            if (firstMessage) {
                chatDiv.innerHTML = '';
                firstMessage = false;
            }

            // User bubble
            const userDiv = document.createElement('div');
            userDiv.className = 'msg user';
            
            let displayHtml = esc(text);
            if (attachedFileName) {
               displayHtml = '<div style="font-size: 10px; opacity: 0.8; margin-bottom: 4px;">📎 Attached: ' + esc(attachedFileName) + '</div>' + displayHtml;
            }
            if (attachedImageBase64) {
               displayHtml = '<img src="' + attachedImageBase64 + '" style="max-width: 100%; max-height: 150px; border-radius: 4px; margin-bottom: 4px;" /><br>' + displayHtml;
            }
            userDiv.innerHTML = displayHtml;
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

            // Send to extension
            vscode.postMessage({ 
                type: 'askAI', 
                value: text,
                attachedImage: attachedImageBase64,
                attachedText: attachedTextData,
                attachedBinary: attachedBinaryBase64,
                attachedFileName: attachedFileName
            });

            // Clear attachments
            clearAttachment();
        }

        /* ---------- file attachment ---------- */

        uploadBtn.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            attachedFileName = file.name;
            const isImage = file.type.startsWith('image/');
            const isBinaryDoc = file.name.toLowerCase().endsWith('.pdf') || file.name.toLowerCase().endsWith('.doc') || file.name.toLowerCase().endsWith('.docx');

            const reader = new FileReader();
            reader.onload = (ev) => {
                if (isImage) {
                    attachedImageBase64 = ev.target.result;
                    attachedBinaryBase64 = null;
                    attachedTextData = null;
                } else if (isBinaryDoc) {
                    attachedBinaryBase64 = ev.target.result;
                    attachedImageBase64 = null;
                    attachedTextData = null;
                } else {
                    attachedTextData = ev.target.result;
                    attachedImageBase64 = null;
                    attachedBinaryBase64 = null;
                }
                
                attachedFileDiv.style.display = 'block';
                attachedFileDiv.innerHTML = '📎 ' + esc(file.name) + ' <span style="cursor:pointer; float:right;" onclick="clearAttachment()">❌</span>';
            };

            if (isImage || isBinaryDoc) {
                reader.readAsDataURL(file);
            } else {
                reader.readAsText(file);
            }
        });

        // make it global so the inline onclick can call it
        window.clearAttachment = function() {
            attachedImageBase64 = null;
            attachedBinaryBase64 = null;
            attachedTextData = null;
            attachedFileName = null;
            fileInput.value = '';
            attachedFileDiv.style.display = 'none';
        };

        sendBtn.addEventListener('click', sendMessage);

        promptEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        // Add paste support for images
        promptEl.addEventListener('paste', (e) => {
            const items = (e.clipboardData || e.originalEvent.clipboardData).items;
            for (let index in items) {
                const item = items[index];
                if (item.kind === 'file' && item.type.startsWith('image/')) {
                    const blob = item.getAsFile();
                    const reader = new FileReader();
                    reader.onload = function(ev) {
                        attachedImageBase64 = ev.target.result;
                        attachedBinaryBase64 = null;
                        attachedTextData = null;
                        attachedFileName = "Pasted Image.png";
                        attachedFileDiv.style.display = 'block';
                        attachedFileDiv.innerHTML = '📎 Pasted Image <span style="cursor:pointer; float:right;" onclick="clearAttachment()">❌</span>';
                    };
                    reader.readAsDataURL(blob);
                }
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
            
            // Quick action buttons
            if (e.target && e.target.classList.contains('quick-btn')) {
                const action = e.target.getAttribute('data-action');
                handleQuickAction(action);
            }
        });
        
        /* ---------- Quick Actions ---------- */
        
        function handleQuickAction(action) {
            switch(action) {
                case 'explain':
                    promptEl.value = 'Explain the code in my active editor';
                    promptEl.focus();
                    break;
                case 'improve':
                    promptEl.value = 'Review and improve the code in my active editor';
                    promptEl.focus();
                    break;
                case 'tests':
                    promptEl.value = 'Generate unit tests for the code in my active editor';
                    promptEl.focus();
                    break;
                case 'image':
                    promptEl.value = 'Generate an image of ';
                    promptEl.focus();
                    break;
                case 'brainstorm':
                    promptEl.value = 'Brainstorm 10 creative ideas for ';
                    promptEl.focus();
                    break;
            }
        }
    </script>
</body>
</html>`;
    }
}
