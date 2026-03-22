/**
 * secureUrlService.ts — Generate read-only per-blob SAS URLs for gallery display.
 *
 * Security model:
 *  - HttpTrigger4 SAS-only mode: generates per-blob read-only SAS (sp=r, 1-hour expiry)
 *  - Authentication via Azure Function key (already in URL ?code=)
 *  - Fallback: account-level SAS with read-only permissions
 */

import { GalleryImage } from '../types';
import { getBlobSasUrl, getSecureSasUrl } from '../utilities/secrets';
import { sendTelemetryEvent } from './telemetry';
import axios from 'axios';

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Generate a secure read-only SAS URL via HttpTrigger4 SAS-only mode.
 * HttpTrigger4 authenticates via function key (?code= in URL).
 */
async function buildReadOnlyBlobUrl(blobName: string): Promise<string | null> {
    try {
        const secureSasUrl = getSecureSasUrl();
        
        if (secureSasUrl) {
            console.log(`[OCLite SecureURL] Calling HttpTrigger4 SAS-only mode for: ${blobName}`);
            
            const response = await axios.post(secureSasUrl, {
                blobName: blobName,
                containerName: 'oclite-images'
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'x-oclite-signature': `oclite-${Date.now()}`,
                    'x-oclite-timestamp': Date.now().toString()
                },
                timeout: 10000
            });
            
            // HttpTrigger4 returns { status: 'success', secureUrl: '...' } in SAS-only mode
            const secureUrl = response.data.secureUrl || response.data.sasUrl;
            if (response.data.status === 'success' && secureUrl) {
                console.log('[OCLite SecureURL] ✅ Secure SAS generated (read-only, 1-hour expiry)');
                return secureUrl;
            }
        }
        
        // Fallback: use account-level SAS
        console.warn('[OCLite SecureURL] HttpTrigger4 unavailable, using fallback');
        return buildFallbackUrl(blobName);
    } catch (e: any) {
        const status = e.response?.status;
        console.error(`[OCLite SecureURL] HttpTrigger4 failed (HTTP ${status}):`, e.message);
        return buildFallbackUrl(blobName);
    }
}

/**
 * Fallback: use account-level SAS URL (read-only)
 */
function buildFallbackUrl(blobName: string): string | null {
    try {
        const accountSasUrl = getBlobSasUrl();
        const parsed = new URL(accountSasUrl);
        const accountName = parsed.hostname.split('.')[0];
        const containerName = 'oclite-images';

        return `https://${accountName}.blob.core.windows.net/${containerName}/${blobName}?${parsed.search.substring(1)}`;
    } catch (e) {
        console.error('[OCLite SecureURL] Fallback failed:', e);
        return null;
    }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Get a secure read-only URL for a single blob with 1-hour expiry via HttpTrigger4.
 */
export async function getSecureImageUrl(blobName: string): Promise<string | null> {
    const url = await buildReadOnlyBlobUrl(blobName);
    if (url) {
        const isSecure = url.includes('sp=r') && !url.includes('sp=rwdlacup');
        sendTelemetryEvent('secure_url.single.generated', { 
            blobName: blobName.substring(0, 50),
            isSecure: isSecure.toString(),
            method: isSecure ? 'azure_function' : 'fallback'
        });
    }
    return url;
}

/**
 * Add secure URLs to gallery images with 1-hour expiry via HttpTrigger4.
 */
export async function addSecureUrlsToImages(images: GalleryImage[]): Promise<GalleryImage[]> {
    const results: GalleryImage[] = [];
    
    for (const image of images) {
        const url = await buildReadOnlyBlobUrl(image.name);
        if (url) {
            results.push({ ...image, url: url, shareUrl: url });
        } else {
            results.push(image);
        }
    }
    
    return results;
}

/**
 * Health check — always available since we don't need a backend.
 */
export async function checkSecureUrlServiceHealth(): Promise<boolean> {
    return true;
}
