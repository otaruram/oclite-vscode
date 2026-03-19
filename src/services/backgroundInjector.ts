import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

const CSS_START = '/* OCLITE_BG_START */';
const CSS_END = '/* OCLITE_BG_END */';

// Key used to mark colorCustomizations set by OCLite
const THEME_MARKER_KEY = 'oclite.themeApplied';

function getCssPath(): string | null {
    try {
        const appRoot = vscode.env.appRoot;
        const cssPath = path.join(appRoot, 'out', 'vs', 'workbench', 'workbench.desktop.main.css');
        if (fs.existsSync(cssPath)) { return cssPath; }
    } catch (e) {
        console.error('Failed to resolve VS Code CSS path:', e);
    }
    return null;
}

function removeAllInjections(cssContent: string): string {
    let result = cssContent;
    let startIdx = result.indexOf(CSS_START);
    while (startIdx !== -1) {
        const endIdx = result.indexOf(CSS_END, startIdx);
        if (endIdx === -1) { result = result.substring(0, startIdx); break; }
        result = result.substring(0, startIdx) + result.substring(endIdx + CSS_END.length);
        startIdx = result.indexOf(CSS_START);
    }
    return result;
}

// ── Background (CSS injection) ─────────────────────────────────────────────

export async function setVsCodeBackground(imageUrl: string): Promise<boolean> {
    const cssPath = getCssPath();
    if (!cssPath) {
        vscode.window.showErrorMessage('❌ OCLite: Could not locate VS Code core CSS file.');
        return false;
    }
    try {
        let cssContent = fs.readFileSync(cssPath, 'utf-8');
        cssContent = removeAllInjections(cssContent);
        const newCss = `
${CSS_START}
.monaco-workbench .part.editor > .content {
    background-image: linear-gradient(rgba(30,30,30,0.86), rgba(30,30,30,0.86)), url('${imageUrl}') !important;
    background-size: cover !important;
    background-position: center !important;
    background-repeat: no-repeat !important;
}
.monaco-workbench .part.editor > .content .editor-group-container,
.monaco-workbench .part.editor > .content .editor-container,
.monaco-editor, .monaco-editor .overflow-guard, .monaco-editor-background {
    background: transparent !important;
}
.monaco-workbench .part.sidebar, .monaco-workbench .part.panel,
.monaco-workbench .part.activitybar, .monaco-workbench .part.statusbar,
.monaco-workbench .part.titlebar, .monaco-workbench .part.auxiliarybar,
.monaco-workbench .webview, .monaco-workbench .webview iframe {
    background-image: none !important;
}
${CSS_END}
`;
        fs.writeFileSync(cssPath, cssContent + newCss, 'utf-8');
        const action = await vscode.window.showInformationMessage(
            '🖼️ Background applied. Restart VS Code to see changes.',
            'Restart Now', 'Later'
        );
        if (action === 'Restart Now') { vscode.commands.executeCommand('workbench.action.reloadWindow'); }
        return true;
    } catch (e: any) {
        vscode.window.showErrorMessage(`❌ OCLite: Failed to set background. Run VS Code as Administrator. Error: ${e.message}`);
        return false;
    }
}

export async function removeVsCodeBackground(): Promise<boolean> {
    const cssPath = getCssPath();
    if (!cssPath) {
        vscode.window.showErrorMessage('❌ OCLite: Could not locate VS Code core CSS file.');
        return false;
    }
    try {
        let cssContent = fs.readFileSync(cssPath, 'utf-8');
        const hadInjection = cssContent.includes(CSS_START);
        cssContent = removeAllInjections(cssContent);
        fs.writeFileSync(cssPath, cssContent, 'utf-8');
        if (hadInjection) {
            const action = await vscode.window.showInformationMessage(
                '🗑️ Background removed. Restart VS Code to apply.',
                'Restart Now', 'Later'
            );
            if (action === 'Restart Now') { vscode.commands.executeCommand('workbench.action.reloadWindow'); }
        } else {
            vscode.window.showInformationMessage('ℹ️ No OCLite background found.');
        }
        return true;
    } catch (e: any) {
        vscode.window.showErrorMessage(`❌ OCLite: Failed to remove background. Error: ${e.message}`);
        return false;
    }
}

// ── Theme (colorCustomizations) ────────────────────────────────────────────

/**
 * Extract dominant colors from an image URL using a hidden canvas in a temp webview,
 * then apply them as workbench.colorCustomizations.
 *
 * Since we can't use canvas in the extension host directly, we derive a simple
 * palette by fetching the image as a buffer and sampling pixel data via raw bytes.
 * For simplicity and no extra deps, we use a fixed dark palette derived from the
 * image's average hue — good enough for a theme effect.
 */
