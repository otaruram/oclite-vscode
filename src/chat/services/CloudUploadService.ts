/**
 * CloudUploadService.ts — Handles cloud upload and secure URL generation
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import { uploadGeneratedImage, getCurrentUser } from '../../services/blobStorage';
import { getSecureImageUrl } from '../../services/secureUrlService';
import { sendTelemetryEvent } from '../../services/telemetry';

export interface CloudUploadResult {
    success: boolean;
    shareUrl?: string;
    blobName?: string;
    error?: string;
}

export class CloudUploadService {
    /**
     * Upload image to cloud storage and get secure URL
     */
    async uploadImage(
        localPath: string,
        prompt: string,
        model: string,
        stream?: vscode.ChatResponseStream
    ): Promise<CloudUploadResult> {
        try {
            const user = getCurrentUser();
            if (!user) {
                return {
                    success: false,
                    error: 'User not authenticated'
                };
            }

            if (!fs.existsSync(localPath)) {
                return {
                    success: false,
                    error: 'Local file not found'
                };
            }

            if (stream) {
                stream.progress('☁️ Uploading to cloud...');
            }

            console.log('[OCLite] Auto-uploading to gallery...');
            const buf = fs.readFileSync(localPath);
            console.log(`[OCLite] Buffer size: ${buf.length} bytes`);
            
            // Upload to blob storage
            const uploadResult = await uploadGeneratedImage(buf, prompt, model);
            if (!uploadResult) {
                return {
                    success: false,
                    error: 'Upload to blob storage failed'
                };
            }

            // Extract blob name from the URL for secure URL generation
            let blobName: string | undefined;
            try {
                const url = new URL(uploadResult);
                const pathParts = url.pathname.split('/');
                if (pathParts.length >= 3) {
                    // URL format: https://account.blob.core.windows.net/container/user/filename
                    blobName = pathParts.slice(2).join('/'); // Get everything after container name
                }
            } catch (e) {
                console.warn('[OCLite] Failed to extract blob name from URL:', e);
            }

            console.log(`[OCLite] Cloud upload result: ${uploadResult}`);
            console.log(`[OCLite] Extracted blob name: ${blobName}`);

            sendTelemetryEvent('cloud.upload.success', {
                model,
                promptLength: prompt.length.toString(),
                fileSizeBytes: buf.length.toString(),
                hasBlobName: blobName ? 'true' : 'false'
            });

            return {
                success: true,
                shareUrl: uploadResult,
                blobName
            };

        } catch (error: any) {
            console.error('[OCLite] Auto-upload to gallery failed:', error.message);
            
            sendTelemetryEvent('cloud.upload.error', {
                error: error.message,
                model,
                promptLength: prompt.length.toString()
            });

            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Generate secure URL for existing blob
     */
    async generateSecureUrl(blobName: string): Promise<string | null> {
        try {
            console.log(`[OCLite] Generating secure URL for: ${blobName}`);
            const secureUrl = await getSecureImageUrl(blobName);
            
            if (secureUrl) {
                console.log(`[OCLite] Secure URL generated successfully`);
                sendTelemetryEvent('secure_url.generated', {
                    blobName: blobName.substring(0, 50) // Truncate for privacy
                });
                return secureUrl;
            } else {
                console.error(`[OCLite] Failed to generate secure URL for ${blobName}`);
                sendTelemetryEvent('secure_url.generation_failed', {
                    blobName: blobName.substring(0, 50)
                });
                return null;
            }
        } catch (error: any) {
            console.error(`[OCLite] Secure URL generation error:`, error.message);
            sendTelemetryEvent('secure_url.error', {
                error: error.message,
                blobName: blobName.substring(0, 50)
            });
            return null;
        }
    }

    /**
     * Create share button with secure URL if available
     */
    createShareButton(shareUrl: string, blobName?: string): { command: string; title: string; arguments: any[] } {
        if (blobName) {
            return { 
                command: 'oclite.copyShareLink', 
                title: '📋 Share (Secure)', 
                arguments: [shareUrl, blobName] 
            };
        } else {
            return { 
                command: 'oclite.copyShareLink', 
                title: '📋 Share', 
                arguments: [shareUrl] 
            };
        }
    }

    /**
     * Show upload tips to user
     */
    showUploadTips(stream: vscode.ChatResponseStream): void {
        const user = getCurrentUser();
        if (!user) {
            stream.markdown('\n💡 **Tip:** Sign in with Microsoft to enable cloud sharing.');
            sendTelemetryEvent('cloud.upload.tip_shown', { reason: 'no_auth' });
        }
    }
}