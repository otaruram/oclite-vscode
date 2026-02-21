/**
 * services/sharing.ts — Share link generation & clipboard helpers.
 *
 * Share URL format: https://oclite.site/share/<10-char-id>
 * The share ID is a truncated SHA-256 hash stored in blob metadata.
 */
import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { sendTelemetryEvent } from './telemetry';

export const SHARE_BASE_URL = 'https://oclite.site/share';

/**
 * Generate a unique 10-char URL-safe share ID.
 */
export function generateShareId(blobName: string, timestamp: string): string {
    return crypto
        .createHash('sha256')
        .update(blobName + timestamp)
        .digest('base64url')
        .substring(0, 10);
}

/**
 * Build the full share URL from a share ID.
 */
export function createShareUrl(shareId: string): string {
    return `${SHARE_BASE_URL}/${shareId}`;
}

/**
 * Copy a share URL to clipboard and show a notification.
 */
export async function copyShareUrl(shareUrl: string, prompt: string): Promise<void> {
    try {
        await vscode.env.clipboard.writeText(shareUrl);
        vscode.window
            .showInformationMessage(
                `📋 Share link copied! "${prompt.substring(0, 30)}${prompt.length > 30 ? '...' : ''}"`,
                'Open Link'
            )
            .then((sel) => {
                if (sel === 'Open Link') {
                    vscode.env.openExternal(vscode.Uri.parse(shareUrl));
                }
            });
        sendTelemetryEvent('blob.link.copied', { promptLength: prompt.length.toString(), linkType: 'shareUrl' });
    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to copy link: ${error.message}`);
    }
}
