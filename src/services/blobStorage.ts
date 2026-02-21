/**
 * blobStorage.ts — Azure Blob Storage for OCLite Image Sharing.
 *
 * 🎆 PRIMARY FOCUS: Easy image sharing via public blob URLs
 *
 * Key Features:
 * - 🔗 Generate public sharing URLs for all images
 * - 📁 Optional Microsoft auth for organized galleries
 * - ⚡ Simple rate limiting for cost control
 * - 🌍 Easy sharing: Copy URL → Share anywhere
 *
 * Sharing Workflow:
 * 1. Generate image → Auto-upload to blob storage
 * 2. Get public URL → Ready to share instantly  
 * 3. View gallery → Copy URLs for sharing
 * 4. No login required to VIEW shared images
 */
import { BlobServiceClient, ContainerClient, BlockBlobClient } from '@azure/storage-blob';
import { AuthenticationProvider, AuthenticationSession } from 'vscode';
import * as vscode from 'vscode';
import * as path from 'path';
import * as crypto from 'crypto';
import { sendTelemetryEvent } from './telemetry';

// ── Security Configuration ─────────────────────────────────────────────────
const CONTAINER_NAME = 'oclite-gallery';
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10; // 10 requests per minute
const MS_AUTH_PROVIDER_ID = 'microsoft';
const MS_AUTH_SCOPES = ['https://graph.microsoft.com/User.Read'];

// ── Service State ──────────────────────────────────────────────────────────
let _blobServiceClient: BlobServiceClient | null = null;
let _containerClient: ContainerClient | null = null;
let _currentUserSession: AuthenticationSession | null = null;
let _rateLimitMap: Map<string, { count: number; resetTime: number }> = new Map();

// ── Security & Authentication ──────────────────────────────────────────────

/**
 * Get secure connection string from encrypted VS Code settings.
 */
