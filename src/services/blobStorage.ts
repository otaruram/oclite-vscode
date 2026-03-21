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
    console.log('[OCLite Blob] Blob storage disabled - using HttpTrigger4 for all uploads');
    // Blob storage is now disabled for security reasons
    // All uploads go through HttpTrigger4 which generates secure read-only SAS URLs
    return;
}

// ── Upload ─────────────────────────────────────────────────────────────────

export async function uploadGeneratedImage(
    imageBuffer: Buffer,
    originalPrompt: string,
    model: string = 'oclite'
): Promise<string | null> {
    // Blob storage upload is disabled for security reasons
    // All uploads now go through HttpTrigger4 which generates secure read-only SAS URLs
    console.log('[OCLite Blob] Direct upload disabled - use HttpTrigger4 instead');
    
    vscode.window.showInformationMessage(
        '✨ Images are automatically uploaded via secure pipeline!',
        'Learn More'
    ).then((choice) => {
        if (choice === 'Learn More') {
            vscode.env.openExternal(vscode.Uri.parse('https://github.com/otaruram/oclite-vscode'));
        }
    });
    
    return null;
}

// ── Gallery ────────────────────────────────────────────────────────────────

export async function fetchImageGallery(maxResults: number = 50): Promise<GalleryImage[]> {
    // Blob storage fetch is disabled for security reasons
    // Gallery now uses local cache from HttpTrigger4 generated images
    console.log('[OCLite Blob] Using local cache for gallery (blob storage disabled)');
    return [];
}

// ── Delete ─────────────────────────────────────────────────────────────────

export async function deleteGalleryImage(blobName: string): Promise<boolean> {
    // Blob storage delete is disabled for security reasons
    // Images can only be deleted from local cache
    console.log(`[OCLite Blob] Delete from blob storage disabled: ${blobName}`);
    return false;
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