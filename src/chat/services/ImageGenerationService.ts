/**
 * ImageGenerationService.ts — Handles image generation, download, and temp file management
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import axios from 'axios';
import { getGeneratorUrl } from '../../utilities/secrets';
import { sendTelemetryEvent } from '../../services/telemetry';

/** Map of temp files for cleanup */
const downloadedImages = new Map<string, string>();

export class ImageGenerationService {
    /**
     * Generate image using complete flow: HttpTrigger2 → HttpTrigger1 → HttpTrigger4
     * Returns SAS URL for cloud-stored image
     */
    async generateImage(
        apiKey: string,
        model: string,
        prompt: string,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<string | null> {
        const { getHttpTrigger1Url, getHttpTrigger2Url, getHttpTrigger4Url } = require('../../utilities/secrets');
        
        try {
            // STEP 1: Refine prompt with HttpTrigger2
            stream.progress('🎨 Refining prompt...');
            console.log(`[OCLite] Step 1: Refining prompt with HttpTrigger2`);
            
            const trigger2Url = getHttpTrigger2Url();
            const refineResponse = await axios.post(
                trigger2Url,
                { prompt: prompt, type: 'chatParticipant' },
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 30000,
                    cancelToken: new axios.CancelToken((c) => token.onCancellationRequested(() => c())),
                }
            );
            
            const refinedPrompt = refineResponse.data.response || refineResponse.data.message || prompt;
            console.log(`[OCLite] Refined prompt: ${refinedPrompt}`);
            
            // STEP 2: Generate image with HttpTrigger1 (returns base64)
            stream.progress('🖼️ Generating image...');
            console.log(`[OCLite] Step 2: Generating image with HttpTrigger1`);
            
            const trigger1Url = getHttpTrigger1Url();
            const generateResponse = await axios.post(
                trigger1Url,
                { prompt: refinedPrompt },
                {
                    headers: { 
                        'Content-Type': 'application/json',
                        'x-oclite-signature': `oclite-${Date.now()}`,
                        'x-oclite-timestamp': Date.now().toString()
                    },
                    timeout: 120000,
                    cancelToken: new axios.CancelToken((c) => token.onCancellationRequested(() => c())),
                }
            );
            
            if (generateResponse.data.status !== 'succeeded' || !generateResponse.data.imageData) {
                throw new Error('HttpTrigger1 failed to generate image');
            }
            
            const imageBase64 = generateResponse.data.imageData;
            console.log(`[OCLite] Image generated: ${imageBase64.length} chars base64`);
            
            // STEP 3: Upload to blob with HttpTrigger4 (returns SAS URL)
            stream.progress('☁️ Uploading to cloud storage...');
            console.log(`[OCLite] Step 3: Uploading to blob with HttpTrigger4`);
            
            const trigger4Url = getHttpTrigger4Url();
            const uploadResponse = await axios.post(
                trigger4Url,
                { 
                    imageData: imageBase64, 
                    prompt: refinedPrompt,
                    model: model 
                },
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 60000,
                    cancelToken: new axios.CancelToken((c) => token.onCancellationRequested(() => c())),
                }
            );
            
            if (uploadResponse.data.status !== 'success' || !uploadResponse.data.sasUrl) {
                throw new Error('HttpTrigger4 failed to upload image');
            }
            
            const sasUrl = uploadResponse.data.sasUrl;
            console.log(`[OCLite] SAS URL: ${sasUrl}`);
            
            sendTelemetryEvent('image.generation.success', { 
                model, 
                promptLength: prompt.length.toString(),
                flow: 'complete'
            });
            
            return sasUrl;
            
        } catch (err: any) {
            const status = err.response?.status;
            const errBody = JSON.stringify(err.response?.data || err.message).substring(0, 300);
            console.error(`[OCLite] Complete flow failed: HTTP ${status} | ${errBody}`);
            
            sendTelemetryEvent('image.generation.error', { 
                error: err.message,
                status: status?.toString() || 'unknown',
                flow: 'complete'
            });
            
            throw err;
        }
    }

    /**
     * Download image to temporary file
     */
    async downloadToTemp(imageUrl: string, prompt: string): Promise<string> {
        console.log(`[OCLite] Downloading image from: ${imageUrl}`);
        console.log(`[OCLite] Prompt: ${prompt.substring(0, 50)}...`);
        
        // Ensure imageUrl is a string and validate
        const imageUrlStr = String(imageUrl || '');
        if (!imageUrlStr || !imageUrlStr.startsWith('http')) {
            throw new Error(`Invalid image URL: ${imageUrlStr}`);
        }
        
        try {
            const response = await axios.get(imageUrlStr, { 
                responseType: 'arraybuffer', 
                timeout: 90000, // 90s — generation URLs can be slow to serve
                headers: {
                    'User-Agent': 'OCLite-VSCode-Extension'
                }
            });
            
            console.log(`[OCLite] Download response status: ${response.status}`);
            console.log(`[OCLite] Content-Type: ${response.headers['content-type']}`);
            console.log(`[OCLite] Content-Length: ${response.data.byteLength} bytes`);
            
            if (!response.data || response.data.byteLength === 0) {
                throw new Error('Downloaded image is empty');
            }
            
            // Validate content type
            const contentType = response.headers['content-type'] || '';
            if (!contentType.startsWith('image/')) {
                console.warn(`[OCLite] Unexpected content type: ${contentType}`);
                // Don't throw error, some servers don't set proper content-type
            }
            
            const tempDir = path.join(os.tmpdir(), 'oclite');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
                console.log(`[OCLite] Created temp directory: ${tempDir}`);
            }

            const slug = prompt.slice(0, 30).replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
            const tempPath = path.join(tempDir, `${slug}_${Date.now()}.png`);
            
            // Write the buffer to file
            const buffer = Buffer.from(response.data);
            fs.writeFileSync(tempPath, buffer);
            
            // Verify the file was written correctly
            const stats = fs.statSync(tempPath);
            console.log(`[OCLite] Saved image to: ${tempPath}`);
            console.log(`[OCLite] File size: ${stats.size} bytes`);
            
            if (stats.size === 0) {
                throw new Error('Saved image file is empty');
            }

            downloadedImages.set(tempPath, tempPath);
            setTimeout(() => this.cleanupTempFile(tempPath), 30 * 60 * 1000); // 30 minutes
            
            sendTelemetryEvent('image.download.success', { 
                fileSizeBytes: stats.size.toString() 
            });
            
            return tempPath;
        } catch (error: any) {
            console.error(`[OCLite] Download failed:`, error);
            
            sendTelemetryEvent('image.download.error', { 
                error: error.message 
            });
            
            if (error.code === 'ENOTFOUND') {
                throw new Error(`Failed to download image: Network error - could not resolve host`);
            } else if (error.code === 'ETIMEDOUT') {
                throw new Error(`Failed to download image: Request timed out`);
            } else {
                throw new Error(`Failed to download image: ${error.message}`);
            }
        }
    }

    /**
     * Clean up a specific temp file
     */
    cleanupTempFile(filePath: string): void {
        try {
            if (fs.existsSync(filePath)) { 
                fs.unlinkSync(filePath); 
                downloadedImages.delete(filePath); 
                console.log(`[OCLite] Cleaned up temp file: ${filePath}`);
            }
        } catch (error) { 
            console.warn(`[OCLite] Failed to cleanup temp file: ${filePath}`, error);
        }
    }

    /**
     * Clean all temp files (call on deactivate)
     */
    static cleanupAll(): void {
        const tempDir = path.join(os.tmpdir(), 'oclite');
        try {
            if (fs.existsSync(tempDir)) {
                fs.readdirSync(tempDir).forEach((f) => {
                    try { 
                        fs.unlinkSync(path.join(tempDir, f)); 
                    } catch { 
                        /* ignore */ 
                    }
                });
                try { 
                    fs.rmdirSync(tempDir); 
                } catch { 
                    /* maybe not empty */ 
                }
            }
            downloadedImages.clear();
            console.log('[OCLite] All temp files cleaned up');
        } catch (error) { 
            console.warn('[OCLite] Failed to cleanup all temp files:', error);
        }
    }

    /**
     * Get temp files count for monitoring
     */
    static getTempFilesCount(): number {
        return downloadedImages.size;
    }
}