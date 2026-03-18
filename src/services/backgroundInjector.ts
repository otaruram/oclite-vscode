import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

const CSS_START = '/* OCLITE_BG_START */';
const CSS_END = '/* OCLITE_BG_END */';

function getCssPath(): string | null {
    try {
        const appRoot = vscode.env.appRoot;
        const cssPath = path.join(appRoot, 'out', 'vs', 'workbench', 'workbench.desktop.main.css');
        if (fs.existsSync(cssPath)) {
            return cssPath;
        }
    } catch (e) {
        console.error('Failed to resolve VS Code CSS path:', e);
    }
    return null;
}

/** Remove ALL oclite injections — handles multiple blocks and leftover fragments */
function removeAllInjections(cssContent: string): string {
    let result = cssContent;
    // Remove all marker blocks
    let startIdx = result.indexOf(CSS_START);
    while (startIdx !== -1) {
        const endIdx = result.indexOf(CSS_END, startIdx);
        if (endIdx === -1) {
            // Unclosed block — remove from start to end of file
            result = result.substring(0, startIdx);
            break;
        }
        result = result.substring(0, startIdx) + result.substring(endIdx + CSS_END.length);
        startIdx = result.indexOf(CSS_START);
    }
    return result;
}

export async function setVsCodeBackground(imageUrl: string): Promise<boolean> {
    const cssPath = getCssPath();
    if (!cssPath) {
        vscode.window.showErrorMessage("❌ OCLite: Could not locate VS Code core CSS file.");
        return false;
    }

    try {
        let cssContent = fs.readFileSync(cssPath, 'utf-8');

        // Always clean up all previous injections first
        cssContent = removeAllInjections(cssContent);

        // Inject ONLY to the editor content area — nothing else
        // Uses stacked background-image (gradient overlay + image) so no ::before pseudo-element
        // is needed, which means pointer-events are never blocked anywhere
        const newCss = `
${CSS_START}
/* OCLite: Background image — editor coding area ONLY */
/* Sidebar, panel, activitybar, statusbar, titlebar stay at their original colors */

.monaco-workbench .part.editor > .content {
    background-image:
        linear-gradient(rgba(30,30,30,0.86), rgba(30,30,30,0.86)),
        url('${imageUrl}') !important;
    background-size: cover !important;
    background-position: center !important;
    background-repeat: no-repeat !important;
}

/* Make sure editor and its children are transparent so the bg shows through */
.monaco-workbench .part.editor > .content .editor-group-container,
.monaco-workbench .part.editor > .content .editor-container {
    background: transparent !important;
}

.monaco-editor,
.monaco-editor .overflow-guard,
.monaco-editor-background {
    background: transparent !important;
}

/* Explicitly block image from leaking into sidebar/panel/webview/activitybar */
.monaco-workbench .part.sidebar,
.monaco-workbench .part.panel,
.monaco-workbench .part.activitybar,
.monaco-workbench .part.statusbar,
.monaco-workbench .part.titlebar,
.monaco-workbench .part.auxiliarybar,
.monaco-workbench .webview,
.monaco-workbench .webview iframe {
    background-image: none !important;
}
${CSS_END}
`;

        cssContent += newCss;
        fs.writeFileSync(cssPath, cssContent, 'utf-8');

        const action = await vscode.window.showInformationMessage(
            "🖼️ OCLite Background applied to editor area only. Restart VS Code to see changes.",
            "Restart Now", "Later"
        );
        if (action === "Restart Now") {
            vscode.commands.executeCommand("workbench.action.reloadWindow");
        }
        return true;
    } catch (e: any) {
        vscode.window.showErrorMessage(`❌ OCLite: Failed to set background. Run VS Code as Administrator. Error: ${e.message}`);
        return false;
    }
}

export async function removeVsCodeBackground(): Promise<boolean> {
    const cssPath = getCssPath();
    if (!cssPath) {
        vscode.window.showErrorMessage("❌ OCLite: Could not locate VS Code core CSS file.");
        return false;
    }

    try {
        let cssContent = fs.readFileSync(cssPath, 'utf-8');
        const hadInjection = cssContent.includes(CSS_START);

        cssContent = removeAllInjections(cssContent);
        fs.writeFileSync(cssPath, cssContent, 'utf-8');

        if (hadInjection) {
            const action = await vscode.window.showInformationMessage(
                "🗑️ OCLite Background removed. Restart VS Code to apply changes.",
                "Restart Now", "Later"
            );
            if (action === "Restart Now") {
                vscode.commands.executeCommand("workbench.action.reloadWindow");
            }
        } else {
            vscode.window.showInformationMessage("ℹ️ No OCLite background injection found.");
        }
        return true;
    } catch (e: any) {
        vscode.window.showErrorMessage(`❌ OCLite: Failed to remove background. Run VS Code as Administrator. Error: ${e.message}`);
        return false;
    }
}
