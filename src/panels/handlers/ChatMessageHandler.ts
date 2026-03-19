/**
 * ChatMessageHandler.ts — Handles different types of chat messages
 */
import * as vscode from 'vscode';
import { callLLM } from '../../services/llm';
import { sendTelemetryEvent } from '../../services/telemetry';

export interface ChatMessage {
    type: string;
    value: string;
    attachedImage?: string;
    attachedText?: string;
    attachedFileName?: string;
    attachedBinary?: string;
}

export class ChatMessageHandler {
    /**
     * Handle different types of chat messages
     */
    async handleMessage(message: ChatMessage): Promise<string> {
        switch (message.type) {
            case 'askAI':
                return await this.handleAskAI(message);
            case 'explainCode':
                return await this.handleExplainCode(message.value);
            case 'improveCode':
                return await this.handleImproveCode(message.value);
            case 'brainstormIdeas':
                return await this.handleBrainstormIdeas(message.value);
            default:
                return "⚠️ Unknown message type";
        }
    }

    /**
     * Handle general AI questions with context
     */
    private async handleAskAI(message: ChatMessage): Promise<string> {
        const startTime = Date.now();
        
        try {
            let finalPrompt = message.value;
            let imageUrl = message.attachedImage;

            // Extract context from active editor/tab if no manual attachment
            if (!message.attachedImage && !message.attachedText && !message.attachedBinary) {
                const contextResult = await this.extractEditorContext(message.value);
                finalPrompt = contextResult.prompt;
                imageUrl = contextResult.imageUrl || imageUrl;
            } else {
                // Handle manually attached files
                const attachmentResult = await this.processAttachment(message);
                finalPrompt = attachmentResult.prompt;
                imageUrl = attachmentResult.imageUrl || imageUrl;
            }

            const systemPrompt = "You are OCLite AI, a helpful software engineer and creative assistant. When context (code or image) is provided, use it to accurately answer the user's question.";
            const result = await callLLM(finalPrompt, systemPrompt, 60_000, imageUrl, 'chatProvider');
            
            const duration = Date.now() - startTime;
            if (result) {
                sendTelemetryEvent('chat.llm.success', {
                    promptLength: message.value.length.toString(),
                    responseLength: result.length.toString()
                }, { duration });
                return result;
            } else {
                sendTelemetryEvent('chat.llm.no_response', undefined, { duration });
                return "⚠️ No response from AI. Please try again.";
            }
        } catch (err: any) {
            const duration = Date.now() - startTime;
            sendTelemetryEvent('chat.llm.error', {
                errorMessage: err.message || 'unknown'
            }, { duration });
            console.error("OCLite ChatProvider error:", err);
            return `⚠️ Error: ${err.message}`;
        }
    }

