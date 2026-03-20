/**
 * blobStorage.ts — Azure Blob Storage operations for OCLite.
 *
 * Pure blob logic: init, upload, fetch gallery, stats, settings.
 * Auth, rate limiting, and share-link helpers are in separate modules.
 */
import { BlobServiceClient, ContainerClient, BlockBlobClient } from '@azure/storage-blob';
import { AuthenticationSession } from 'vscode';
import * as vscode from 'vscode';
import { sendTelemetryEvent } from './telemetry';
import { hashUserId, getUserContainerPath } from './auth';
import { checkRateLimit, getRateLimitStatus as _getRateLimitStatus } from './rateLimit';
import { GalleryImage } from '../types';
import { getBlobSasUrl } from '../utilities/secrets';
import { addSecureUrlsToImages, checkSecureUrlServiceHealth } from './secureUrlService';

/**
 * Sanitise a string so it is safe for use as an Azure Blob metadata value.
 * Azure metadata is sent as HTTP headers, which only allow visible ASCII (0x20-0x7E).
 * We filter char-by-char to guarantee only printable ASCII passes through.
 */
function sanitizeMetadata(value: string, maxLen = 1024): string {
    let out = '';
    for (let i = 0; i < value.length && out.length < maxLen; i++) {
        const code = value.charCodeAt(i);
        out += (code >= 0x20 && code <= 0x7E) ? value[i] : '';
    }
    return out || 'unknown';
}

// Re-export types so existing consumers still work
export type { GalleryImage } from '../types';

// ── Constants ──────────────────────────────────────────────────────────────
const CONTAINER_NAME = 'oclite-gallery';
const MS_AUTH_PROVIDER_ID = 'microsoft';
const MS_AUTH_SCOPES = ['https://graph.microsoft.com/User.Read'];

// ── Service State ──────────────────────────────────────────────────────────
let _blobServiceClient: BlobServiceClient | null = null;
let _containerClient: ContainerClient | null = null;
let _currentUserSession: AuthenticationSession | null = null;

// ── Connection String ──────────────────────────────────────────────────────

function getSecureSasUrl(): string {
    // Auto-configured from encrypted embedded secret — no user input needed
    return getBlobSasUrl();
}

// ── Authentication ─────────────────────────────────────────────────────────

async function authenticateUser(): Promise<AuthenticationSession | null> {
    if (_currentUserSession) return _currentUserSession;

    try {
        const session = await vscode.authentication.getSession(MS_AUTH_PROVIDER_ID, MS_AUTH_SCOPES, { createIfNone: true });
        if (session) {
            _currentUserSession = session;
            sendTelemetryEvent('auth.microsoft.success', { userId: hashUserId(session.account.id) });
            return session;
        }
    } catch (error: any) {
        console.error('[OCLite Blob] Auth failed:', error.message);
        sendTelemetryEvent('auth.microsoft.error', { error: error.message });
        vscode.window.showWarningMessage('⚠️ Microsoft login required for cloud storage.', 'Try Again').then((s) => {
            if (s === 'Try Again') { _currentUserSession = null; authenticateUser(); }
        });
    }
    return null;
}

// ── Initialize ─────────────────────────────────────────────────────────────

export async function initializeBlobStorage(): Promise<void> {
    console.log('[OCLite Blob] Initializing...');

    const sasUrl = getSecureSasUrl();
    if (!sasUrl) { console.log('[OCLite Blob] No SAS URL — disabled.'); return; }

    const session = await authenticateUser();
    if (!session) { console.log('[OCLite Blob] No auth — local mode.'); return; }

    try {
        _blobServiceClient = new BlobServiceClient(sasUrl);
        _containerClient = _blobServiceClient.getContainerClient(CONTAINER_NAME);
        await _containerClient.createIfNotExists();

        console.log(`[OCLite Blob] Ready — container "${CONTAINER_NAME}" for ${session.account.label}`);
        sendTelemetryEvent('blob.initialized', { userId: hashUserId(session.account.id) });
    } catch (error: any) {
        console.error('[OCLite Blob] Init failed:', error.message);
        sendTelemetryEvent('blob.init.error', { error: error.message });
        vscode.window.showErrorMessage(`⚠️ Cloud storage failed: ${error.message}`);
    }
}

// ── Upload ─────────────────────────────────────────────────────────────────

