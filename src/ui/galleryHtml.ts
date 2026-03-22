/**
 * ui/galleryHtml.ts — Gallery webview HTML builder.
 *
 * URLs are stored in a JS array (not HTML attributes) to avoid
 * HTML-encoding breaking SAS query strings.
 */
import { GalleryImage } from '../types';
import { getNonce } from '../utilities/getNonce';

const PLACEHOLDER_SVG = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMWExYTFhIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzY2NiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5vIEltYWdlPC90ZXh0Pjwvc3ZnPg==';

export function createGalleryHtml(images: GalleryImage[], cspSource: string): string {
    const nonce = getNonce();

    // Build JS-safe URL array — prioritize ImageKit URL over SAS URL
    const urlArray = JSON.stringify(images.map(img => {
        // Priority: imagekitUrl (permanent) > url > shareUrl (temporary SAS)
        const url = img.imagekitUrl || img.url || img.shareUrl || '';
        return (url && url.startsWith('http')) ? url : '';
    }));

    const blobNameArray = JSON.stringify(images.map(img => img.name));
    const promptArray   = JSON.stringify(images.map(img => img.originalPrompt));

    const imageCards = images.map((img, idx) => {
        const safePrompt = img.originalPrompt.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const safeName   = img.name.replace(/"/g, '&quot;');
        // Use placeholder in src — real URL injected by JS after page load to avoid encoding issues
        return `
        <div class="image-card" id="card-${idx}" data-idx="${idx}" data-blob-name="${safeName}">
            <img id="img-${idx}" src="${PLACEHOLDER_SVG}" alt="${safePrompt}" loading="lazy" />
            <div class="image-info">
                <p class="prompt-text">${safePrompt}</p>
                <p><strong>Model:</strong> ${img.model}</p>
                <p><strong>Generated:</strong> ${img.lastModified.toLocaleDateString()}</p>
                <div class="sharing-actions">
                    <button class="action-link copy-btn"  data-action="copy"     data-idx="${idx}">📋 Copy Link</button>
                    <button class="action-link"           data-action="gencode"  data-idx="${idx}">💻 Generate Code</button>
                    <button class="action-link bg-btn"    data-action="settheme" data-idx="${idx}">✨ Immerse</button>
                    <button class="action-link delete-btn" data-action="delete"  data-idx="${idx}" data-blob="${safeName}">🗑️ Delete</button>
                </div>
                <div class="code-result" id="code-result-${idx}"></div>
            </div>
        </div>`;
    }).join('');

    return /* html */`<!DOCTYPE html>
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
        .image-card img { width: 100%; height: 220px; object-fit: cover; background: #111; }
        .image-info { padding: 18px; }
        .prompt-text { margin: 0 0 12px 0; font-size: 14px; font-weight: 600; line-height: 1.3; }
        .image-info p { margin: 6px 0; font-size: 12px; opacity: 0.8; }
        .sharing-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 15px; }
        .action-link { display: inline-block; padding: 8px 12px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-radius: 6px; font-size: 12px; font-weight: 500; text-align: center; border: none; cursor: pointer; font-family: inherit; transition: background-color 0.2s ease; }
        .action-link:hover { background: var(--vscode-button-hoverBackground); }
        .copy-btn { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
        .copy-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
        .bg-btn { background: rgba(139,92,246,0.2); color: #c4b5fd; }
        .bg-btn:hover { background: rgba(139,92,246,0.4); }
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
        <button id="resetThemeBtn" style="margin-top:10px;padding:7px 16px;background:#c62828;color:#fff;border:none;border-radius:6px;font-size:12px;cursor:pointer;font-family:inherit;">🗑️ De-Immerse</button>
    </div>
    <div class="gallery-grid">${imageCards}</div>
    <div id="toast" class="toast"></div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();

        // ── URL registry — stored in JS, NOT in HTML attributes ──────────
        // This avoids HTML-encoding breaking SAS query strings (&amp; etc.)
        const IMAGE_URLS   = ${urlArray};
        const BLOB_NAMES   = ${blobNameArray};
        const PROMPTS      = ${promptArray};

        // Inject real image URLs after page load
        IMAGE_URLS.forEach(function(url, idx) {
            if (url) {
                var img = document.getElementById('img-' + idx);
                if (img) { img.src = url; }
            }
        });

        // ── Toast ─────────────────────────────────────────────────────────
        function showToast(msg) {
            var t = document.getElementById('toast');
            t.textContent = msg; t.classList.add('show');
            setTimeout(function() { t.classList.remove('show'); }, 3000);
        }

        // ── Confirm dialog ────────────────────────────────────────────────
        function showConfirm(msg, onConfirm) {
            var overlay = document.createElement('div');
            overlay.className = 'confirm-overlay';
            overlay.innerHTML = '<div class="confirm-box"><p>' + msg + '</p><div class="confirm-btns"><button class="btn-confirm">Delete</button><button class="btn-cancel">Cancel</button></div></div>';
            document.body.appendChild(overlay);
            overlay.querySelector('.btn-confirm').addEventListener('click', function() { overlay.remove(); onConfirm(); });
            overlay.querySelector('.btn-cancel').addEventListener('click', function() { overlay.remove(); });
        }

        // ── Generate HTML code snippet ────────────────────────────────────
        function generateCode(imageUrl, prompt, idx) {
            var codeDiv = document.getElementById('code-result-' + idx);
            if (!codeDiv) { return; }
            if (!imageUrl || !imageUrl.startsWith('http')) { showToast('❌ Invalid image URL'); return; }
            var cleanPrompt = (prompt || 'OCLite Generated Image').replace(/[<>&"']/g, '').substring(0, 100);
            var htmlCode = '<!DOCTYPE html>\\n<html lang="en">\\n<head>\\n  <meta charset="UTF-8">\\n  <title>' + cleanPrompt + '</title>\\n  <style>body{margin:0;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:system-ui}.container{max-width:900px;background:#1a1a1a;border-radius:12px;overflow:hidden}img{width:100%;height:auto;display:block}.info{padding:20px;text-align:center}</style>\\n</head>\\n<body>\\n  <div class="container">\\n    <img src="' + imageUrl + '" alt="' + cleanPrompt + '" loading="lazy">\\n    <div class="info"><h1>' + cleanPrompt + '</h1><p>AI-generated with OCLite</p></div>\\n  </div>\\n</body>\\n</html>';
            var pre = document.createElement('pre');
            pre.style.cssText = 'background:#1e1e1e;color:#d4d4d4;padding:15px;border-radius:8px;overflow-x:auto;max-height:300px;font-size:11px;white-space:pre-wrap;word-break:break-all;margin-top:8px;';
            pre.textContent = htmlCode;
            var copyBtn = document.createElement('button');
            copyBtn.className = 'action-link';
            copyBtn.style.cssText = 'margin-top:8px;width:100%;background:#8b5cf6;color:white;';
            copyBtn.textContent = '📋 Copy HTML';
            copyBtn.addEventListener('click', function() {
                navigator.clipboard && navigator.clipboard.writeText(htmlCode).then(function() { showToast('📋 HTML copied!'); });
            });
            codeDiv.innerHTML = '';
            codeDiv.appendChild(pre);
            codeDiv.appendChild(copyBtn);
        }

        // ── Event delegation ──────────────────────────────────────────────
        document.body.addEventListener('click', function(e) {
            var btn = e.target.closest('[data-action]');
            if (!btn) { return; }
            e.preventDefault();
            e.stopPropagation();

            var action = btn.getAttribute('data-action');
            var idx    = parseInt(btn.getAttribute('data-idx'), 10);
            var url    = IMAGE_URLS[idx] || '';
            var blob   = BLOB_NAMES[idx] || '';
            var prompt = PROMPTS[idx]    || '';

            if (action === 'copy') {
                if (url) {
                    vscode.postMessage({ type: 'generateSecureUrl', blobName: blob, action: 'copy' });
                } else {
                    showToast('❌ No URL available');
                }
            }
            else if (action === 'gencode') {
                vscode.postMessage({ type: 'generateSecureUrl', blobName: blob, action: 'gencode', prompt: prompt, idx: idx });
            }
            else if (action === 'settheme') {
                if (url) {
                    vscode.postMessage({ type: 'setTheme', imageUrl: url });
                    showToast('✨ Immersing... restart VS Code to see full effect.');
                } else {
                    showToast('❌ No URL available');
                }
            }
            else if (action === 'delete') {
                showConfirm('Permanently delete this image?', function() {
                    var card = document.getElementById('card-' + idx);
                    if (card) { card.style.opacity = '0.4'; }
                    vscode.postMessage({ type: 'deleteImage', blobName: blob, idx: idx });
                });
            }
        }, false);

        document.getElementById('resetThemeBtn').addEventListener('click', function() {
            vscode.postMessage({ type: 'removeTheme' });
        });

        // ── Messages from extension ───────────────────────────────────────
        window.addEventListener('message', function(event) {
            var msg = event.data;
            if (!msg) { return; }

            if (msg.type === 'deleteResult' && typeof msg.idx === 'number') {
                var card = document.getElementById('card-' + msg.idx);
                if (msg.success && card) { card.remove(); showToast('🗑️ Image deleted!'); }
                else if (card) { card.style.opacity = '1'; showToast('❌ Delete failed'); }
            }
            else if (msg.type === 'secureUrlGenerated' && msg.secureUrl) {
                if (msg.action === 'copy') {
                    navigator.clipboard && navigator.clipboard.writeText(msg.secureUrl)
                        .then(function() { showToast('📋 Secure link copied!'); })
                        .catch(function() { showToast('❌ Copy failed'); });
                }
                else if (msg.action === 'gencode' && typeof msg.idx === 'number') {
                    generateCode(msg.secureUrl, msg.prompt, msg.idx);
                }
            }
        });
    </script>
</body>
</html>`;
}