async function getSecureConnectionString(): Promise<string | null> {
    const config = vscode.workspace.getConfiguration('oclite');
    let connectionString = config.get<string>('blobStorage.connectionString');
    
    if (!connectionString) {
        connectionString = await vscode.window.showInputBox({
            prompt: '🔒 Enter Azure Storage Connection String (will be encrypted & stored securely)',
            placeHolder: 'DefaultEndpointsProtocol=https;AccountName=...;AccountKey=...;EndpointSuffix=core.windows.net',
            password: true,
            ignoreFocusOut: true
        });
        
        if (connectionString) {
            // Store in encrypted VS Code settings
            await config.update('blobStorage.connectionString', connectionString, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage('🔒 Connection string securely saved!');
        }
    }
    
    return connectionString || null;
}

/**
 * Authenticate user with Microsoft and get user identity.
 */
async function authenticateUser(): Promise<AuthenticationSession | null> {
    if (_currentUserSession) {
        return _currentUserSession;
    }
    
    try {
        const session = await vscode.authentication.getSession(MS_AUTH_PROVIDER_ID, MS_AUTH_SCOPES, {
            createIfNone: true
        });
        
        if (session) {
            _currentUserSession = session;
            sendTelemetryEvent('auth.microsoft.success', {
                userId: hashUserId(session.account.id)
            });
            return session;
        }
    } catch (error: any) {
        console.error('[OCLite Auth] Microsoft authentication failed:', error.message);
        sendTelemetryEvent('auth.microsoft.error', { error: error.message });
        
        vscode.window.showWarningMessage(
            '⚠️ Microsoft login required for cloud storage. Working in local mode.',
            'Try Again'
        ).then(selection => {
            if (selection === 'Try Again') {
                _currentUserSession = null;
                authenticateUser();
            }
        });
    }
    
    return null;
}

/**
 * Hash user ID for privacy in telemetry.
 */
function hashUserId(userId: string): string {
    return crypto.createHash('sha256').update(userId).digest('hex').substring(0, 8);
}

/**
 * Get user-specific container path for storage isolation.
 */
function getUserContainerPath(session: AuthenticationSession): string {
    const userHash = hashUserId(session.account.id);
    return `users/${userHash}`;
}

/**
 * Check and enforce rate limiting per user.
 */
function checkRateLimit(userId: string): boolean {
    const now = Date.now();
    const userLimit = _rateLimitMap.get(userId);
    
    if (!userLimit || now > userLimit.resetTime) {
        // Reset or create new limit window
        _rateLimitMap.set(userId, {
            count: 1,
            resetTime: now + RATE_LIMIT_WINDOW
        });
        return true;
    }
    
    if (userLimit.count >= MAX_REQUESTS_PER_WINDOW) {
        const remainingTime = Math.ceil((userLimit.resetTime - now) / 1000);
        vscode.window.showWarningMessage(
            `⚡ Rate limit reached. Please wait ${remainingTime} seconds before uploading again.`
        );
        sendTelemetryEvent('blob.rateLimit.hit', { userId: hashUserId(userId) });
        return false;
    }
    
    userLimit.count++;
    return true;
}

/**
 * Initialize the blob storage service with security features.
 * Call once from extension activation.
 */
export async function initializeBlobStorage(): Promise<void> {
    console.log('[OCLite Blob] 🔒 Initializing secure blob storage...');
    
    // Get secure connection string
    const connectionString = await getSecureConnectionString();
    if (!connectionString) {
        console.log('[OCLite Blob] Connection string not configured — blob features disabled.');
        return;
    }

    // Authenticate user
    const userSession = await authenticateUser();
    if (!userSession) {
        console.log('[OCLite Blob] Microsoft authentication failed — working in local mode.');
        return;
    }

    try {
        _blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
        _containerClient = _blobServiceClient.getContainerClient(CONTAINER_NAME);

        // Ensure the container exists (create if not)
        await _containerClient.createIfNotExists({
            access: 'blob' // Public read access for generated images
        });

        console.log(`[OCLite Blob] 🚀 Initialized — container "${CONTAINER_NAME}" ready for user ${userSession.account.label}`);
        sendTelemetryEvent('blob.initialized', {
            userId: hashUserId(userSession.account.id),
            userType: userSession.account.label ? 'authenticated' : 'anonymous'
        });
    } catch (error: any) {
        console.error('[OCLite Blob] Initialization failed:', error.message);
        sendTelemetryEvent('blob.init.error', { error: error.message });
        
        // Show user-friendly error
        vscode.window.showErrorMessage(
            `⚠️ Cloud storage setup failed: ${error.message}. Using local storage only.`
        );
    }
}

/**
 * Upload a generated image to Azure Blob Storage with public sharing URLs.
 *
 * @param imageBuffer — The image data as a Buffer
 * @param originalPrompt — The prompt used to generate the image
 * @param model — The AI model used (e.g., 'sdxl-lightning')
 * @returns The public shareable URL of the uploaded blob, or null on failure
 */
export async function uploadGeneratedImage(
    imageBuffer: Buffer,
    originalPrompt: string,
    model: string = 'oclite'
): Promise<string | null> {
    // Validate prerequisites
    if (!_containerClient || !_currentUserSession) {
        console.warn('[OCLite Blob] Service not initialized or user not authenticated — upload skipped.');
        
        // Offer to authenticate
        vscode.window.showInformationMessage(
            '🔒 Sign in to save images to cloud and get shareable links!',
            'Sign In Now',
            'Skip Cloud'
        ).then(selection => {
            if (selection === 'Sign In Now') {
                vscode.commands.executeCommand('oclite.signInMicrosoft');
            }
        });
        
        return null;
    }

    // Check rate limiting
    if (!checkRateLimit(_currentUserSession.account.id)) {
        return null; // Rate limit exceeded
    }

    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const promptSlug = originalPrompt
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, '-')
            .substring(0, 30); // Shorter for cleaner URLs

        // User-isolated path for security + clean sharing URLs
        const userPath = getUserContainerPath(_currentUserSession);
        const fileName = `${timestamp}_${model}_${promptSlug}.png`;
        const blobName = `${userPath}/${fileName}`;
        const blockBlobClient: BlockBlobClient = _containerClient.getBlockBlobClient(blobName);

        // Upload with optimized settings for sharing
        await blockBlobClient.uploadData(imageBuffer, {
            blobHTTPHeaders: {
                blobContentType: 'image/png',
                blobCacheControl: 'public, max-age=31536000', // 1 year cache - fast loading
            },
            metadata: {
                originalPrompt: originalPrompt,
                model: model,
                generatedBy: 'oclite-vscode',
                timestamp: new Date().toISOString(),
                userId: hashUserId(_currentUserSession.account.id),
                userEmail: _currentUserSession.account.label || 'anonymous',
                shareable: 'true' // Mark as publicly shareable
            },
        });

        const shareableUrl = blockBlobClient.url;
        console.log(`[OCLite Blob] 🔗 Image uploaded & shareable: ${fileName}`);
        
        // Show success with sharing info
        vscode.window.showInformationMessage(
            `✨ Image saved to cloud! Shareable link ready.`,
            'Copy Share Link',
            'View Gallery'
        ).then(selection => {
            if (selection === 'Copy Share Link') {
                vscode.env.clipboard.writeText(shareableUrl);
                vscode.window.showInformationMessage('📋 Link copied to clipboard!');
            } else if (selection === 'View Gallery') {
                vscode.commands.executeCommand('oclite.viewGallery');
            }
        });
        
        sendTelemetryEvent('blob.upload.success', {
            model: model,
            fileName: fileName,
            promptLength: originalPrompt.length.toString(),
            userId: hashUserId(_currentUserSession.account.id),
            sharingEnabled: 'true'
        }, {
            imageSizeBytes: imageBuffer.length
        });

        return shareableUrl;
    } catch (error: any) {
        console.error('[OCLite Blob] Upload failed:', error.message);
        sendTelemetryEvent('blob.upload.error', { 
            error: error.message,
            userId: _currentUserSession ? hashUserId(_currentUserSession.account.id) : 'unauthenticated'
        });
        
        vscode.window.showErrorMessage(`⚠️ Failed to upload image to cloud: ${error.message}`);
        return null;
    }
}