export async function uploadGeneratedImage(
    imageBuffer: Buffer,
    originalPrompt: string,
    model: string = 'oclite'
): Promise<string | null> {
    if (!_containerClient || !_currentUserSession) {
        vscode.window.showInformationMessage('🔒 Sign in to save images to cloud!', 'Sign In Now', 'Skip').then((s) => {
            if (s === 'Sign In Now') vscode.commands.executeCommand('oclite.signInMicrosoft');
        });
        return null;
    }

    if (!checkRateLimit(_currentUserSession.account.id)) return null;

    try {
        // Upload directly to Azure Blob Storage only
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const slug = originalPrompt.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '-').substring(0, 30);
        const fileName = `${timestamp}_${model}_${slug}.png`;
        const userPath = getUserContainerPath(_currentUserSession);
        const blobName = `${userPath}/${fileName}`;
        const blockBlob = _containerClient.getBlockBlobClient(blobName);

        await blockBlob.uploadData(imageBuffer, {
            blobHTTPHeaders: {
                blobContentType: 'image/png',
                blobCacheControl: 'public, max-age=31536000',
            },
            metadata: {
                originalPrompt: sanitizeMetadata(originalPrompt),
                originalPromptB64: Buffer.from(originalPrompt, 'utf8').toString('base64').substring(0, 1024),
                model: sanitizeMetadata(model),
                generatedBy: 'oclite-vscode',
                timestamp: new Date().toISOString(),
                userId: sanitizeMetadata(hashUserId(_currentUserSession.account.id)),
                userEmail: sanitizeMetadata(_currentUserSession.account.label || 'anonymous'),
                shareable: 'true',
            },
        });

        // Use blob storage URL directly
        const shareUrl = blockBlob.url;

        console.log(`[OCLite Blob] Uploaded — Share: ${shareUrl}`);
        vscode.window.showInformationMessage(`✨ Uploaded! Image link ready.`, 'Copy Link').then((s) => {
            if (s === 'Copy Link') { vscode.env.clipboard.writeText(shareUrl); vscode.window.showInformationMessage('📋 Copied!'); }
        });

        sendTelemetryEvent('blob.upload.success', {
            model, fileName, promptLength: originalPrompt.length.toString(),
            userId: hashUserId(_currentUserSession.account.id),
        }, { imageSizeBytes: imageBuffer.length });

        return shareUrl;
    } catch (error: any) {
        console.error('[OCLite Blob] Upload failed:', error.message);
        sendTelemetryEvent('blob.upload.error', { error: error.message });
        vscode.window.showErrorMessage(`⚠️ Upload failed: ${error.message}`);
        return null;
    }
}

// ── Gallery ────────────────────────────────────────────────────────────────

export async function fetchImageGallery(maxResults: number = 50): Promise<GalleryImage[]> {
    if (!_containerClient || !_currentUserSession) {
        vscode.window.showInformationMessage('🔒 Sign in to access your gallery.', 'Sign In').then((s) => {
            if (s === 'Sign In') authenticateUser();
        });
        return [];
    }

    if (!checkRateLimit(_currentUserSession.account.id)) return [];

    try {
        const images: GalleryImage[] = [];
        const userPath = getUserContainerPath(_currentUserSession);
        const iter = _containerClient.listBlobsFlat({ includeMetadata: true, prefix: userPath + '/' });
        const uid = hashUserId(_currentUserSession.account.id);

        let count = 0;
        for await (const blob of iter) {
            if (count >= maxResults) break;
            if (blob.metadata?.userId !== uid) continue;

            // getBlobClient().url returns bare URL without SAS.
            // Use the account SAS URL to build a proper authenticated URL instead.
            const sasUrl = getSecureSasUrl();
            let blobUrl: string;
            try {
                const parsed = new URL(sasUrl);
                const accountName = parsed.hostname.split('.')[0];
                // Use the original SAS query string as-is — don't modify params to avoid signature issues
                blobUrl = `https://${accountName}.blob.core.windows.net/${CONTAINER_NAME}/${blob.name}?${parsed.search.substring(1)}`;
            } catch {
                // Fallback: use raw URL (may not load in webview but won't crash)
                blobUrl = _containerClient!.getBlobClient(blob.name).url;
            }

            images.push({
                name: blob.name,
                url: blobUrl,
                shareUrl: blobUrl,
                shareId: blob.name,
                lastModified: blob.properties.lastModified || new Date(),
                sizeBytes: blob.properties.contentLength || 0,
                originalPrompt: (blob.metadata?.originalPromptB64
                    ? Buffer.from(blob.metadata.originalPromptB64, 'base64').toString('utf8')
                    : blob.metadata?.originalPrompt) || 'Unknown prompt',
                model: blob.metadata?.model || 'unknown',
                userId: blob.metadata?.userId || 'unknown',
            });
            count++;
        }

        images.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
        
        // Try to add secure SAS URLs via backend API
        try {
            const isServiceHealthy = await checkSecureUrlServiceHealth();
            
            if (isServiceHealthy) {
                console.log('[OCLite Blob] Using secure URL service for gallery images');
                const secureImages = await addSecureUrlsToImages(images);
                
                sendTelemetryEvent('blob.gallery.fetched', { 
                    imageCount: secureImages.length.toString(), 
                    userId: uid,
                    secureUrlsGenerated: 'true',
                    secureUrlService: 'backend_api'
                });
                
                return secureImages;
            } else {
                console.warn('[OCLite Blob] Secure URL service unavailable, using fallback URLs');
                sendTelemetryEvent('blob.gallery.fetched', { 
                    imageCount: images.length.toString(), 
                    userId: uid,
                    secureUrlsGenerated: 'false',
                    fallbackReason: 'service_unavailable'
                });
            }
        } catch (error: any) {
            console.error('[OCLite Blob] Secure URL service error:', error.message);
            sendTelemetryEvent('blob.gallery.secure_url_error', {
                error: error.message,
                imageCount: images.length.toString()
            });
        }
        
        // Fallback to original URLs if secure service fails
        sendTelemetryEvent('blob.gallery.fetched', { 
            imageCount: images.length.toString(), 
            userId: uid,
            secureUrlsGenerated: 'false',
            fallbackReason: 'service_error'
        });
        
        return images;
    } catch (error: any) {
        console.error('[OCLite Blob] Gallery failed:', error.message);
        sendTelemetryEvent('blob.gallery.error', { error: error.message });
        vscode.window.showErrorMessage(`⚠️ Failed to load gallery: ${error.message}`);
        return [];
    }
}

