/**
 * types/index.ts — Shared type definitions for OCLite.
 */

/** Image metadata from Azure Blob Gallery */
export interface GalleryImage {
    name: string;
    url: string;
    shareUrl: string;
    shareId: string;
    lastModified: Date;
    sizeBytes: number;
    originalPrompt: string;
    model: string;
    userId?: string;
    secureExpiry?: Date; // When the secure SAS token expires
    imagekitUrl?: string; // Permanent ImageKit CDN URL
    fileId?: string; // ImageKit file ID for deletion
    sasUrl?: string; // Temporary SAS URL (1 hour)
}

/** Rate limit info for a user */
export interface RateLimitInfo {
    remaining: number;
    resetTime: number;
}

/** Authenticated user info (with hashed ID for privacy) */
export interface UserInfo {
    label: string;
    id: string;
    hashedId: string;
}

/** Result from chat participant */
export interface ChatResult {
    metadata: {
        command: string;
    };
}
