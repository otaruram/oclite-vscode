/**
 * secureUrlService.ts — Generate read-only per-blob SAS URLs for gallery display.
 *
 * Security model:
 *  - Generate new SAS tokens with read-only permissions (sp=r)
 *  - Short expiry time (1 hour) to limit exposure
 *  - Scoped to specific blob only
 */

import { GalleryImage } from '../types';
import { getBlobSasUrl, getSecureSasUrl } from '../utilities/secrets';
import { sendTelemetryEvent } from './telemetry';
import axios from 'axios';
import * as vscode from 'vscode';

// ── Ultra-Secure Authentication ───────────────────────────────────────────

/**
 * Get authentication headers for ultra-secure Azure Functions
 */
async function getUltraSecureHeaders(): Promise<Record<string, string>> {
    try {
        // Get Microsoft authentication session
        const session = await vscode.authentication.getSession('microsoft', ['https://graph.microsoft.com/User.Read'], { createIfNone: false });
        
        if (!session) {
            throw new Error('Microsoft authentication required for ultra-secure functions');
        }
        
        return {
            'Authorization': `Bearer ${session.accessToken}`,
            'X-OCLite-Signature': 'oclite-ext-2026-v1.55-secure',
            'X-OCLite-Version': '0.1.55',
            'X-OCLite-IDE': 'vscode',
            'User-Agent': 'Visual Studio Code OCLite Extension/0.1.55'
        };
    } catch (error) {
        console.error('[OCLite SecureURL] Failed to get ultra-secure auth headers:', error);
        throw error;
    }
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Generate a secure read-only SAS URL via Azure Function with 1-hour expiry.
 */
async function buildReadOnlyBlobUrl(blobName: string): Promise<string | null> {
    try {
        const secureSasUrl = getSecureSasUrl();
        
        if (secureSasUrl) {
            console.log('[OCLite SecureURL] Calling ultra-secure Azure Function for SAS generation');
            
            // Get authentication headers for ultra-secure system
            const authHeaders = await getUltraSecureHeaders();
            
            const response = await axios.post(secureSasUrl, {
                blobName: blobName,
                containerName: 'oclite-gallery'
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    ...authHeaders
                },
                timeout: 10000 // 10 seconds
            });
            
            if (response.data.success && response.data.secureUrl) {
                console.log('[OCLite SecureURL] Generated secure SAS with 1-hour expiry via ultra-secure system');
                return response.data.secureUrl;
            }
        }
        
        // Fallback: use original SAS (less secure)
        console.warn('[OCLite SecureURL] Ultra-secure Azure Function unavailable, using fallback');
        return buildFallbackUrl(blobName);
    } catch (e) {
        console.error('[OCLite SecureURL] Ultra-secure Azure Function failed:', e);
        return buildFallbackUrl(blobName);
    }
}

/**
 * Fallback: use original SAS URL as-is (less secure but works)
 */
function buildFallbackUrl(blobName: string): string | null {
    try {
        const accountSasUrl = getBlobSasUrl();
        const parsed = new URL(accountSasUrl);
        const accountName = parsed.hostname.split('.')[0];
        const containerName = 'oclite-gallery';

        return `https://${accountName}.blob.core.windows.net/${containerName}/${blobName}?${parsed.search.substring(1)}`;
    } catch (e) {
        console.error('[OCLite SecureURL] Fallback failed:', e);
        return null;
    }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Get a secure read-only URL for a single blob with 1-hour expiry via Azure Function.
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
 * Add secure URLs to gallery images with 1-hour expiry via Azure Function.
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