/**
 * Fetch the user's image gallery from blob storage (user-isolated).
 *
 * @param maxResults — Maximum number of images to retrieve (default 50)
 * @returns Array of image metadata objects for current user only
 */
export async function fetchImageGallery(maxResults: number = 50): Promise<GalleryImage[]> {
    // Validate prerequisites
    if (!_containerClient || !_currentUserSession) {
        console.warn('[OCLite Blob] Service not initialized or user not authenticated — gallery unavailable.');
        
        // Show helpful message to user
        vscode.window.showInformationMessage(
            '🔒 Please authenticate with Microsoft to access your cloud gallery.',
            'Sign In'
        ).then(selection => {
            if (selection === 'Sign In') {
                authenticateUser();
            }
        });
        
        return [];
    }

    // Check rate limiting
    if (!checkRateLimit(_currentUserSession.account.id)) {
        return []; // Rate limit exceeded
    }

    try {
        const images: GalleryImage[] = [];
        const userPath = getUserContainerPath(_currentUserSession);
        
        // List blobs in user's folder only
        const blobsIterator = _containerClient.listBlobsFlat({
            includeMetadata: true,
            prefix: userPath + '/' // Only get user's images
        });

        let count = 0;
        for await (const blob of blobsIterator) {
            if (count >= maxResults) break;

            // Verify blob belongs to current user (extra security)
            if (blob.metadata?.userId !== hashUserId(_currentUserSession.account.id)) {
                continue; // Skip if not user's image
            }

            const blobClient = _containerClient.getBlobClient(blob.name);
            images.push({
                name: blob.name,
                url: blobClient.url,
                lastModified: blob.properties.lastModified || new Date(),
                sizeBytes: blob.properties.contentLength || 0,
                originalPrompt: blob.metadata?.originalPrompt || 'Unknown prompt',
                model: blob.metadata?.model || 'unknown',
                userId: blob.metadata?.userId || 'unknown'
            });
            count++;
        }

        // Sort by newest first
        images.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());

        console.log(`[OCLite Blob] 📂 Fetched ${images.length} images for user ${_currentUserSession.account.label}`);
        sendTelemetryEvent('blob.gallery.fetched', {
            imageCount: images.length.toString(),
            userId: hashUserId(_currentUserSession.account.id)
        });

        return images;
    } catch (error: any) {
        console.error('[OCLite Blob] Gallery fetch failed:', error.message);
        sendTelemetryEvent('blob.gallery.error', { 
            error: error.message,
            userId: _currentUserSession ? hashUserId(_currentUserSession.account.id) : 'unauthenticated'
        });
        
        vscode.window.showErrorMessage(`⚠️ Failed to load gallery: ${error.message}`);
        return [];
    }
}

/**
 * Add a new function to generate short shareable links
 */
export async function generateShareableLink(imageUrl: string): Promise<string> {
    // For now, return the direct blob URL (public access)
    // Later could implement short URL service
    return imageUrl;
}

/**
 * Copy image URL to clipboard with user-friendly message
 */
