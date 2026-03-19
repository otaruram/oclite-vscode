/**
 * AttachmentHandler.ts — Handles file attachments and vision AI analysis
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { sendTelemetryEvent } from '../../services/telemetry';

export interface AttachmentResult {
    hasAttachments: boolean;
    imageUrl?: string;
    attachedDocuments: string[];
    enhancedPrompt?: string;
}

export class AttachmentHandler {
    /**
     * Process file attachments from chat request
     */
    async processAttachments(
        request: vscode.ChatRequest,
        stream: vscode.ChatResponseStream
    ): Promise<AttachmentResult> {
        let imageUrl: string | undefined;
        let attachedDocuments: string[] = [];
        let enhancedPrompt: string | undefined;
        
        if (!request.references || request.references.length === 0) {
            return { 
                hasAttachments: false, 
                attachedDocuments: [] 
            };
        }

        for (const ref of request.references) {
            if (ref.value instanceof vscode.Uri) {
                const filePath = ref.value.fsPath;
                const ext = path.extname(filePath).toLowerCase();
                
                // Handle image attachments
                if (this.isImageFile(ext)) {
                    const analysisResult = await this.handleImageAttachment(filePath, ext, request.prompt, stream);
                    if (analysisResult) {
                        return {
                            hasAttachments: true,
                            imageUrl: filePath,
                            attachedDocuments: [],
                            enhancedPrompt: analysisResult
                        };
                    }
                }
                
                // Handle document attachments
                if (this.isDocumentFile(ext)) {
                    const content = await this.handleDocumentAttachment(filePath, ext, stream);
                    if (content) {
                        attachedDocuments.push(content);
                    }
                }
            }
        }
        
        // If documents attached, enhance prompt with context
        if (attachedDocuments.length > 0) {
            enhancedPrompt = await this.enhancePromptWithDocuments(request.prompt, attachedDocuments, stream);
        }

        return {
            hasAttachments: attachedDocuments.length > 0,
            attachedDocuments,
            enhancedPrompt
        };
    }

    private isImageFile(ext: string): boolean {
        return ['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext);
    }

    private isDocumentFile(ext: string): boolean {
        return ['.pdf', '.docx', '.txt', '.md'].includes(ext);
    }

    private async handleImageAttachment(
        filePath: string,
        ext: string,
        prompt: string,
        stream: vscode.ChatResponseStream
    ): Promise<string | null> {
        stream.markdown('📸 **Image detected!** Analyzing with Vision AI...\n\n');
        
        try {
            const { callLLM } = require('../../services/llm');
            const imageBuffer = fs.readFileSync(filePath);
            const base64Image = `data:image/${ext.slice(1)};base64,${imageBuffer.toString('base64')}`;
            
            const analysis = await callLLM(
                prompt || 'Analyze this image comprehensively',
                'You are an expert image analyst and creative director. Provide: 1) Detailed visual description 2) Style analysis 3) Color palette 4) Mood/atmosphere 5) Technical composition. Be specific and professional.',
                30000,
                base64Image,
                'chatParticipant'
            );
            
            if (analysis) {
                stream.markdown(`### 🎨 Vision AI Analysis\n\n${analysis}\n\n`);
                stream.markdown('### 💡 Quick Actions\n\n');
                
                // Add action buttons
                stream.button({ 
                    command: 'oclite.generateFromPrompt', 
                    title: '🔄 Generate Variations',
                    arguments: [`/batch ${analysis.substring(0, 150)}`]
                });
                stream.button({ 
                    command: 'oclite.generateFromPrompt', 
                    title: '🎨 Extract Style',
                    arguments: [`Create new image in this style: ${analysis.substring(0, 100)}`]
                });
                stream.button({ 
                    command: 'oclite.generateFromPrompt', 
                    title: '🌈 Different Color Palette',
                    arguments: [`Same composition but with vibrant neon colors: ${analysis.substring(0, 100)}`]
                });
                
                sendTelemetryEvent('attachment.image.analyzed', {
                    fileExtension: ext,
                    analysisLength: analysis.length.toString()
                });
                
                return analysis;
            }
        } catch (err: any) {
            stream.markdown(`⚠️ Image analysis failed: ${err.message}\n\n`);
            sendTelemetryEvent('attachment.image.error', {
                error: err.message,
                fileExtension: ext
            });
        }
        
        return null;
    }

    private async handleDocumentAttachment(
        filePath: string,
        ext: string,
        stream: vscode.ChatResponseStream
    ): Promise<string | null> {
        try {
            let content = '';
            
            if (ext === '.txt' || ext === '.md') {
                content = fs.readFileSync(filePath, 'utf-8');
            }
            // TODO: Add PDF and DOCX support if needed
            
            if (content) {
                const truncatedContent = content.substring(0, 2000); // Limit to 2000 chars
                stream.markdown(`📄 **Document attached:** ${path.basename(filePath)}\n\n`);
                
                sendTelemetryEvent('attachment.document.processed', {
                    fileExtension: ext,
                    contentLength: content.length.toString(),
                    fileName: path.basename(filePath)
                });
                
                return truncatedContent;
            }
        } catch (err: any) {
            console.warn('[OCLite] Failed to read document:', err.message);
            sendTelemetryEvent('attachment.document.error', {
                error: err.message,
                fileExtension: ext
            });
        }
        
        return null;
    }

    private async enhancePromptWithDocuments(
        originalPrompt: string,
        documents: string[],
        stream: vscode.ChatResponseStream
    ): Promise<string | undefined> {
        const docContext = documents.join('\n\n---\n\n');
        stream.markdown('📚 **Using document context to enhance generation...**\n\n');
        
        try {
            const { callLLM } = require('../../services/llm');
            const enhancedPrompt = await callLLM(
                `User request: ${originalPrompt}\n\nDocument context:\n${docContext}`,
                'Based on the document context, create a detailed image generation prompt that captures the key concepts, themes, and visual elements. Be specific about style, composition, and mood.',
                30000,
                undefined,
                'chatParticipant'
            );
            
            if (enhancedPrompt) {
                stream.markdown(`**📝 Enhanced prompt:** _${enhancedPrompt}_\n\n`);
                
                sendTelemetryEvent('attachment.prompt.enhanced', {
                    originalLength: originalPrompt.length.toString(),
                    enhancedLength: enhancedPrompt.length.toString(),
                    documentCount: documents.length.toString()
                });
                
                return enhancedPrompt;
            }
        } catch (err: any) {
            console.warn('[OCLite] Failed to enhance prompt with documents:', err.message);
            sendTelemetryEvent('attachment.prompt.enhancement_error', {
                error: err.message
            });
        }
        
        return undefined;
    }
}