/**
 * Pick a random OCLite dark theme palette and apply it as workbench.colorCustomizations.
 * We no longer fetch the image (blob URLs may require auth), instead we cycle through
 * a set of curated palettes so the user always gets a visible change.
 */
export async function applyThemeFromImage(_imageUrl: string, context: vscode.ExtensionContext): Promise<boolean> {
    // Curated dark palettes: [bg, sidebar, titlebar, accent, border]
    const palettes = [
        { name: 'Ocean',    bg: '#0d1b2a', sidebar: '#0a1628', titlebar: '#071020', accent: '#38bdf8', border: '#1e3a5f' },
        { name: 'Forest',   bg: '#0d1f0d', sidebar: '#0a1a0a', titlebar: '#071407', accent: '#4ade80', border: '#1a3d1a' },
        { name: 'Sunset',   bg: '#1f0d0d', sidebar: '#1a0a0a', titlebar: '#140707', accent: '#fb923c', border: '#3d1a1a' },
        { name: 'Violet',   bg: '#130d1f', sidebar: '#0f0a1a', titlebar: '#0a0714', accent: '#a78bfa', border: '#2a1a3d' },
        { name: 'Rose',     bg: '#1f0d14', sidebar: '#1a0a10', titlebar: '#14070b', accent: '#fb7185', border: '#3d1a22' },
        { name: 'Slate',    bg: '#0f172a', sidebar: '#0c1322', titlebar: '#090f1a', accent: '#94a3b8', border: '#1e2d4a' },
        { name: 'Amber',    bg: '#1c1200', sidebar: '#170f00', titlebar: '#120c00', accent: '#fbbf24', border: '#3d2e00' },
        { name: 'Teal',     bg: '#0d1f1f', sidebar: '#0a1a1a', titlebar: '#071414', accent: '#2dd4bf', border: '#1a3d3d' },
    ];

    // Pick next palette (cycle based on stored index)
    const stored = context.globalState.get<number>('oclite.themeIndex', -1);
    const nextIdx = (stored + 1) % palettes.length;
    const p = palettes[nextIdx];

    try {
        const colorCustomizations = {
            'editor.background':                  p.bg,
            'sideBar.background':                 p.sidebar,
            'activityBar.background':             p.sidebar,
            'titleBar.activeBackground':          p.titlebar,
            'titleBar.inactiveBackground':        p.titlebar,
            'statusBar.background':               p.titlebar,
            'panel.background':                   p.sidebar,
            'tab.activeBackground':               p.bg,
            'tab.inactiveBackground':             p.sidebar,
            'editorGroupHeader.tabsBackground':   p.sidebar,
            'focusBorder':                        p.accent,
            'button.background':                  p.accent,
            'progressBar.background':             p.accent,
            'panelTitle.activeBorder':            p.accent,
            'sideBarSectionHeader.background':    p.border,
            'editorWidget.background':            p.sidebar,
            'dropdown.background':                p.sidebar,
            'input.background':                   p.border,
        };

        await vscode.workspace.getConfiguration().update(
            'workbench.colorCustomizations',
            colorCustomizations,
            vscode.ConfigurationTarget.Global
        );

        await context.globalState.update(THEME_MARKER_KEY, true);
        await context.globalState.update('oclite.themeIndex', nextIdx);

        vscode.window.showInformationMessage(`🎨 OCLite theme applied: ${p.name}`);
        sendTelemetryEventSafe('command.applyTheme.success');
        return true;
    } catch (e: any) {
        vscode.window.showErrorMessage(`❌ OCLite: Failed to apply theme. Error: ${e.message}`);
        return false;
    }
}

export async function removeOcliteTheme(context: vscode.ExtensionContext): Promise<boolean> {
    try {
        await vscode.workspace.getConfiguration().update(
            'workbench.colorCustomizations',
            undefined,
            vscode.ConfigurationTarget.Global
        );
        await context.globalState.update(THEME_MARKER_KEY, false);
        vscode.window.showInformationMessage('🗑️ OCLite theme removed. Colors restored to default.');
        sendTelemetryEventSafe('command.removeTheme.success');
        return true;
    } catch (e: any) {
        vscode.window.showErrorMessage(`❌ OCLite: Failed to remove theme. Error: ${e.message}`);
        return false;
    }
}

// Avoid circular import — telemetry is optional here
function sendTelemetryEventSafe(event: string): void {
    try {
        const { sendTelemetryEvent } = require('./telemetry');
        sendTelemetryEvent(event);
    } catch (_) {}
}
