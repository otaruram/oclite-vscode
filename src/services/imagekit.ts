/**
 * services/imagekit.ts — ImageKit upload service for OCLite.
 *
 * Flow: raw image buffer → upload to ImageKit → get public CDN URL.
 * The ImageKit URL is then stored as metadata in Azure Blob Storage.
 */
import { ImageKit } from '@imagekit/nodejs';
import { getImageKitPrivateKey, getImageKitUrlEndpoint } from '../utilities/secrets';
import { sendTelemetryEvent } from './telemetry';

let _client: InstanceType<typeof ImageKit> | null = null;

function getClient(): InstanceType<typeof ImageKit> {
    if (!_client) {
        _client = new ImageKit({
            privateKey: getImageKitPrivateKey(),
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

/**
 * Upload an image buffer to ImageKit.
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
    try {
        const client = getClient();

        // Convert Buffer to base64 string for upload
        const base64File = imageBuffer.toString('base64');

        const result = await client.files.upload({
            file: base64File,
            fileName,
            folder,
            tags,
            useUniqueFileName: true,
        });

        if (!result || !result.url) {
            console.error('[OCLite ImageKit] Upload returned no URL');
            return null;
        }

        console.log(`[OCLite ImageKit] Uploaded: ${result.url}`);
        sendTelemetryEvent('imagekit.upload.success', {
            fileId: result.fileId || '',
            sizeBytes: imageBuffer.length.toString(),
        });

        return {
            url: result.url,
            fileId: result.fileId || '',
            thumbnailUrl: result.thumbnailUrl || result.url,
        };
    } catch (error: any) {
        console.error('[OCLite ImageKit] Upload failed:', error.message);
        sendTelemetryEvent('imagekit.upload.error', { error: error.message });
        return null;
    }
}