    /**
     * Handle code explanation requests
     */
    private async handleExplainCode(code: string): Promise<string> {
        try {
            const language = this.detectLanguage(code);
            const complexity = this.analyzeComplexity(code);
            
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

    /**
     * Handle code improvement requests
     */
    private async handleImproveCode(code: string): Promise<string> {
        try {
            const language = this.detectLanguage(code);
            const codeType = this.analyzeCodeType(code);
            const complexity = this.analyzeComplexity(code);
            
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

    /**
     * Handle brainstorming requests
     */
    private async handleBrainstormIdeas(topic: string): Promise<string> {
        try {
            const topicType = this.analyzeTopicType(topic);
            const complexity = topic.length > 100 ? 'Complex' : topic.length > 50 ? 'Moderate' : 'Simple';
            
            const systemPrompt = `You are a creative innovation consultant and brainstorming expert. Generate comprehensive and actionable ideas:

## 🎯 Brainstorming Session
- **Topic**: ${topic}
- **Type**: ${topicType}
- **Scope**: ${complexity} exploration
- **Goal**: Generate diverse, practical, and innovative solutions

## 💡 Creative Ideas Framework
Provide 10 unique ideas organized by categories:

### 🚀 **Innovative Approaches**
- **Cutting-edge solutions**: Modern, tech-forward ideas
- **Disruptive concepts**: Game-changing approaches
- **Future-oriented**: Forward-thinking possibilities

### 🎨 **Creative Solutions**
- **Artistic approaches**: Design-focused ideas
- **User experience**: Human-centered solutions
- **Aesthetic innovations**: Visually appealing concepts

### 🔧 **Practical Implementations**
- **Quick wins**: Easy-to-implement ideas
- **Resource-efficient**: Cost-effective solutions
- **Scalable options**: Growth-oriented approaches

### 🌟 **Unique Perspectives**
- **Unconventional angles**: Out-of-the-box thinking
- **Cross-industry inspiration**: Ideas from other domains
- **Experimental concepts**: Bold, experimental approaches

## 📋 Implementation Guide
For each idea, provide:
- **Core concept**: What it is
- **Why it works**: The reasoning behind it
- **Next steps**: How to get started
- **Potential impact**: Expected outcomes

Focus on actionable, diverse, and inspiring ideas that spark creativity and provide real value.`;

            const result = await callLLM(`Brainstorm creative ideas for: ${topic}`, systemPrompt, 60_000, undefined, 'ocliteGenerator');
            return result || "⚠️ Failed to generate ideas. Please try again with a different topic.";
        } catch (err: any) {
            return `⚠️ Error brainstorming ideas: ${err.message}`;
        }
    }

    /**
     * Extract context from active editor or tab
     */
    private async extractEditorContext(prompt: string): Promise<{ prompt: string; imageUrl?: string }> {
        const activeTab = vscode.window.tabGroups.activeTabGroup?.activeTab;
        const editor = vscode.window.activeTextEditor;

        if (editor && editor.document.uri.scheme !== 'output') {
            const fileName = editor.document.fileName.split(/[/\\]/).pop() || 'file';
            const content = editor.document.getText();
            if (content.trim().length > 0 && content.length < 50000) {
                return {
                    prompt: `[Context from active file: ${fileName}]\n\`\`\`\n${content}\n\`\`\`\n\nUser Question: ${prompt}`
                };
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
                        return {
                            prompt: `[Context is attached as an image]\n\nUser Question: ${prompt}`,
                            imageUrl: `data:image/${mimeType};base64,${base64}`
                        };
                    } catch (e) {
                        console.warn('Failed to read image tab', e);
                    }
                }
            }
        }

        return { prompt };
    }

    /**
     * Process manually attached files
     */
    private async processAttachment(message: ChatMessage): Promise<{ prompt: string; imageUrl?: string }> {
        if (!message.attachedFileName) {
            return { prompt: message.value };
        }

        const lowerName = message.attachedFileName.toLowerCase();
        
        // Handle PDF files
        if (lowerName.endsWith('.pdf') && message.attachedBinary) {
            try {
                const pdfParse = require('pdf-parse');
                const base64Data = message.attachedBinary.includes(',') ? message.attachedBinary.split(',')[1] : message.attachedBinary;
                const buffer = Buffer.from(base64Data, 'base64');
                const pdfData = await pdfParse(buffer);
                const pdfText = pdfData?.text ?? '';
                return {
                    prompt: `[Attached PDF Document: ${message.attachedFileName}]\n\`\`\`\n${pdfText.substring(0, 30000)}\n\`\`\`\n\nUser Question: ${message.value}`
                };
            } catch (e) {
                console.error('PDF Parse Error:', e);
                return {
                    prompt: `[Failed to read PDF: ${message.attachedFileName}. Error: ${(e as any)?.message}]\n\nUser Question: ${message.value}`
                };
            }
        }

        // Handle Word documents
        if ((lowerName.endsWith('.doc') || lowerName.endsWith('.docx')) && message.attachedBinary) {
            try {
                if (lowerName.endsWith('.doc') && !lowerName.endsWith('.docx')) {
                    return {
                        prompt: `[System: The user tried to attach a legacy .doc file named ${message.attachedFileName}, but only .docx is supported for text extraction. It cannot be read.]\n\nUser Question: ${message.value}`
                    };
                } else {
                    const mammoth = require("mammoth");
                    const base64Data = message.attachedBinary.split(',')[1];
                    const buffer = Buffer.from(base64Data, 'base64');
                    const result = await mammoth.extractRawText({ buffer });
                    return {
                        prompt: `[Attached Word Document: ${message.attachedFileName}]\n\`\`\`\n${result.value.substring(0, 30000)}\n\`\`\`\n\nUser Question: ${message.value}`
                    };
                }
            } catch (e) {
                console.error('DOCX Parse Error:', e);
                return {
                    prompt: `[Failed to read Document: ${message.attachedFileName}]\n\nUser Question: ${message.value}`
                };
            }
        }

        // Handle text files
        if (message.attachedText) {
            return {
                prompt: `[Attached Context: ${message.attachedFileName}]\n\`\`\`\n${message.attachedText.substring(0, 30000)}\n\`\`\`\n\nUser Question: ${message.value}`
            };
        }

        // Handle images
        if (message.attachedImage) {
            return {
                prompt: `[User attached an image: ${message.attachedFileName}]\n\nUser Question: ${message.value}`,
                imageUrl: message.attachedImage
            };
        }

        return { prompt: message.value };
    }

    // Helper methods for code analysis
    private detectLanguage(code: string): string {
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

    private analyzeComplexity(code: string): string {
        const lines = code.split('\n').length;
        const functions = (code.match(/function|def |fn |func /g) || []).length;
        const loops = (code.match(/for|while|forEach/g) || []).length;
        const conditions = (code.match(/if|switch|case/g) || []).length;
        
        const complexity = functions + loops * 2 + conditions;
        
        if (lines < 20 && complexity < 5) return 'Simple';
        if (lines < 100 && complexity < 15) return 'Moderate';
        return 'Complex';
    }

    private analyzeCodeType(code: string): string {
        if (code.includes('class ')) return 'Class Definition';
        if (code.includes('function') || code.includes('def ') || code.includes('fn ')) return 'Function/Method';
        if (code.includes('interface') || code.includes('type ')) return 'Type Definition';
        if (code.includes('import') || code.includes('require')) return 'Module/Import';
        if (code.includes('const') || code.includes('let') || code.includes('var')) return 'Variable Declaration';
        return 'Code Block';
    }

    private analyzeTopicType(topic: string): string {
        const lowerTopic = topic.toLowerCase();
        
        if (lowerTopic.includes('app') || lowerTopic.includes('software') || lowerTopic.includes('code')) return 'Software Development';
        if (lowerTopic.includes('business') || lowerTopic.includes('startup') || lowerTopic.includes('company')) return 'Business Strategy';
        if (lowerTopic.includes('design') || lowerTopic.includes('ui') || lowerTopic.includes('ux')) return 'Design & UX';
        if (lowerTopic.includes('marketing') || lowerTopic.includes('promotion') || lowerTopic.includes('brand')) return 'Marketing & Branding';
        if (lowerTopic.includes('product') || lowerTopic.includes('feature') || lowerTopic.includes('service')) return 'Product Development';
        if (lowerTopic.includes('problem') || lowerTopic.includes('solution') || lowerTopic.includes('challenge')) return 'Problem Solving';
        if (lowerTopic.includes('content') || lowerTopic.includes('blog') || lowerTopic.includes('article')) return 'Content Creation';
        
        return 'General Innovation';
    }
}