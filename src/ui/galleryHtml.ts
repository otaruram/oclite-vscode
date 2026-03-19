/**
 * ui/galleryHtml.ts — Gallery webview HTML builder.
 */
import { GalleryImage } from '../types';
import { getNonce } from '../utilities/getNonce';

export function createGalleryHtml(images: GalleryImage[], cspSource: string): string {
    const nonce = getNonce();

    const imageCards = images
        .map((img, idx) => {
            const safePrompt = img.originalPrompt.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
            const safeName = img.name.replace(/"/g, '&quot;');
            const safeShareId = img.shareId.replace(/"/g, '&quot;');
            
            // Debug logging untuk melihat data yang diterima
            console.log(`[OCLite Gallery] Image ${idx}:`, {
                url: img.url,
                shareUrl: img.shareUrl,
                name: img.name,
                prompt: img.originalPrompt.substring(0, 50) + '...'
            });
            
            // Use blob storage URL directly - no more ImageKit dependency
            let primaryUrl = img.url || img.shareUrl || '';
            
            // Validate URL before using
            if (!primaryUrl || primaryUrl === 'unknown' || !primaryUrl.startsWith('http')) {
                console.warn(`[OCLite Gallery] Invalid URL for image ${idx}:`, primaryUrl);
                primaryUrl = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjBmMGYwIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkltYWdlIE5vdCBGb3VuZDwvdGV4dD48L3N2Zz4='; // Placeholder SVG
            }
            
            const safePrimaryUrl = primaryUrl.replace(/"/g, '&quot;');
            console.log(`[OCLite Gallery] Using URL for image ${idx}: ${primaryUrl}`);
            
            return `
            <div class="image-card" id="card-${idx}" data-blob-name="${safeName}">
                <img src="${safePrimaryUrl}" alt="${safePrompt}" loading="lazy" onerror="console.error('[OCLite Gallery] Failed to load image:', '${safePrimaryUrl}')" />
                <div class="image-info">
                    <h3>${img.originalPrompt}</h3>
                    <p><strong>Model:</strong> ${img.model}</p>
                    <p><strong>Generated:</strong> ${img.lastModified.toLocaleDateString()}</p>
                    <div class="sharing-actions">
                        <button class="action-link copy-btn"
                            data-action="copy"
                            data-url="${safePrimaryUrl}">📋 Copy Image Link</button>
                        <button class="action-link"
                            data-action="gencode"
                            data-url="${safePrimaryUrl}"
                            data-prompt="${safePrompt}"
                            data-idx="${idx}">💻 Generate Code</button>
                        <button class="action-link bg-btn"
                            data-action="setbg"
                            data-url="${safePrimaryUrl}">🖼️ Set Background</button>
                        <button class="action-link delete-btn"
                            data-action="delete"
                            data-blob="${safeName}"
                            data-idx="${idx}">🗑️ Delete</button>
                    </div>
                    <div class="code-result" id="code-result-${idx}"></div>
                </div>
            </div>`;
        })
        .join('');

    return /* html */ `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src ${cspSource} https: http: data: blob:; script-src 'nonce-${nonce}'; connect-src https:;">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OCLite Gallery</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); padding: 20px; margin: 0; }
        .gallery-header { text-align: center; margin-bottom: 30px; }
        .gallery-header h1 { margin: 0 0 10px 0; font-size: 24px; }
        .gallery-header p { color: var(--vscode-descriptionForeground); margin: 0; }
        .gallery-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 25px; }
        .image-card { background: var(--vscode-editor-inactiveSelectionBackground); border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.15); transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .image-card:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.2); }
        .image-card img { width: 100%; height: 220px; object-fit: cover; }
        .image-info { padding: 18px; }
        .image-info h3 { margin: 0 0 12px 0; font-size: 14px; font-weight: 600; color: var(--vscode-editor-foreground); line-height: 1.3; }
        .image-info p { margin: 6px 0; font-size: 12px; opacity: 0.8; }
        .sharing-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 15px; }
        .action-link { display: inline-block; padding: 8px 12px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); text-decoration: none; border-radius: 6px; font-size: 12px; font-weight: 500; text-align: center; border: none; cursor: pointer; font-family: inherit; transition: background-color 0.2s ease; }
        .action-link:hover { background: var(--vscode-button-hoverBackground); }
        .copy-btn { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
        .copy-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
        .bg-btn { background: rgba(139, 92, 246, 0.2); color: #c4b5fd; }
        .bg-btn:hover { background: rgba(139, 92, 246, 0.4); }
        .delete-btn { background: #c62828; color: #fff; }
        .delete-btn:hover { background: #b71c1c; }
        .toast { position: fixed; top: 20px; right: 20px; background: var(--vscode-notifications-background); color: var(--vscode-notifications-foreground); padding: 12px 16px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.2); z-index: 1000; opacity: 0; transform: translateX(100%); transition: all 0.3s ease; }
        .toast.show { opacity: 1; transform: translateX(0); }
        .confirm-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 2000; }
        .confirm-box { background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 10px; padding: 24px; max-width: 320px; width: 90%; text-align: center; }
        .confirm-box p { margin-bottom: 16px; font-size: 13px; }
        .confirm-btns { display: flex; gap: 10px; justify-content: center; }
        .confirm-btns button { padding: 7px 20px; border-radius: 6px; border: none; cursor: pointer; font-size: 12px; font-weight: 600; }
        .btn-confirm { background: #c62828; color: #fff; }
        .btn-cancel { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    </style>
</head>
<body>
    <div class="gallery-header">
        <h1>🎨 Your OCLite Gallery</h1>
        <p>AI-generated images stored on cloud</p>
    </div>
    <div class="gallery-grid">${imageCards}</div>
    <div id="toast" class="toast"></div>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        
        // Debug: Check if vscode API is available
        console.log('VSCode API available:', !!vscode);
        console.log('VSCode postMessage available:', !!(vscode && vscode.postMessage));

        function showToast(msg) {
            const t = document.getElementById('toast');
            t.textContent = msg; t.classList.add('show');
            setTimeout(() => t.classList.remove('show'), 3000);
        }

        function showConfirm(msg, onConfirm) {
            const overlay = document.createElement('div');
            overlay.className = 'confirm-overlay';
            overlay.innerHTML = '<div class="confirm-box"><p>' + msg + '</p><div class="confirm-btns"><button class="btn-confirm">Delete</button><button class="btn-cancel">Cancel</button></div></div>';
            document.body.appendChild(overlay);
            overlay.querySelector('.btn-confirm').addEventListener('click', () => { overlay.remove(); onConfirm(); });
            overlay.querySelector('.btn-cancel').addEventListener('click', () => overlay.remove());
        }

        function generateCode(imageUrl, prompt, idx) {
            const codeDiv = document.getElementById('code-result-' + idx);
            if (!codeDiv) return;
            codeDiv.innerHTML = '<em style="opacity:0.6">⚙️ Generating HTML code...</em>';
            
            console.log('[OCLite Gallery] Generate code for:', { imageUrl, prompt });
            
            // Validate the image URL
            let finalUrl = imageUrl || '';
            if (!finalUrl || finalUrl === 'unknown' || finalUrl === '' || !finalUrl.startsWith('http')) {
                console.warn('[OCLite Gallery] Invalid image URL:', finalUrl);
                showToast('❌ Invalid image URL');
                codeDiv.innerHTML = '<em style="color:red;">❌ Invalid image URL</em>';
                return;
            }
            
            // Clean and shorten the prompt
            const cleanPrompt = (prompt || 'OCLite Generated Image')
                .replace(/[<>&"']/g, '') // Remove HTML characters
                .substring(0, 100); // Limit length
            
            const htmlCode = '<!DOCTYPE html>\\n<html lang="en">\\n<head>\\n  <meta charset="UTF-8">\\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\\n  <title>' + cleanPrompt + '</title>\\n  <style>\\n    body { margin: 0; padding: 20px; font-family: system-ui, sans-serif; background: #0a0a0a; color: #fff; display: flex; align-items: center; justify-content: center; min-height: 100vh; }\\n    .container { max-width: 900px; background: #1a1a1a; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }\\n    img { width: 100%; height: auto; display: block; }\\n    .info { padding: 20px; text-align: center; }\\n    h1 { margin: 0 0 10px 0; font-size: 20px; color: #f0f0f0; }\\n    p { margin: 0; color: #888; font-size: 14px; }\\n    .badge { display: inline-block; margin-top: 15px; padding: 6px 12px; background: linear-gradient(45deg, #8b5cf6, #06b6d4); border-radius: 20px; font-size: 12px; font-weight: 600; }\\n  </style>\\n</head>\\n<body>\\n  <div class="container">\\n    <img src="' + finalUrl + '" alt="' + cleanPrompt + '" loading="lazy">\\n    <div class="info">\\n      <h1>' + cleanPrompt + '</h1>\\n      <p>AI-generated image created with OCLite</p>\\n      <span class="badge">🎨 OCLite AI</span>\\n    </div>\\n  </div>\\n</body>\\n</html>';
            
            setTimeout(function() {
                const preElement = document.createElement('pre');
                preElement.style.cssText = 'background:#1e1e1e;color:#d4d4d4;padding:15px;border-radius:8px;overflow-x:auto;max-height:350px;font-size:11px;white-space:pre-wrap;word-break:break-all;line-height:1.4;border:1px solid #333;';
                preElement.textContent = htmlCode;
                
                const copyButton = document.createElement('button');
                copyButton.className = 'action-link';
                copyButton.style.cssText = 'margin-top:10px;width:100%;background:#8b5cf6;color:white;';
                copyButton.textContent = '📋 Copy HTML Code';
                copyButton.addEventListener('click', function() {
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(htmlCode).then(function() { 
                            showToast('📋 HTML code copied to clipboard!'); 
                        });
                    }
                });
                
                codeDiv.innerHTML = '';
                codeDiv.appendChild(preElement);
                codeDiv.appendChild(copyButton);
            }, 100);
        }

        // Event delegation — no inline onclick needed
        document.body.addEventListener('click', function(e) {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            
            e.preventDefault();
            e.stopPropagation();
            
            const action = btn.getAttribute('data-action');
            console.log('Button clicked:', action);

            if (action === 'copy') {
                const url = btn.getAttribute('data-url');
                console.log('[OCLite Gallery] Copy action, URL:', url);
                if (url && url !== 'unknown' && url.startsWith('http')) {
                    // Generate secure read-only URL for copying
                    vscode.postMessage({ 
                        type: 'generateSecureUrl', 
                        blobName: btn.closest('.image-card').getAttribute('data-blob-name'),
                        action: 'copy'
                    });
                } else {
                    console.error('[OCLite Gallery] Invalid URL for copy:', url);
                    showToast('❌ Invalid image URL');
                }
            }
            else if (action === 'gencode') {
                const url = btn.getAttribute('data-url');
                const prompt = btn.getAttribute('data-prompt');
                const idx = btn.getAttribute('data-idx');
                console.log('[OCLite Gallery] Generate code action:', { url, prompt, idx });
                if (idx) {
                    // Generate secure read-only URL for code generation
                    vscode.postMessage({ 
                        type: 'generateSecureUrl', 
                        blobName: btn.closest('.image-card').getAttribute('data-blob-name'),
                        action: 'gencode',
                        prompt: prompt,
                        idx: parseInt(idx)
                    });
                }
            }
            else if (action === 'setbg') {
                const url = btn.getAttribute('data-url');
                console.log('[OCLite Gallery] Set background action, URL:', url);
                if (url && url !== 'unknown' && url.startsWith('http')) {
                    vscode.postMessage({ type: 'setBackground', imageUrl: url });
                    showToast('🚀 Setting VS Code background...');
                } else {
                    console.error('[OCLite Gallery] Invalid URL for background:', url);
                    showToast('❌ Invalid image URL for background');
                }
            }
            else if (action === 'delete') {
                const blobName = btn.getAttribute('data-blob');
                const idx = btn.getAttribute('data-idx');
                console.log('Delete action:', { blobName, idx });
                if (blobName && idx) {
                    showConfirm('Permanently delete this image?', function() {
                        const card = document.getElementById('card-' + idx);
                        if (card) card.style.opacity = '0.4';
                        vscode.postMessage({ type: 'deleteImage', blobName: blobName, idx: parseInt(idx) });
                    });
                }
            }
        }, false);

        window.addEventListener('message', function(event) {
            const msg = event.data;
            if (msg && msg.type === 'deleteResult' && typeof msg.idx === 'number') {
                const card = document.getElementById('card-' + msg.idx);
                if (msg.success && card) { card.remove(); showToast('🗑️ Image deleted!'); }
                else if (card) { card.style.opacity = '1'; showToast('❌ Delete failed'); }
            }
            else if (msg && msg.type === 'secureUrlGenerated') {
                if (msg.action === 'copy' && msg.secureUrl) {
                    // Copy the secure URL to clipboard
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(msg.secureUrl)
                            .then(() => {
                                console.log('[OCLite Gallery] Secure URL copied successfully');
                                showToast('📋 Secure image link copied!');
                            })
                            .catch((err) => {
                                console.error('[OCLite Gallery] Copy failed:', err);
                                showToast('❌ Copy failed');
                            });
                    }
                }
                else if (msg.action === 'gencode' && msg.secureUrl && typeof msg.idx === 'number') {
                    // Generate code with secure URL
                    generateCode(msg.secureUrl, msg.prompt, msg.idx);
                }
            }
        });
    </script>
</body>
</html>`;
}
