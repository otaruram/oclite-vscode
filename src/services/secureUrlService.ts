/**
 * secureUrlService.ts — Service to fetch secure SAS URLs from backend API
 * 
 * This service calls your Python backend to get secure, short-lived SAS tokens
 * instead of using the long-lived insecure SAS URL.
 */

import axios from 'axios';
import { GalleryImage } from '../types';
import { sendTelemetryEvent } from './telemetry';

// Backend API configuration - Update this to your actual backend URL
const SECURE_SAS_API_BASE = process.env.SECURE_SAS_API_URL || 'http://localhost:8000';

interface SecureUrlResponse {
    success: boolean;
    secure_url?: string;
    expires_at?: string;
    expires_in_seconds?: number;
    error?: string;
}

interface BatchSecureUrlResponse {
    success: boolean;
    results?: Array<{
        blob_name: string;
        success: boolean;
        secure_url?: string;
        expires_at?: string;
        expires_in_seconds?: number;
        error?: string;
    }>;
    total_processed?: number;
    error?: string;
}

/**
 * Get a secure SAS URL for a single blob
 */
export async function getSecureImageUrl(blobName: string): Promise<string | null> {
    try {
        console.log(`[OCLite SecureURL] Requesting secure URL for: ${blobName}`);
        
        const response = await axios.post<SecureUrlResponse>(
            `${SECURE_SAS_API_BASE}/api/secure-image-url`,
            { blob_name: blobName },
            {
                timeout: 10000,
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );
        
        if (response.data.success && response.data.secure_url) {
            console.log(`[OCLite SecureURL] Generated secure URL, expires: ${response.data.expires_at}`);
            sendTelemetryEvent('secure_url.single.success', {
                blobName: blobName.substring(0, 50), // Truncate for privacy
                expiresIn: response.data.expires_in_seconds?.toString() || '3600'
            });
            
            return response.data.secure_url;
        } else {
            console.error(`[OCLite SecureURL] Failed to get secure URL: ${response.data.error}`);
            sendTelemetryEvent('secure_url.single.error', {
                error: response.data.error || 'unknown'
            });
            return null;
        }
        
    } catch (error: any) {
        console.error(`[OCLite SecureURL] API call failed:`, error.message);
        sendTelemetryEvent('secure_url.single.api_error', {
            error: error.message
        });
        return null;
    }
}

/**
 * Get secure SAS URLs for multiple blobs (batch operation)
 */
export async function getSecureGalleryUrls(blobNames: string[]): Promise<Map<string, string>> {
    const urlMap = new Map<string, string>();
    
    if (blobNames.length === 0) {
        return urlMap;
    }
    
    try {
        console.log(`[OCLite SecureURL] Requesting secure URLs for ${blobNames.length} blobs`);
        
        const response = await axios.post<BatchSecureUrlResponse>(
            `${SECURE_SAS_API_BASE}/api/secure-gallery-urls`,
            { blob_names: blobNames },
            {
                timeout: 30000,
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );
        
        if (response.data.success && response.data.results) {
            let successCount = 0;
            let errorCount = 0;
            
            for (const result of response.data.results) {
                if (result.success && result.secure_url) {
                    urlMap.set(result.blob_name, result.secure_url);
                    successCount++;
                } else {
                    console.error(`[OCLite SecureURL] Failed to get secure URL for ${result.blob_name}: ${result.error}`);
                    errorCount++;
                }
            }
            
            console.log(`[OCLite SecureURL] Batch complete: ${successCount} success, ${errorCount} errors`);
            sendTelemetryEvent('secure_url.batch.success', {
                totalRequested: blobNames.length.toString(),
                successCount: successCount.toString(),
                errorCount: errorCount.toString()
            });
            
        } else {
            console.error(`[OCLite SecureURL] Batch request failed: ${response.data.error}`);
            sendTelemetryEvent('secure_url.batch.error', {
                error: response.data.error || 'unknown'
            });
        }
        
    } catch (error: any) {
        console.error(`[OCLite SecureURL] Batch API call failed:`, error.message);
        sendTelemetryEvent('secure_url.batch.api_error', {
            error: error.message,
            blobCount: blobNames.length.toString()
        });
    }
    
    return urlMap;
}

/**
 * Add secure URLs to gallery images using batch API
 */
export async function addSecureUrlsToImages(images: GalleryImage[]): Promise<GalleryImage[]> {
    if (images.length === 0) {
        return images;
    }
    
    // Extract blob names from images
    const blobNames = images.map(img => img.name);
    
    // Get secure URLs in batch
    const secureUrlMap = await getSecureGalleryUrls(blobNames);
    
    // Apply secure URLs to images
    const secureImages = images.map(image => {
        const secureUrl = secureUrlMap.get(image.name);
        
        if (secureUrl) {
            return {
                ...image,
                url: secureUrl,
                shareUrl: secureUrl,
                secureExpiry: new Date(Date.now() + 60 * 60 * 1000) // 1 hour from now
            };
        } else {
            // Fallback to original URL if secure generation failed
            console.warn(`[OCLite SecureURL] No secure URL available for ${image.name}, using fallback`);
            return image;
        }
    });
    
    const secureCount = secureImages.filter(img => img.secureExpiry).length;
    console.log(`[OCLite SecureURL] Applied secure URLs to ${secureCount}/${images.length} images`);
    
    return secureImages;
}

/**
 * Check if backend API is available
 */
export async function checkSecureUrlServiceHealth(): Promise<boolean> {
    try {
        const response = await axios.get(`${SECURE_SAS_API_BASE}/health`, {
            timeout: 5000
        });
        
        return response.status === 200 && response.data.status === 'healthy';
        
    } catch (error: any) {
        console.error(`[OCLite SecureURL] Health check failed:`, error.message);
        return false;
    }
}