// ── Delete ─────────────────────────────────────────────────────────────────

export async function deleteGalleryImage(blobName: string): Promise<boolean> {
    if (!_containerClient) {
        vscode.window.showWarningMessage('Blob storage not available.');
        return false;
    }
    try {
        await _containerClient.deleteBlob(blobName);
        console.log(`[OCLite Blob] Deleted blob: ${blobName}`);
        sendTelemetryEvent('blob.delete.success', { blobName });
        return true;
    } catch (error: any) {
        console.error(`[OCLite Blob] Delete failed for ${blobName}:`, error.message);
        sendTelemetryEvent('blob.delete.error', { blobName, error: error.message });
        return false;
    }
}

// ── Copy Image Link ────────────────────────────────────────────────────────

export async function copyImageLink(imageUrl: string, prompt: string): Promise<void> {
    try {
        await vscode.env.clipboard.writeText(imageUrl);
        vscode.window.showInformationMessage(
            `📋 Image link copied! "${prompt.substring(0, 30)}${prompt.length > 30 ? '...' : ''}"`
        );
        sendTelemetryEvent('blob.link.copied', { linkType: 'imagekit' });
    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to copy link: ${error.message}`);
    }
}

// ── Stats ──────────────────────────────────────────────────────────────────

export async function getSharingStats(): Promise<{ totalImages: number; totalSize: number; oldestImage: Date | null }> {
    if (!_containerClient || !_currentUserSession) return { totalImages: 0, totalSize: 0, oldestImage: null };

    try {
        const userPath = getUserContainerPath(_currentUserSession);
        const iter = _containerClient.listBlobsFlat({ prefix: userPath + '/' });
        let totalImages = 0, totalSize = 0;
        let oldestImage: Date | null = null;

        for await (const blob of iter) {
            totalImages++;
            totalSize += blob.properties.contentLength || 0;
            if (!oldestImage || (blob.properties.lastModified && blob.properties.lastModified < oldestImage)) {
                oldestImage = blob.properties.lastModified || null;
            }
        }
        return { totalImages, totalSize, oldestImage };
    } catch {
        return { totalImages: 0, totalSize: 0, oldestImage: null };
    }
}

// ── User / Session ─────────────────────────────────────────────────────────

export function getCurrentUser(): { label: string; id: string; hashedId: string } | null {
    if (!_currentUserSession) return null;
    return {
        label: _currentUserSession.account.label,
        id: _currentUserSession.account.id,
        hashedId: hashUserId(_currentUserSession.account.id),
    };
}

export async function signOutUser(): Promise<void> {
    if (!_currentUserSession) return;
    try {
        await vscode.authentication.getSession(MS_AUTH_PROVIDER_ID, MS_AUTH_SCOPES, { clearSessionPreference: true });
        sendTelemetryEvent('auth.signout', { userId: hashUserId(_currentUserSession.account.id) });
        _currentUserSession = null;
        vscode.window.showInformationMessage('👋 Signed out. Local mode activated.');
    } catch (error: any) {
        vscode.window.showErrorMessage(`⚠️ Sign out failed: ${error.message}`);
    }
}

export function getRateLimitStatus(): { remaining: number; resetTime: number } | null {
    if (!_currentUserSession) return null;
    return _getRateLimitStatus(_currentUserSession.account.id);
}

export async function clearStorageSettings(): Promise<void> {
    _blobServiceClient = null;
    _containerClient = null;
    _currentUserSession = null;
    vscode.window.showInformationMessage('🛡️ Storage session cleared. Sign in again to use cloud features.');
    sendTelemetryEvent('storage.settings.cleared');
}

export function isBlobStorageAvailable(): boolean {
    return _containerClient !== null && _currentUserSession !== null;
}