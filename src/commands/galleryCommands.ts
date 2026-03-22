import * as vscode from 'vscode';
import { sendTelemetryEvent } from '../services/telemetry';
import { isBlobStorageAvailable, fetchImageGallery, deleteGalleryImage } from '../services/blobStorage';
import { createGalleryHtml } from '../ui/galleryHtml';
import { getSecureImageUrl } from '../services/secureUrlService';
import { applyThemeFromImage, removeOcliteTheme } from '../services/backgroundInjector';

// Helper function to extract fileId from ImageKit URL
function extractFileIdFromUrl(url: string): string | null {
    try {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/');
        const lastPart = pathParts[pathParts.length - 1];
        
        const match = lastPart.match(/_([a-zA-Z0-9]+)\./);
        if (match && match[1]) {
            return match[1];
        }
        return null;
    } catch {
        return null;
    }
}

export function registerGalleryCommands(context: vscode.ExtensionContext): void {
    const push = (...d: vscode.Disposable[]) => d.forEach((x) => context.subscriptions.push(x));

    push(
        vscode.commands.registerCommand('oclite.viewGallery', async () => {
            sendTelemetryEvent('command.viewGallery.triggered');
            
            console.log('[OCLite Gallery] Opening gallery...');
            
            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: 'Loading image gallery...', cancellable: false },
                async (progress) => {
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
                                                    headers: { 
                                                        'Content-Type': 'application/json',
                                                        'x-oclite-signature': `oclite-${Date.now()}`,
                                                        'x-oclite-timestamp': Date.now().toString()
                                                    },
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
}

