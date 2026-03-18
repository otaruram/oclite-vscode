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
                    
                    // Show enhanced loading message
                    webviewView.webview.postMessage({
                        type: "addResponse",
                        value: "🧠 **Analyzing your code...**\n\n🔍 Detecting language and complexity...\n📋 Preparing detailed explanation...\n💡 Gathering insights and best practices...",
                    });
                    
                    const explanation = await this._explainCode(data.value);
                    webviewView.webview.postMessage({
                        type: "addResponse",
                        value: explanation,
                    });
                    break;
                }
                case "improveCode": {
                    sendTelemetryEvent('chat.code.improve.triggered');
                    
                    // Show enhanced loading message
                    webviewView.webview.postMessage({
                        type: "addResponse",
                        value: "⚡ **Reviewing your code...**\n\n🔍 Analyzing performance opportunities...\n📖 Checking readability and maintainability...\n🛡️ Scanning for security and best practices...\n🔧 Preparing optimized version...",
                    });
                    
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
            // Detect programming language
            const language = this._detectLanguage(code);
            const complexity = this._analyzeComplexity(code);
            
            const systemPrompt = `You are an expert ${language} developer and code educator. Provide a comprehensive code explanation with:

## 📋 Code Overview
- **Purpose**: What this code accomplishes
- **Language**: ${language} (${complexity} complexity)
- **Type**: Function/Class/Module/Script

## 🔍 Detailed Analysis
1. **Core Logic**: Step-by-step breakdown of what happens
2. **Key Concepts**: Important programming concepts used
3. **Data Flow**: How data moves through the code
4. **Dependencies**: External libraries or modules used

## 💡 Learning Points
- **Best Practices**: What's done well
- **Patterns**: Design patterns or architectural concepts
- **Performance**: Efficiency considerations

## 🚀 Potential Enhancements
- **Improvements**: Specific suggestions for better code
- **Alternatives**: Different approaches to consider
- **Next Steps**: How to extend or modify this code

Format your response with clear sections, use code examples where helpful, and explain technical terms for better understanding.`;

            const result = await callLLM(`Analyze and explain this ${language} code:\n\`\`\`${language}\n${code}\n\`\`\``, systemPrompt, 60_000, undefined, 'ocliteGenerator');
            return result || "⚠️ Failed to explain code. Please try again.";
        } catch (err: any) {
            return `⚠️ Error analyzing code: ${err.message}`;
        }
    }

    private async _improveCode(code: string): Promise<string> {
        try {
            // Detect programming language and analyze context
            const language = this._detectLanguage(code);
            const codeType = this._analyzeCodeType(code);
            const complexity = this._analyzeComplexity(code);
            
            const systemPrompt = `You are a senior ${language} architect and code reviewer. Provide a comprehensive code improvement analysis:

## 🔍 Code Review Summary
- **Language**: ${language}
- **Type**: ${codeType}
- **Complexity**: ${complexity}
- **Current State**: Brief assessment

## ⚡ Performance Improvements
- **Optimization opportunities**: Specific performance enhancements
- **Memory usage**: Reduce memory footprint
- **Algorithm efficiency**: Better algorithms or data structures
- **Async/concurrency**: Improve parallel processing where applicable

## 📖 Readability & Maintainability
- **Code structure**: Better organization and modularity
- **Naming conventions**: Clearer variable and function names
- **Comments & documentation**: Essential documentation needs
- **Code simplification**: Remove complexity where possible

## 🛡️ Security & Best Practices
- **Security vulnerabilities**: Potential security issues
- **Error handling**: Robust error management
- **Input validation**: Proper data validation
- **${language} best practices**: Language-specific recommendations

## 🔧 Refactored Code
Provide the improved version with:
- **Clean implementation**: Optimized and readable code
- **Inline comments**: Explain key improvements
- **Breaking changes**: Note any API changes

## 📋 Implementation Guide
- **Migration steps**: How to apply these changes
- **Testing considerations**: What to test after changes
- **Potential risks**: Things to watch out for

Focus on practical, actionable improvements that make real impact.`;

            const result = await callLLM(`Review and improve this ${language} code:\n\`\`\`${language}\n${code}\n\`\`\``, systemPrompt, 60_000, undefined, 'ocliteGenerator');
            return result || "⚠️ Failed to improve code. Please try again.";
        } catch (err: any) {
            return `⚠️ Error improving code: ${err.message}`;
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

    // Helper methods for code analysis
    private _detectLanguage(code: string): string {
        // Simple language detection based on syntax patterns
        if (code.includes('function') && code.includes('=>')) return 'JavaScript/TypeScript';
        if (code.includes('def ') && code.includes(':')) return 'Python';
        if (code.includes('public class') || code.includes('private ')) return 'Java';
        if (code.includes('#include') || code.includes('int main')) return 'C/C++';
        if (code.includes('fn ') && code.includes('->')) return 'Rust';
        if (code.includes('func ') && code.includes('package')) return 'Go';
        if (code.includes('<?php')) return 'PHP';
        if (code.includes('using System') || code.includes('namespace')) return 'C#';
        if (code.includes('<html>') || code.includes('<div>')) return 'HTML';
        if (code.includes('SELECT') || code.includes('FROM')) return 'SQL';
        if (code.includes('.css') || code.includes('{') && code.includes('}')) return 'CSS';
        return 'Unknown';
    }

    private _analyzeComplexity(code: string): string {
        const lines = code.split('\n').length;
        const functions = (code.match(/function|def |fn |func /g) || []).length;
        const loops = (code.match(/for|while|forEach/g) || []).length;
        const conditions = (code.match(/if|switch|case/g) || []).length;
        
        const complexity = functions + loops * 2 + conditions;
        
        if (lines < 20 && complexity < 5) return 'Simple';
        if (lines < 100 && complexity < 15) return 'Moderate';
        return 'Complex';
    }

    private _analyzeCodeType(code: string): string {
        if (code.includes('class ')) return 'Class Definition';
        if (code.includes('function') || code.includes('def ') || code.includes('fn ')) return 'Function/Method';
        if (code.includes('interface') || code.includes('type ')) return 'Type Definition';
        if (code.includes('import') || code.includes('require')) return 'Module/Import';
        if (code.includes('const') || code.includes('let') || code.includes('var')) return 'Variable Declaration';
        return 'Code Block';
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
        .enhanced-btn {
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 12px 16px;
            min-width: 120px;
            background: linear-gradient(135deg, var(--vscode-button-secondaryBackground), var(--vscode-editor-inactiveSelectionBackground));
            border: 1px solid var(--vscode-focusBorder);
            position: relative;
            overflow: hidden;
            border-radius: 8px;
        }
        .enhanced-btn:hover {
            background: linear-gradient(135deg, var(--vscode-button-secondaryHoverBackground), var(--vscode-list-hoverBackground));
            border-color: var(--vscode-button-foreground);
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        .enhanced-btn.loading {
            opacity: 0.7;
            pointer-events: none;
        }
        .enhanced-btn.loading::after {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
            animation: loading-shimmer 1.5s infinite;
        }
        @keyframes loading-shimmer {
            0% { left: -100%; }
            100% { left: 100%; }
        }
        .btn-icon {
            font-size: 18px;
            margin-bottom: 4px;
        }
        .btn-text {
            font-weight: 600;
            font-size: 11px;
            margin-bottom: 2px;
        }
        .btn-desc {
            font-size: 9px;
            opacity: 0.8;
            text-align: center;
            line-height: 1.2;
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
            <div style="margin-top: 16px; display: flex; flex-wrap: wrap; gap: 8px; justify-content: center;">
                <button class="quick-btn enhanced-btn" data-action="explain" title="Get detailed explanation of your code">
                    <span class="btn-icon">🧠</span>
                    <span class="btn-text">Explain Code</span>
                    <span class="btn-desc">Understand how it works</span>
                </button>
                <button class="quick-btn enhanced-btn" data-action="improve" title="Get suggestions to improve your code">
                    <span class="btn-icon">⚡</span>
                    <span class="btn-text">Improve Code</span>
                    <span class="btn-desc">Optimize & enhance</span>
                </button>
                <button class="quick-btn enhanced-btn" data-action="tests" title="Generate unit tests for your code">
                    <span class="btn-icon">🧪</span>
                    <span class="btn-text">Generate Tests</span>
                    <span class="btn-desc">Create test cases</span>
                </button>
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
            // Add loading state to enhanced buttons
            const button = document.querySelector('[data-action="' + action + '"]');
            if (button && button.classList.contains('enhanced-btn')) {
                button.classList.add('loading');
                setTimeout(() => button.classList.remove('loading'), 3000); // Remove after 3s
            }
            
            switch(action) {
                case 'explain':
                    promptEl.value = '🧠 Analyze and explain the code in my active editor with detailed breakdown';
                    promptEl.focus();
                    break;
                case 'improve':
                    promptEl.value = '⚡ Review and improve the code in my active editor with optimization suggestions';
                    promptEl.focus();
                    break;
                case 'tests':
                    promptEl.value = '🧪 Generate comprehensive unit tests for the code in my active editor';
                    promptEl.focus();
                    break;
                case 'image':
                    promptEl.value = '🎨 Generate an image of ';
                    promptEl.focus();
                    break;
                case 'brainstorm':
                    promptEl.value = '🚀 Brainstorm 10 creative ideas for ';
                    promptEl.focus();
                    break;
            }
        }
    </script>
</body>
</html>`;
    }
}
