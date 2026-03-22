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
import { registerCanvasCommands } from './canvasCommands';
import { registerGalleryCommands } from './galleryCommands';

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

    // ── Sub-module registrations ──────────────────────────────────────
    registerCanvasCommands(context);
    registerGalleryCommands(context);

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

    // ── Image sharing ──────────────────────────────────────────────────
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
        }),

        // Clear gallery cache
        vscode.commands.registerCommand('oclite.clearGalleryCache', async () => {
            const choice = await vscode.window.showWarningMessage(
                '🗑️ Clear all gallery cache? This will remove local cached images but NOT delete from cloud.',
                'Clear Cache', 'Cancel'
            );
            
            if (choice === 'Clear Cache') {
                await context.globalState.update('oclite.galleryItems', []);
                vscode.window.showInformationMessage('✅ Gallery cache cleared! Generate new images to see ImageKit URLs.');
                sendTelemetryEvent('command.clearGalleryCache.executed');
            }
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
