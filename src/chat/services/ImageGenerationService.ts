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
     * Generate image using OCLite API
     */
    async generateImage(
        apiKey: string,
        model: string,
        prompt: string,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<string | null> {
        const generatorUrl = getGeneratorUrl();
        
        console.log(`[OCLite] POST ${generatorUrl} | prompt_len=${prompt.length}`);
        
        try {
            const response = await axios.post(
                generatorUrl,
                { prompt: prompt, apiKey: apiKey, model: model },
                {
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    timeout: 120000, // 2 minutes for image generation
                    cancelToken: new axios.CancelToken((c) => token.onCancellationRequested(() => c())),
                }
            );
            
            console.log(`[OCLite] Generate OK: HTTP ${response.status} | ${JSON.stringify(response.data).substring(0, 200)}`);
            
            let imageUrl: any = null;
            
            // Check for image URL in various response formats
            if (response.data.status === 'succeeded') {
                // Format 1: images array with URL
                if (response.data.images && response.data.images.length > 0) {
                    const img = response.data.images[0];
                    if (typeof img === 'string') {
                        imageUrl = img;
                    } else if (img && typeof img === 'object' && img.url) {
                        imageUrl = img.url;
                    }
                }
                
                // Format 2: direct image_url field
                if (!imageUrl && response.data.image_url) {
                    imageUrl = response.data.image_url;
                }
                
                // Format 3: output array (legacy)
                if (!imageUrl && response.data.output && response.data.output.length > 0) {
                    imageUrl = response.data.output[0];
                }
            }
            
            if (!imageUrl) {
                console.error('[OCLite] No valid image URL in response:', JSON.stringify(response.data));
                console.error('[OCLite] Response structure:', {
                    status: response.data.status,
                    hasImages: !!response.data.images,
                    imagesLength: response.data.images?.length,
                    firstImage: response.data.images?.[0],
                    hasImageUrl: !!response.data.image_url,
                    hasOutput: !!response.data.output
                });
                throw new Error('HttpTrigger1 did not return a valid image URL. Please check Azure Function logs.');
            }
            
            // Ensure imageUrl is a string before validation
            const imageUrlStr = String(imageUrl);
            
            // Validate the URL
            if (!imageUrlStr || imageUrlStr === 'undefined' || imageUrlStr === 'null') {
                throw new Error('Image URL is empty or invalid');
            }
            
            if (!imageUrlStr.startsWith('http://') && !imageUrlStr.startsWith('https://')) {
                console.error('[OCLite] Invalid image URL format:', imageUrlStr);
                throw new Error(`Invalid image URL format: ${imageUrlStr}`);
            }
            
            console.log(`[OCLite] Generated image URL: ${imageUrlStr}`);
            sendTelemetryEvent('image.generation.success', { 
                model, 
                promptLength: prompt.length.toString() 
            });
            
            return imageUrlStr;
            
        } catch (err: any) {
            const status = err.response?.status;
            const errBody = JSON.stringify(err.response?.data || err.message).substring(0, 300);
            console.error(`[OCLite] Generate failed: HTTP ${status} | ${errBody}`);
            
            sendTelemetryEvent('image.generation.error', { 
                error: err.message,
                status: status?.toString() || 'unknown'
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