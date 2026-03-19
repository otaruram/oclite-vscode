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
    deleteGalleryImage,
} from '../services/blobStorage';
import { signInMicrosoft } from '../services/auth';
import { createGalleryHtml } from '../ui/galleryHtml';
import { getSecureImageUrl } from '../services/secureUrlService';

import { setVsCodeBackground, removeVsCodeBackground, applyThemeFromImage, removeOcliteTheme } from '../services/backgroundInjector';

/**
 * Register every non-chat command and push into context.subscriptions.
 */
export function registerAllCommands(context: vscode.ExtensionContext): void {
    const push = (...d: vscode.Disposable[]) => d.forEach((x) => context.subscriptions.push(x));

    // ── Excalidraw Canvas ─────────────────────────────────────────────
    push(
        vscode.commands.registerCommand('oclite.openCanvas', async () => {
            const panel = vscode.window.createWebviewPanel(
                'ocliteExcalidraw',
                'Ideation Canvas (Excalidraw)',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                }
            );
            panel.webview.html = `<!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Ideation Canvas</title>
                    <style>
                        html, body, iframe { height: 100%; width: 100%; margin: 0; padding: 0; border: none; }
                        body { background: #18181b; }
                        iframe { border: none; }
                    </style>
                </head>
                <body>
                    <iframe src="https://excalidraw.com" allowfullscreen style="width:100vw; height:100vh;"></iframe>
                </body>
                </html>`;
        })
    );

    // ── Image sharing ──────────────────────────────────────────────────
    push(
        vscode.commands.registerCommand('oclite.shareImage', async (imageUrl?: string, prompt?: string) => {
            // Legacy command — now just copies the ImageKit URL
            if (imageUrl) {
                await copyImageLink(imageUrl, prompt || 'Shared OCLite image');
                sendTelemetryEvent('command.shareImage.used');
            }
        }),

        vscode.commands.registerCommand('oclite.copyShareLink', async (url: string, blobName?: string) => {
            try {
                let finalUrl = url;
                
                // If we have a blob name, try to generate a secure URL
                if (blobName) {
                    console.log(`[OCLite] Generating secure URL for copy: ${blobName}`);
                    const secureUrl = await getSecureImageUrl(blobName);
                    if (secureUrl) {
                        finalUrl = secureUrl;
                        console.log(`[OCLite] Using secure URL for copy`);
                    } else {
                        console.warn(`[OCLite] Failed to generate secure URL, using fallback`);
                    }
                }
                
                await vscode.env.clipboard.writeText(finalUrl);
                vscode.window.showInformationMessage('📋 Secure image link copied!');
                sendTelemetryEvent('command.copyShareLink.success', { 
                    secureUrl: blobName ? 'true' : 'false' 
                });
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
                vscode.window.showWarningMessage('Blob storage is not configured. Please sign in to use cloud gallery.', 'Sign In').then((s) => {
                    if (s === 'Sign In') vscode.commands.executeCommand('oclite.signInMicrosoft');
                });
                return;
            }
            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: 'Loading image gallery...', cancellable: false },
                async () => {
                    const images = await fetchImageGallery(50);
                    if (!images.length) {
                        vscode.window.showInformationMessage('Your gallery is empty. Generate some images first!');
                        return;
                    }
                    const panel = vscode.window.createWebviewPanel('ocliteGallery', 'OCLite Gallery', vscode.ViewColumn.One, {
                        enableScripts: true,
                        retainContextWhenHidden: true,
                    });
                    panel.webview.html = createGalleryHtml(images, panel.webview.cspSource);
                    // Listen for messages from webview
                    panel.webview.onDidReceiveMessage(async (msg) => {
                        // Handle secure URL generation requests
                        if (msg && msg.type === 'generateSecureUrl' && msg.blobName) {
                            try {
                                console.log(`[OCLite Gallery] Generating secure URL for: ${msg.blobName}`);
                                const secureUrl = await getSecureImageUrl(msg.blobName);
                                
                                if (secureUrl) {
                                    console.log(`[OCLite Gallery] Secure URL generated successfully`);
                                    panel.webview.postMessage({
                                        type: 'secureUrlGenerated',
                                        secureUrl: secureUrl,
                                        action: msg.action,
                                        prompt: msg.prompt,
                                        idx: msg.idx
                                    });
                                } else {
                                    console.error(`[OCLite Gallery] Failed to generate secure URL for ${msg.blobName}`);
                                    panel.webview.postMessage({
                                        type: 'secureUrlError',
                                        error: 'Failed to generate secure URL',
                                        action: msg.action
                                    });
                                }
                            } catch (error: any) {
                                console.error(`[OCLite Gallery] Secure URL generation error:`, error.message);
                                panel.webview.postMessage({
                                    type: 'secureUrlError',
                                    error: error.message,
                                    action: msg.action
                                });
                            }
                        }
                        // Handle image deletion
                        else if (msg && msg.type === 'deleteImage' && msg.blobName) {
                            const idx = msg.idx;
                            try {
                                const success = await deleteGalleryImage(msg.blobName);
                                panel.webview.postMessage({ type: 'deleteResult', success, idx });
                                if (success) {
                                    sendTelemetryEvent('gallery.delete.success', { blobName: msg.blobName });
                                } else {
                                    vscode.window.showErrorMessage('Failed to delete image from storage.');
                                }
                            } catch (err) {
                                const errorMsg = (err && (err as any).message) ? (err as any).message : String(err);
                                console.error('[OCLite] Delete error:', errorMsg);
                                panel.webview.postMessage({ type: 'deleteResult', success: false, idx });
                                vscode.window.showErrorMessage(`Failed to delete image: ${errorMsg}`);
                            }
                        }
                        else if (msg && msg.type === 'setTheme') {
                            await applyThemeFromImage(msg.imageUrl || '', context);
                            sendTelemetryEvent('command.applyTheme.triggered', { source: 'gallery' });
                        }
                        else if (msg && msg.type === 'removeTheme') {
                            await removeOcliteTheme(context);
                            sendTelemetryEvent('command.removeTheme.triggered', { source: 'gallery' });
                        }
                    });
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

    // ── Theme / Background ─────────────────────────────────────────────────────
    push(
        vscode.commands.registerCommand('oclite.removeBackground', async () => {
            sendTelemetryEvent('command.removeBackground.triggered');
            await removeVsCodeBackground();
        }),

        vscode.commands.registerCommand('oclite.setBackground', async () => {
            const url = await vscode.window.showInputBox({
                prompt: 'Enter the image URL to set as VS Code Editor Background',
                placeHolder: 'https://...'
            });
            if (url) {
                sendTelemetryEvent('command.setBackground.triggered', { source: 'palette' });
                await setVsCodeBackground(url);
            }
        }),

        vscode.commands.registerCommand('oclite.removeTheme', async () => {
            sendTelemetryEvent('command.removeTheme.triggered');
            await removeOcliteTheme(context);
        })
    );
}
