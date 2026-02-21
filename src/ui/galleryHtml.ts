/**
 * ui/galleryHtml.ts — Gallery webview HTML builder.
 */
import { GalleryImage } from '../types';

export function createGalleryHtml(images: GalleryImage[]): string {
    const imageCards = images
        .map((img) => {
            const safePrompt = img.originalPrompt.replace(/'/g, "\\'").replace(/"/g, '&quot;');
            return `
            <div class="image-card">
                <img src="${img.url}" alt="${safePrompt}" loading="lazy" />
                <div class="image-info">
                    <h3>${img.originalPrompt}</h3>
                    <p><strong>Model:</strong> ${img.model}</p>
                    <p><strong>Generated:</strong> ${img.lastModified.toLocaleDateString()}</p>
                    <div class="sharing-actions">
                        <a href="${img.url}" target="_blank" class="action-link">🔗 View Full Size</a>
                        <button onclick="copyToClipboard('${img.shareUrl}')" class="action-link copy-btn">📋 Copy Image Link</button>
                    </div>
                </div>
            </div>`;
        })
        .join('');

    return /* html */ `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OCLite Gallery</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            padding: 20px;
            margin: 0;
        }
        .gallery-header { text-align: center; margin-bottom: 30px; }
        .gallery-header h1 { margin: 0 0 10px 0; font-size: 24px; }
        .gallery-header p { color: var(--vscode-descriptionForeground); margin: 0; }
        .gallery-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
            gap: 25px;
        }
        .image-card {
            background: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 12px; overflow: hidden;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .image-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(0,0,0,0.2);
        }
        .image-card img { width: 100%; height: 220px; object-fit: cover; }
        .image-info { padding: 18px; }
        .image-info h3 {
            margin: 0 0 12px 0; font-size: 14px; font-weight: 600;
            color: var(--vscode-editor-foreground); line-height: 1.3;
        }
        .image-info p { margin: 6px 0; font-size: 12px; opacity: 0.8; }
        .sharing-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 15px; }
        .action-link {
            display: inline-block; padding: 8px 12px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            text-decoration: none; border-radius: 6px; font-size: 12px;
            font-weight: 500; text-align: center; border: none;
            cursor: pointer; font-family: inherit;
            transition: background-color 0.2s ease;
        }
        .action-link:hover { background: var(--vscode-button-hoverBackground); }
        .copy-btn {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .copy-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
        .toast {
            position: fixed; top: 20px; right: 20px;
            background: var(--vscode-notifications-background);
            color: var(--vscode-notifications-foreground);
            padding: 12px 16px; border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2); z-index: 1000;
            opacity: 0; transform: translateX(100%);
            transition: all 0.3s ease;
        }
        .toast.show { opacity: 1; transform: translateX(0); }
    </style>
</head>
<body>
    <div class="gallery-header">
        <h1>🎨 Your OCLite Gallery</h1>
        <p>AI-generated images stored on cloud</p>
    </div>
    <div class="gallery-grid">${imageCards}</div>
    <div id="toast" class="toast"></div>
    <script>
        function copyToClipboard(url) {
            navigator.clipboard.writeText(url).then(() => {
                showToast('📋 Image link copied!');
            }).catch(() => {
                const ta = document.createElement('textarea');
                ta.value = url;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                showToast('📋 Image link copied!');
            });
        }
        function showToast(msg) {
            const t = document.getElementById('toast');
            t.textContent = msg; t.classList.add('show');
            setTimeout(() => t.classList.remove('show'), 3000);
        }
    </script>
</body>
</html>`;
}
