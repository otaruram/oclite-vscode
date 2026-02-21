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
import { generateShareId, createShareUrl, copyShareUrl, SHARE_BASE_URL } from './sharing';
import { GalleryImage } from '../types';
import { getBlobConnectionString } from '../utilities/secrets';

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

function getSecureConnectionString(): string {
    // Auto-configured from encrypted embedded secret — no user input needed
    return getBlobConnectionString();
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

    const cs = getSecureConnectionString();
    if (!cs) { console.log('[OCLite Blob] No connection string — disabled.'); return; }

    const session = await authenticateUser();
    if (!session) { console.log('[OCLite Blob] No auth — local mode.'); return; }

    try {
        _blobServiceClient = BlobServiceClient.fromConnectionString(cs);
        _containerClient = _blobServiceClient.getContainerClient(CONTAINER_NAME);
        await _containerClient.createIfNotExists({ access: 'blob' });

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
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const slug = originalPrompt.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '-').substring(0, 30);
        const userPath = getUserContainerPath(_currentUserSession);
        const fileName = `${timestamp}_${model}_${slug}.png`;
        const blobName = `${userPath}/${fileName}`;
        const blockBlob: BlockBlobClient = _containerClient.getBlockBlobClient(blobName);

        const shareId = generateShareId(blobName, timestamp);
        const shareUrl = createShareUrl(shareId);

        await blockBlob.uploadData(imageBuffer, {
            blobHTTPHeaders: {
                blobContentType: 'image/png',
                blobCacheControl: 'public, max-age=31536000',
            },
            metadata: {
                originalPrompt,
                model,
                generatedBy: 'oclite-vscode',
                timestamp: new Date().toISOString(),
                userId: hashUserId(_currentUserSession.account.id),
                userEmail: _currentUserSession.account.label || 'anonymous',
                shareable: 'true',
                shareId,
                shareUrl,
            },
        });

        console.log(`[OCLite Blob] Uploaded — Share: ${shareUrl}`);
        vscode.window.showInformationMessage(`✨ Uploaded! Share: ${shareUrl}`, 'Copy Link', 'Gallery').then((s) => {
            if (s === 'Copy Link') { vscode.env.clipboard.writeText(shareUrl); vscode.window.showInformationMessage('📋 Copied!'); }
            else if (s === 'Gallery') vscode.commands.executeCommand('oclite.viewGallery');
        });

        sendTelemetryEvent('blob.upload.success', {
            model, fileName, promptLength: originalPrompt.length.toString(),
            userId: hashUserId(_currentUserSession.account.id), shareId,
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

            const url = _containerClient.getBlobClient(blob.name).url;
            const sid = blob.metadata?.shareId || generateShareId(blob.name, blob.properties.lastModified?.toISOString() || '');
            const surl = blob.metadata?.shareUrl || `${SHARE_BASE_URL}/${sid}`;

            images.push({
                name: blob.name,
                url,
                shareUrl: surl,
                shareId: sid,
                lastModified: blob.properties.lastModified || new Date(),
                sizeBytes: blob.properties.contentLength || 0,
                originalPrompt: blob.metadata?.originalPrompt || 'Unknown prompt',
                model: blob.metadata?.model || 'unknown',
                userId: blob.metadata?.userId || 'unknown',
            });
            count++;
        }

        images.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
        sendTelemetryEvent('blob.gallery.fetched', { imageCount: images.length.toString(), userId: uid });
        return images;
    } catch (error: any) {
        console.error('[OCLite Blob] Gallery failed:', error.message);
        sendTelemetryEvent('blob.gallery.error', { error: error.message });
        vscode.window.showErrorMessage(`⚠️ Failed to load gallery: ${error.message}`);
        return [];
    }
}

// ── Copy Image Link ────────────────────────────────────────────────────────

export async function copyImageLink(shareUrl: string, prompt: string): Promise<void> {
    return copyShareUrl(shareUrl, prompt);
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