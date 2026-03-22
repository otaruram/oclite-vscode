/**
 * secureBlobAccess.ts — Secure SAS token generation for OCLite images
 * 
 * This service generates short-lived, read-only SAS tokens for secure image access.
 * Replaces the insecure long-lived SAS URLs with proper security.
 */

import { generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential } from '@azure/storage-blob';
import { GalleryImage } from '../types';
import { getStorageAccountName, getStorageAccountKey } from '../utilities/secrets';

// Cache for SAS tokens to avoid regenerating for the same blob within the hour
const sasTokenCache = new Map<string, { token: string; expires: Date }>();

/**
 * Generate a secure, read-only SAS token for a blob with 1-hour expiry
 */
export function generateSecureSasToken(containerName: string, blobName: string): string {
    const cacheKey = `${containerName}/${blobName}`;
    const now = new Date();
    
    // Check if we have a valid cached token
    const cached = sasTokenCache.get(cacheKey);
    if (cached && cached.expires > now) {
        console.log(`[OCLite SecureSAS] Using cached token for ${blobName}`);
        return cached.token;
    }
    
    try {
        const accountName = getStorageAccountName();
        const accountKey = getStorageAccountKey();
        
        if (!accountName || !accountKey) {
            throw new Error('Storage account credentials not available');
        }
        
        const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
        
        // Set expiry to 1 hour from now
        const expiresOn = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour
        const startsOn = new Date(now.getTime() - 5 * 60 * 1000);   // 5 minutes ago (clock skew protection)
        
        // Generate read-only SAS token
        const sasToken = generateBlobSASQueryParameters({
            containerName,
            blobName,
            permissions: BlobSASPermissions.parse('r'), // Read-only permission
            startsOn,
            expiresOn,
        }, sharedKeyCredential).toString();
        
        // Cache the token
        sasTokenCache.set(cacheKey, { token: sasToken, expires: expiresOn });
        
        // Clean up expired tokens from cache
        cleanupExpiredTokens();
        
        console.log(`[OCLite SecureSAS] Generated secure token for ${blobName}, expires: ${expiresOn.toISOString()}`);
        return sasToken;
        
    } catch (error: any) {
        console.error(`[OCLite SecureSAS] Failed to generate SAS token for ${blobName}:`, error.message);
        throw new Error(`Failed to generate secure access token: ${error.message}`);
    }
}

/**
 * Generate a complete secure URL for a blob
 */
export function generateSecureBlobUrl(containerName: string, blobName: string): string {
    const accountName = getStorageAccountName();
    const sasToken = generateSecureSasToken(containerName, blobName);
    
    return `https://${accountName}.blob.core.windows.net/${containerName}/${blobName}?${sasToken}`;
}

/**
 * Add secure URLs to gallery images
 */
export function addSecureUrlsToGalleryImages(images: GalleryImage[], containerName: string = 'oclite-images'): GalleryImage[] {
    return images.map(image => {
        try {
            // Extract blob name from the image name or URL
            const blobName = image.name;
            const secureUrl = generateSecureBlobUrl(containerName, blobName);
            
            return {
                ...image,
                url: secureUrl,        // Secure URL for display
                shareUrl: secureUrl,   // Secure URL for sharing
                secureExpiry: new Date(Date.now() + 60 * 60 * 1000) // 1 hour from now
            };
        } catch (error: any) {
            console.error(`[OCLite SecureSAS] Failed to generate secure URL for ${image.name}:`, error.message);
            // Fallback to original URL if secure generation fails
            return image;
        }
    });
}

/**
 * Clean up expired tokens from cache
 */
function cleanupExpiredTokens(): void {
    const now = new Date();
    for (const [key, value] of sasTokenCache.entries()) {
        if (value.expires <= now) {
            sasTokenCache.delete(key);
        }
    }
}

/**
 * Clear all cached tokens (useful for testing or manual cleanup)
 */
export function clearSasTokenCache(): void {
    sasTokenCache.clear();
    console.log('[OCLite SecureSAS] Token cache cleared');
}

/**
 * Get cache statistics for monitoring
 */
export function getSasTokenCacheStats(): { totalTokens: number; expiredTokens: number } {
    const now = new Date();
    let expiredTokens = 0;
    
    for (const [, value] of sasTokenCache.entries()) {
        if (value.expires <= now) {
            expiredTokens++;
        }
    }
    
    return {
        totalTokens: sasTokenCache.size,
        expiredTokens
    };
}