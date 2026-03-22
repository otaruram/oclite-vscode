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

// Helper function to extract fileId from ImageKit URL
function extractFileIdFromUrl(url: string): string | null {
    try {
        // ImageKit URL format: https://ik.imagekit.io/dvgef33rf/path/to/file_fileId.ext
        // Or the fileId might be in the path
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/');
        const lastPart = pathParts[pathParts.length - 1];
        
        // Try to extract fileId from filename (usually after underscore)
        const match = lastPart.match(/_([a-zA-Z0-9]+)\./);
        if (match && match[1]) {
            return match[1];
        }
        
        // If not found, return null (will need to be stored separately)
        return null;
    } catch {
        return null;
    }
}

/**
 * Register every non-chat command and push into context.subscriptions.
 */
export function registerAllCommands(context: vscode.ExtensionContext): void {
    const push = (...d: vscode.Disposable[]) => d.forEach((x) => context.subscriptions.push(x));

    // ── Status Bar Item ────────────────────────────────────────────────
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'oclite.showStats';
    statusBarItem.tooltip = 'OCLite Statistics (Click to view)';
    
    // Update status bar with login status and gallery count
    const updateStatusBar = () => {
        const user = getCurrentUser();
        if (user) {
            // Signed in - show stats
            const cachedItems = context.globalState.get<any[]>('oclite.galleryItems', []);
            const count = cachedItems.length;
            statusBarItem.text = `$(cloud) OCLite: ${count}`;
            statusBarItem.tooltip = `OCLite: ${count} images (${user.label})`;
        } else {
            // Not signed in - show sign in prompt
            statusBarItem.text = `$(sign-in) OCLite`;
            statusBarItem.tooltip = 'OCLite: Click to sign in';
            statusBarItem.command = 'oclite.signInMicrosoft';
        }
        statusBarItem.show();
    };
    
    updateStatusBar();
    context.subscriptions.push(statusBarItem);
    
    // Update status bar every 30 seconds
    const statusInterval = setInterval(updateStatusBar, 30000);
    context.subscriptions.push({ dispose: () => clearInterval(statusInterval) });

    // ── Core OCLite Commands ──────────────────────────────────────────
    push(
        vscode.commands.registerCommand('oclite.generateImage', async () => {
            sendTelemetryEvent('command.generateImage.triggered');
            // Show the sidebar panel for image generation
            await vscode.commands.executeCommand('oclite.sidebarView.focus');
        }),

        vscode.commands.registerCommand('oclite.chatWithAI', async () => {
            sendTelemetryEvent('command.chatWithAI.triggered');
            // Show the chat panel
            await vscode.commands.executeCommand('oclite.chatView.focus');
        }),

    );

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
            
            console.log('[OCLite Gallery] Opening gallery...');
            
            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: 'Loading image gallery...', cancellable: false },
                async () => {
                    // Try to get images from blob storage first
                    let images: any[] = [];
                    
                    if (isBlobStorageAvailable()) {
                        console.log('[OCLite Gallery] Blob storage available, fetching...');
                        images = await fetchImageGallery(50);
                    } else {
                        console.log('[OCLite Gallery] Blob storage not available');
                    }
                    
                    // If no blob storage or empty, use local cache
                    if (images.length === 0) {
                        const cachedItems = context.globalState.get<any[]>('oclite.galleryItems', []);
                        console.log(`[OCLite Gallery] Using cached gallery items: ${cachedItems.length}`);
                        
                        if (cachedItems.length > 0) {
                            images = cachedItems.map(item => ({
                                ...item,
                                lastModified: new Date(item.lastModified || item.timestamp || Date.now()),
                                sizeBytes: 0,
                                userId: 'local'
                            }));
                            console.log(`[OCLite Gallery] Mapped ${images.length} cached items`);
                        } else {
                            console.log('[OCLite Gallery] No cached items found');
                        }
                    }
                    
                    if (!images.length) {
                        console.log('[OCLite Gallery] Gallery is empty');
                        vscode.window.showInformationMessage('Your gallery is empty. Generate some images first!');
                        return;
                    }
                    
                    console.log(`[OCLite Gallery] Displaying ${images.length} images`);
                    
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
                                console.log(`[OCLite Gallery] Deleting image: ${msg.blobName}`);
                                
                                let success = false;
                                
                                // Get image data from cache to find ImageKit fileId
                                const cachedItems = context.globalState.get<any[]>('oclite.galleryItems', []);
                                const imageItem = cachedItems.find(item => item.name === msg.blobName);
                                
                                // Delete from ImageKit if fileId exists
                                if (imageItem && imageItem.imagekitUrl) {
                                    try {
                                        console.log(`[OCLite Gallery] Deleting from ImageKit...`);
                                        const { getImagekitFunctionUrl } = require('../utilities/secrets');
                                        const imagekitUrl = getImagekitFunctionUrl();
                                        
                                        // Extract fileId from ImageKit URL or use stored fileId
                                        const fileId = imageItem.fileId || extractFileIdFromUrl(imageItem.imagekitUrl);
                                        
                                        if (fileId) {
                                            const axios = require('axios');
                                            const deleteResponse = await axios.post(
                                                imagekitUrl,
                                                {
                                                    action: 'delete',
                                                    fileId: fileId
                                                },
                                                {
                                                    headers: { 'Content-Type': 'application/json' },
                                                    timeout: 30000
                                                }
                                            );
                                            
                                            if (deleteResponse.data.status === 'success') {
                                                console.log(`[OCLite Gallery] ✅ Deleted from ImageKit`);
                                                success = true;
                                            }
                                        }
                                    } catch (imagekitError: any) {
                                        console.error(`[OCLite Gallery] ImageKit delete failed:`, imagekitError.message);
                                        // Continue even if ImageKit delete fails
                                    }
                                }
                                
                                // Try to delete from blob storage (legacy)
                                if (isBlobStorageAvailable()) {
                                    const blobSuccess = await deleteGalleryImage(msg.blobName);
                                    if (blobSuccess) success = true;
                                }
                                
                                // Remove from local cache
                                const filtered = cachedItems.filter(item => item.name !== msg.blobName);
                                await context.globalState.update('oclite.galleryItems', filtered);
                                
                                console.log(`[OCLite Gallery] Deleted from cache. Remaining: ${filtered.length}`);
                                
                                panel.webview.postMessage({ type: 'deleteResult', success: true, idx });
                                
                                if (success) {
                                    sendTelemetryEvent('gallery.delete.success', { blobName: msg.blobName, imagekit: imageItem?.imagekitUrl ? 'true' : 'false' });
                                }
                            } catch (err) {
                                const errorMsg = (err && (err as any).message) ? (err as any).message : String(err);
                                console.error('[OCLite Gallery] Delete error:', errorMsg);
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
            if (session) {
                await initializeBlobStorage();
                vscode.window.showInformationMessage('✅ Signed in! Cloud storage enabled.');
            }
        }),

        vscode.commands.registerCommand('oclite.signOut', async () => {
            await signOutUser();
            vscode.window.showInformationMessage('👋 Signed out. Local storage still available.');
            sendTelemetryEvent('command.signOut.triggered');
        })
    );

    // ── Storage / Telemetry config ─────────────────────────────────────
    // Removed unused commands: configureStorage, clearStorageSettings, configureTelemetry
    // These were auto-configured and not needed by users

    // ── Status / Stats ─────────────────────────────────────────────────
    push(
        // Show detailed stats when clicking status bar - REQUIRES LOGIN
        vscode.commands.registerCommand('oclite.showStats', async () => {
            const user = getCurrentUser();
            if (!user) {
                const action = await vscode.window.showWarningMessage(
                    '⚠️ Please sign in with Microsoft to view statistics.',
                    'Sign In', 'Cancel'
                );
                if (action === 'Sign In') {
                    await vscode.commands.executeCommand('oclite.signInMicrosoft');
                }
                return;
            }
            
            if (!isBlobStorageAvailable()) {
                vscode.window.showWarningMessage('⚠️ Cloud storage not available. Please try signing in again.');
                return;
            }
            
            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: 'Loading statistics...' },
                async () => {
                    try {
                        const stats = await getSharingStats();
                        const mb = (stats.totalSize / (1024 * 1024)).toFixed(2);
                        const oldest = stats.oldestImage ? stats.oldestImage.toLocaleDateString() : 'N/A';
                        
                        vscode.window.showInformationMessage(
                            `📊 ${user.label}\n🖼️ Images: ${stats.totalImages}\n💾 Storage: ${mb} MB\n📅 Oldest: ${oldest}`,
                            'View Gallery', 'Close'
                        ).then(selection => {
                            if (selection === 'View Gallery') {
                                vscode.commands.executeCommand('oclite.viewGallery');
                            }
                        });
                        
                        sendTelemetryEvent('command.showStats.viewed', {
                            imageCount: stats.totalImages.toString(),
                            storageUsedMB: mb,
                        });
                    } catch (e: any) {
                        vscode.window.showErrorMessage(`Failed to load statistics: ${e.message}`);
                    }
                }
            );
        }),

        // Rate limit status - REQUIRES LOGIN
        vscode.commands.registerCommand('oclite.rateLimitStatus', async () => {
            const user = getCurrentUser();
            if (!user) {
                const action = await vscode.window.showWarningMessage(
                    '⚠️ Please sign in with Microsoft to view rate limit status.',
                    'Sign In', 'Cancel'
                );
                if (action === 'Sign In') {
                    await vscode.commands.executeCommand('oclite.signInMicrosoft');
                }
                return;
            }
            
            const status = getRateLimitStatus();
            if (status) {
                const mins = Math.ceil((status.resetTime - Date.now()) / 60000);
                vscode.window.showInformationMessage(
                    `⚡ Rate Limit: ${status.remaining} remaining — resets in ${mins > 0 ? mins + ' min' : 'now'}`
                );
            } else {
                vscode.window.showInformationMessage('⚡ Rate Limit: No limits applied');
            }
            sendTelemetryEvent('command.rateLimitStatus.viewed');
        }),

        // Sharing stats - REQUIRES LOGIN
        vscode.commands.registerCommand('oclite.sharingStats', async () => {
            const user = getCurrentUser();
            if (!user) {
                const action = await vscode.window.showWarningMessage(
                    '⚠️ Please sign in with Microsoft to view sharing statistics.',
                    'Sign In', 'Cancel'
                );
                if (action === 'Sign In') {
                    await vscode.commands.executeCommand('oclite.signInMicrosoft');
                }
                return;
            }
            
            if (!isBlobStorageAvailable()) {
                vscode.window.showWarningMessage('⚠️ Cloud storage not available. Please try signing in again.');
                return;
            }
            
            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: 'Loading sharing statistics...' },
                async () => {
                    try {
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
                    } catch (e: any) {
                        vscode.window.showErrorMessage(`Failed to load sharing stats: ${e.message}`);
                    }
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
