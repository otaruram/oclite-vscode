/**
 * services/imagekit.ts — ImageKit upload service for OCLite via Azure Function.
 *
 * Flow: raw image buffer → Azure Function → ImageKit → get public CDN URL.
 */
import axios from 'axios';
import { sendTelemetryEvent } from './telemetry';
import { getImagekitFunctionUrl } from '../utilities/secrets';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

export interface ImageKitUploadResult {
    /** Public CDN URL of the uploaded image */
    url: string;
    /** ImageKit file ID (for future management) */
    fileId: string;
    /** Thumbnail URL */
    thumbnailUrl: string;
}

/** Simple delay helper */
function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Upload an image buffer to ImageKit via Azure Function with retry.
 *
 * @param imageBuffer - Raw PNG/JPEG bytes
 * @param fileName    - Desired file name (e.g. "2025-01-01_oclite_sunset.png")
 * @param folder      - Remote folder path (e.g. "/oclite-images/user123")
 * @param tags        - Optional tags for organisation
 * @returns Public ImageKit CDN URL + metadata, or null on failure
 */
export async function uploadToImageKit(
    imageBuffer: Buffer,
    fileName: string,
    folder: string = '/oclite-images', // Changed for security
    tags: string[] = ['oclite', 'ai-generated'],
): Promise<ImageKitUploadResult | null> {
    const base64File = imageBuffer.toString('base64');
    const imageData = `data:image/png;base64,${base64File}`;

    let lastError: any = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            console.log(`[OCLite ImageKit] Upload attempt ${attempt}/${MAX_RETRIES} via Azure Function...`);

            const response = await axios.post(
                getImagekitFunctionUrl(),
                {
                    action: 'upload',
                    imageData: imageData,
                    fileName: fileName,
                    folder: folder,
                    tags: tags
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'x-oclite-signature': `oclite-${Date.now()}`,
                        'x-oclite-timestamp': Date.now().toString()
                    },
                    timeout: 60000, // 60 seconds
                }
            );

            if (response.data.status === 'success' && response.data.result) {
                const result = response.data.result;
                
                console.log(`[OCLite ImageKit] Uploaded via Azure Function: ${result.url}`);
                sendTelemetryEvent('imagekit.upload.success', {
                    fileId: result.fileId || '',
                    sizeBytes: imageBuffer.length.toString(),
                    attempt: attempt.toString(),
                    service: 'azure-function'
                });

                return {
                    url: result.url,
                    fileId: result.fileId || '',
                    thumbnailUrl: result.thumbnailUrl || result.url,
                };
            } else {
                lastError = new Error('Azure Function returned no valid result');
                console.error('[OCLite ImageKit] Azure Function returned no valid result:', response.data);
                continue;
            }
        } catch (error: any) {
            lastError = error;
            console.warn(`[OCLite ImageKit] Attempt ${attempt} failed: ${error.response?.data || error.message}`);

            if (attempt < MAX_RETRIES) {
                const waitMs = RETRY_DELAY_MS * attempt; // linear backoff
                console.log(`[OCLite ImageKit] Retrying in ${waitMs}ms...`);
                await delay(waitMs);
            }
        }
    }

    // All retries exhausted
    console.error(`[OCLite ImageKit] Upload failed after ${MAX_RETRIES} attempts:`, lastError?.message);
    sendTelemetryEvent('imagekit.upload.error', {
        error: lastError?.message || 'unknown',
        attempts: MAX_RETRIES.toString(),
        service: 'azure-function'
    });
    return null;
}

/**
 * Delete a file from ImageKit by its fileId via Azure Function.
 */
export async function deleteFromImageKit(fileId: string): Promise<boolean> {
    if (!fileId || fileId === 'unknown') { return false; }
    
    try {
        console.log(`[OCLite ImageKit] Deleting file ${fileId} via Azure Function...`);
        
        const response = await axios.post(
            getImagekitFunctionUrl(),
            {
                action: 'delete',
                fileId: fileId
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'x-oclite-signature': `oclite-${Date.now()}`,
                    'x-oclite-timestamp': Date.now().toString()
                },
                timeout: 30000,
            }
        );

        if (response.data.status === 'success') {
            console.log(`[OCLite ImageKit] Deleted file via Azure Function: ${fileId}`);
            sendTelemetryEvent('imagekit.delete.success', { fileId, service: 'azure-function' });
            return true;
        } else {
            throw new Error('Azure Function delete operation failed');
        }
    } catch (error: any) {
        console.error(`[OCLite ImageKit] Delete failed for ${fileId}:`, error.response?.data || error.message);
        sendTelemetryEvent('imagekit.delete.error', { 
            fileId, 
            error: error.message,
            service: 'azure-function'
        });
        return false;
    }
}

/**
 * Get optimized URL for an image with transformations via Azure Function.
 */
export async function getImageKitUrl(
    fileName: string,
    transformations: {
        width?: number;
        height?: number;
        quality?: number;
        format?: string;
        crop?: string;
    } = {}
): Promise<string | null> {
    try {
        console.log(`[OCLite ImageKit] Getting URL for ${fileName} via Azure Function...`);
        
        const response = await axios.post(
            getImagekitFunctionUrl(),
            {
                action: 'getUrl',
                fileName: fileName,
                transformations: transformations
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'x-oclite-signature': `oclite-${Date.now()}`,
                    'x-oclite-timestamp': Date.now().toString()
                },
                timeout: 10000,
            }
        );

        if (response.data.status === 'success' && response.data.result?.url) {
            console.log(`[OCLite ImageKit] Generated URL: ${response.data.result.url}`);
            sendTelemetryEvent('imagekit.getUrl.success', { 
                fileName,
                service: 'azure-function'
            });
            return response.data.result.url;
        } else {
            throw new Error('Azure Function getUrl operation failed');
        }
    } catch (error: any) {
        console.error(`[OCLite ImageKit] Get URL failed for ${fileName}:`, error.response?.data || error.message);
        sendTelemetryEvent('imagekit.getUrl.error', { 
            fileName, 
            error: error.message,
            service: 'azure-function'
        });
        return null;
    }
}
