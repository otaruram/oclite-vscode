/**
 * commands/index.ts — Register all extension commands.
 *
 * Keeps extension.ts thin by collecting command registrations here.
 */
import * as vscode from 'vscode';
import { sendTelemetryEvent } from '../services/telemetry';
import {
    initializeBlobStorage,
    fetchImageGallery,
    isBlobStorageAvailable,
    getSharingStats,
    getCurrentUser,
    signOutUser,
    getRateLimitStatus,
    clearStorageSettings,
    copyImageLink,
} from '../services/blobStorage';
import { signInMicrosoft } from '../services/auth';
import { createGalleryHtml } from '../ui/galleryHtml';

/**
 * Register every non-chat command and push into context.subscriptions.
 */
export function registerAllCommands(context: vscode.ExtensionContext): void {
    const push = (...d: vscode.Disposable[]) => d.forEach((x) => context.subscriptions.push(x));

    // ── Image sharing ──────────────────────────────────────────────────
    push(
        vscode.commands.registerCommand('oclite.shareImage', async (imageUrl?: string, prompt?: string) => {
            // Legacy command — now just copies the ImageKit URL
            if (imageUrl) {
                await copyImageLink(imageUrl, prompt || 'Shared OCLite image');
                sendTelemetryEvent('command.shareImage.used');
            }
        }),

        vscode.commands.registerCommand('oclite.copyShareLink', async (url: string) => {
            try {
                await vscode.env.clipboard.writeText(url);
                vscode.window.showInformationMessage('📋 Image link copied!');
                sendTelemetryEvent('command.copyShareLink.success');
            } catch (e: any) {
                vscode.window.showErrorMessage(`Failed to copy link: ${e.message}`);
            }
        })
    );

    // ── Gallery ────────────────────────────────────────────────────────
    push(
        vscode.commands.registerCommand('oclite.viewGallery', async () => {
            sendTelemetryEvent('command.viewGallery.triggered');
            if (!isBlobStorageAvailable()) {
                vscode.window.showWarningMessage('Blob storage is not configured. Generated images are only saved locally.');
                return;
            }
            vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: 'Loading image gallery...', cancellable: false },
                async () => {
                    const images = await fetchImageGallery(20);
                    if (!images.length) {
                        vscode.window.showInformationMessage('Your gallery is empty. Generate some images first!');
                        return;
                    }
                    const panel = vscode.window.createWebviewPanel('ocliteGallery', 'OCLite Gallery', vscode.ViewColumn.One, {
                        enableScripts: true,
                        retainContextWhenHidden: true,
                    });
                    panel.webview.html = createGalleryHtml(images);
                    sendTelemetryEvent('command.viewGallery.opened', { imageCount: images.length.toString() });
                }
            );
        })
    );

    // ── Auth ───────────────────────────────────────────────────────────
    push(
        vscode.commands.registerCommand('oclite.signInMicrosoft', async () => {
            sendTelemetryEvent('command.signIn.triggered');
            const session = await signInMicrosoft();
            if (session) await initializeBlobStorage();
        }),

        vscode.commands.registerCommand('oclite.signOut', async () => {
            await signOutUser();
            sendTelemetryEvent('command.signOut.triggered');
        }),

        vscode.commands.registerCommand('oclite.clearApiKey', async () => {
            vscode.window.showInformationMessage('API key is auto-configured and cannot be cleared.');
        }),

        vscode.commands.registerCommand('oclite.setApiKey', async () => {
            vscode.window.showInformationMessage('✅ API key is auto-configured. No manual setup needed!');
        })
    );

    // ── Storage / Telemetry config ─────────────────────────────────────
    push(
        vscode.commands.registerCommand('oclite.configureStorage', async () => {
            sendTelemetryEvent('command.configureStorage.triggered');
            vscode.window.showInformationMessage('✅ Cloud storage is automatically configured. Sign in with Microsoft to use cloud features.');
        }),

        vscode.commands.registerCommand('oclite.clearStorageSettings', async () => {
            const ok = await vscode.window.showWarningMessage(
                '🗑️ This will clear your storage session and disable cloud features.',
                'Clear Session',
                'Cancel'
            );
            if (ok === 'Clear Session') {
                await clearStorageSettings();
                sendTelemetryEvent('command.clearStorageSettings.executed');
            }
        }),

        vscode.commands.registerCommand('oclite.configureTelemetry', async () => {
            vscode.window.showInformationMessage('✅ Telemetry is automatically configured.');
        })
    );

    // ── Status / Stats ─────────────────────────────────────────────────
    push(
        vscode.commands.registerCommand('oclite.rateLimitStatus', async () => {
            const user = getCurrentUser();
            if (!user) {
                vscode.window.showWarningMessage('⚠️ Please sign in to view rate limit status.');
                return;
            }
            const status = getRateLimitStatus();
            if (status) {
                const mins = Math.ceil((status.resetTime - Date.now()) / 60000);
                vscode.window.showInformationMessage(
                    `⚡ Rate Limit: ${status.remaining} remaining — resets in ${mins > 0 ? mins + ' min' : 'now'}`
                );
            }
            sendTelemetryEvent('command.rateLimitStatus.viewed');
        }),

        vscode.commands.registerCommand('oclite.sharingStats', async () => {
            const user = getCurrentUser();
            if (!user) {
                vscode.window.showWarningMessage('⚠️ Please sign in to view sharing statistics.');
                return;
            }
            vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: 'Loading sharing statistics...' },
                async () => {
                    const stats = await getSharingStats();
                    const mb = (stats.totalSize / (1024 * 1024)).toFixed(2);
                    const oldest = stats.oldestImage ? stats.oldestImage.toLocaleDateString() : 'N/A';
                    vscode.window.showInformationMessage(
                        `📊 ${user.label}: ${stats.totalImages} images, ${mb} MB, oldest ${oldest}`
                    );
                    sendTelemetryEvent('command.sharingStats.viewed', {
                        imageCount: stats.totalImages.toString(),
                        storageUsedMB: mb,
                    });
                }
            );
        })
    );
}