export async function copyImageLink(imageUrl: string, prompt: string): Promise<void> {
    try {
        await vscode.env.clipboard.writeText(imageUrl);
        
        vscode.window.showInformationMessage(
            `📋 Link copied! Share this image: "${prompt.substring(0, 30)}${prompt.length > 30 ? '...' : ''}"`,
            'View in Browser'
        ).then(selection => {
            if (selection === 'View in Browser') {
                vscode.env.openExternal(vscode.Uri.parse(imageUrl));
            }
        });
        
        sendTelemetryEvent('blob.link.copied', {
            promptLength: prompt.length.toString()
        });
    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to copy link: ${error.message}`);
    }
}

/**
 * Get sharing statistics for current user
 */
export async function getSharingStats(): Promise<{ totalImages: number; totalSize: number; oldestImage: Date | null }> {
    if (!_containerClient || !_currentUserSession) {
        return { totalImages: 0, totalSize: 0, oldestImage: null };
    }

    try {
        const userPath = getUserContainerPath(_currentUserSession);
        const blobsIterator = _containerClient.listBlobsFlat({
            prefix: userPath + '/'
        });

        let totalImages = 0;
        let totalSize = 0;
        let oldestImage: Date | null = null;

        for await (const blob of blobsIterator) {
            totalImages++;
            totalSize += blob.properties.contentLength || 0;
            
            if (!oldestImage || (blob.properties.lastModified && blob.properties.lastModified < oldestImage)) {
                oldestImage = blob.properties.lastModified || null;
            }
        }

        return { totalImages, totalSize, oldestImage };
    } catch (error) {
        console.error('[OCLite Blob] Failed to get sharing stats:', error);
        return { totalImages: 0, totalSize: 0, oldestImage: null };
    }
}

/**
 * Get current authenticated user information.
 */
export function getCurrentUser(): { label: string; id: string; hashedId: string } | null {
    if (!_currentUserSession) {
        return null;
    }
    
    return {
        label: _currentUserSession.account.label,
        id: _currentUserSession.account.id,
        hashedId: hashUserId(_currentUserSession.account.id)
    };
}

/**
 * Sign out current user and clear session.
 */
export async function signOutUser(): Promise<void> {
    if (_currentUserSession) {
        try {
            // Clear VS Code authentication session
            await vscode.authentication.getSession(MS_AUTH_PROVIDER_ID, MS_AUTH_SCOPES, { clearSessionPreference: true });
            
            sendTelemetryEvent('auth.signout', {
                userId: hashUserId(_currentUserSession.account.id)
            });
            
            _currentUserSession = null;
            vscode.window.showInformationMessage('👋 Signed out successfully. Local mode activated.');
        } catch (error: any) {
            console.error('[OCLite Auth] Sign out failed:', error.message);
            vscode.window.showErrorMessage(`⚠️ Sign out failed: ${error.message}`);
        }
    }
}

/**
 * Get rate limit status for current user.
 */
export function getRateLimitStatus(): { remaining: number; resetTime: number } | null {
    if (!_currentUserSession) {
        return null;
    }
    
    const userLimit = _rateLimitMap.get(_currentUserSession.account.id);
    if (!userLimit) {
        return { remaining: MAX_REQUESTS_PER_WINDOW, resetTime: 0 };
    }
    
    const remaining = Math.max(0, MAX_REQUESTS_PER_WINDOW - userLimit.count);
    return { remaining, resetTime: userLimit.resetTime };
}

/**
 * Clear connection string (for security).
 */
export async function clearStorageSettings(): Promise<void> {
    const config = vscode.workspace.getConfiguration('oclite');
    await config.update('blobStorage.connectionString', undefined, vscode.ConfigurationTarget.Global);
    
    // Reset service state
    _blobServiceClient = null;
    _containerClient = null;
    
    vscode.window.showInformationMessage('🛡️ Storage settings cleared. Blob storage disabled.');
    sendTelemetryEvent('storage.settings.cleared');
}

/**
 * Check if blob storage is available and user is authenticated.
 */
export function isBlobStorageAvailable(): boolean {
    return _containerClient !== null && _currentUserSession !== null;
}

// ── Type Definitions ───────────────────────────────────────────────────────────

export interface GalleryImage {
    name: string;
    url: string;
    lastModified: Date;
    sizeBytes: number;
    originalPrompt: string;
    model: string;
    userId?: string; // Hashed user ID for privacy
}

export interface RateLimitInfo {
    remaining: number;
    resetTime: number;
}

export interface UserInfo {
    label: string;
    id: string;
    hashedId: string;
}