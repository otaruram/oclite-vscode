/**
 * services/imagekit.ts — ImageKit upload service for OCLite.
 *
 * Flow: raw image buffer → upload to ImageKit → get public CDN URL.
 * The ImageKit URL is then stored as metadata in Azure Blob Storage.
 */
import { ImageKit } from '@imagekit/nodejs';
import { getImageKitPrivateKey, getImageKitUrlEndpoint } from '../utilities/secrets';
import { sendTelemetryEvent } from './telemetry';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

let _client: InstanceType<typeof ImageKit> | null = null;

function getClient(): InstanceType<typeof ImageKit> {
    if (!_client) {
        _client = new ImageKit({
            privateKey: getImageKitPrivateKey(),
            timeout: 60_000,        // 60 s connect+read timeout
            maxRetries: MAX_RETRIES, // SDK-level retries
        });
    }
    return _client;
}

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
 * Upload an image buffer to ImageKit with retry.
 *
 * @param imageBuffer - Raw PNG/JPEG bytes
 * @param fileName    - Desired file name (e.g. "2025-01-01_oclite_sunset.png")
 * @param folder      - Remote folder path (e.g. "/oclite-gallery/user123")
 * @param tags        - Optional tags for organisation
 * @returns Public ImageKit CDN URL + metadata, or null on failure
 */
export async function uploadToImageKit(
    imageBuffer: Buffer,
    fileName: string,
    folder: string = '/oclite-gallery',
    tags: string[] = ['oclite', 'ai-generated'],
): Promise<ImageKitUploadResult | null> {
    const client = getClient();
    const base64File = imageBuffer.toString('base64');

    let lastError: any = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            console.log(`[OCLite ImageKit] Upload attempt ${attempt}/${MAX_RETRIES}...`);

            const result = await client.files.upload({
                file: base64File,
                fileName,
                folder,
                tags,
                useUniqueFileName: true,
            });

            if (!result || !result.url) {
                console.error('[OCLite ImageKit] Upload returned no URL');
                lastError = new Error('Upload returned no URL');
                continue;
            }

            console.log(`[OCLite ImageKit] Uploaded: ${result.url}`);
            sendTelemetryEvent('imagekit.upload.success', {
                fileId: result.fileId || '',
                sizeBytes: imageBuffer.length.toString(),
                attempt: attempt.toString(),
            });

            return {
                url: result.url,
                fileId: result.fileId || '',
                thumbnailUrl: result.thumbnailUrl || result.url,
            };
        } catch (error: any) {
            lastError = error;
            console.warn(`[OCLite ImageKit] Attempt ${attempt} failed: ${error.message}`);

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
    });
    return null;
}
