/**
 * chatStyles.ts — CSS styles for the OCLite Chat webview
 */
export function getChatStyles(): string {
    return `
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            padding: 0;
            display: flex;
            flex-direction: column;
            height: 100vh;
        }
        .header {
            padding: 8px 12px;
            font-weight: 600;
            font-size: 13px;
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        .header-title { display: flex; align-items: center; }
        .header-controls { display: flex; gap: 6px; }
        #chat {
            flex: 1;
            overflow-y: auto;
            padding: 10px 12px;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .msg {
            padding: 8px 10px;
            border-radius: 6px;
            line-height: 1.45;
            word-wrap: break-word;
            white-space: pre-wrap;
            max-width: 95%;
        }
        .user {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            align-self: flex-end;
            border-bottom-right-radius: 2px;
        }
        .ai {
            background: var(--vscode-editor-inactiveSelectionBackground, var(--vscode-editor-background));
            border: 1px solid var(--vscode-panel-border);
            align-self: flex-start;
            border-bottom-left-radius: 2px;
        }
        .ai .label { font-weight: 600; margin-bottom: 4px; }
        .code-block {
            position: relative;
            background: var(--vscode-textCodeBlock-background, #1e1e1e);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            margin: 6px 0;
            padding: 8px 10px;
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
            overflow-x: auto;
            white-space: pre;
        }
        .insert-btn {
            position: absolute;
            top: 4px; right: 4px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 3px;
            padding: 2px 8px;
            font-size: 11px;
            cursor: pointer;
            opacity: 0;
            transition: opacity 0.15s;
        }
        .code-block:hover .insert-btn { opacity: 1; }
        .typing { display: flex; gap: 4px; padding: 8px 10px; align-self: flex-start; }
        .typing span {
            width: 6px; height: 6px;
            background: var(--vscode-foreground);
            border-radius: 50%;
            opacity: 0.4;
            animation: blink 1.2s infinite;
        }
        .typing span:nth-child(2) { animation-delay: 0.2s; }
        .typing span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes blink { 0%, 80%, 100% { opacity: 0.4; } 40% { opacity: 1; } }
        .input-area {
            padding: 8px 12px 12px;
            border-top: 1px solid var(--vscode-panel-border);
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        textarea {
            width: 100%;
            resize: none;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
            border-radius: 4px;
            padding: 8px;
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            outline: none;
        }
        textarea:focus { border-color: var(--vscode-focusBorder); }
        .send-btn {
            width: 100%;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            padding: 8px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            touch-action: manipulation;
        }
        .send-btn:hover { background: var(--vscode-button-hoverBackground); }
        .send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .welcome { text-align: center; padding: 24px 16px; opacity: 0.7; }
        .welcome .icon { font-size: 32px; margin-bottom: 8px; }
        .welcome p { margin-top: 6px; font-size: 12px; }
        .quick-btn {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: 1px solid var(--vscode-button-border, transparent);
            border-radius: 4px;
            padding: 8px 12px;
            font-size: 11px;
            cursor: pointer;
            touch-action: manipulation;
            transition: background 0.2s;
        }
        .quick-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
        .enhanced-btn {
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 12px 16px;
            min-width: 120px;
            background: linear-gradient(135deg, var(--vscode-button-secondaryBackground), var(--vscode-editor-inactiveSelectionBackground));
            border: 1px solid var(--vscode-focusBorder);
            position: relative;
            overflow: hidden;
            border-radius: 8px;
            touch-action: manipulation;
        }
        .enhanced-btn:hover {
            background: linear-gradient(135deg, var(--vscode-button-secondaryHoverBackground), var(--vscode-list-hoverBackground));
            border-color: var(--vscode-button-foreground);
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        .enhanced-btn.loading { opacity: 0.7; pointer-events: none; }
        .enhanced-btn.loading::after {
            content: '';
            position: absolute;
            top: 0; left: -100%;
            width: 100%; height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
            animation: loading-shimmer 1.5s infinite;
        }
        @keyframes loading-shimmer { 0% { left: -100%; } 100% { left: 100%; } }
        .btn-icon { font-size: 18px; margin-bottom: 4px; }
        .btn-text { font-weight: 600; font-size: 11px; margin-bottom: 2px; }
        .btn-desc { font-size: 9px; opacity: 0.8; text-align: center; line-height: 1.2; }

        /* History Panel */
        .history-panel {
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background: var(--vscode-editor-background);
            z-index: 1000;
            display: flex;
            flex-direction: column;
            visibility: hidden;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.15s;
        }
        .history-panel.visible { visibility: visible; pointer-events: all; opacity: 1; }
        .history-header {
            padding: 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-weight: 600;
        }
        .history-content { flex: 1; overflow-y: auto; padding: 8px; }
        .session-item {
            padding: 12px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            margin-bottom: 8px;
            cursor: pointer;
            transition: all 0.2s;
            background: var(--vscode-editor-inactiveSelectionBackground);
        }
        .session-item:hover { background: var(--vscode-list-hoverBackground); border-color: var(--vscode-focusBorder); }
        .session-item.active { background: var(--vscode-list-activeSelectionBackground); border-color: var(--vscode-focusBorder); }
        .session-title { font-weight: 600; margin-bottom: 4px; font-size: 13px; }
        .session-meta { font-size: 11px; opacity: 0.7; display: flex; justify-content: space-between; align-items: center; }
        .session-actions { display: flex; gap: 4px; }
        .session-delete-btn {
            background: #c62828; color: white;
            border: none; border-radius: 4px;
            padding: 4px 10px; font-size: 11px; cursor: pointer;
            min-height: 28px; touch-action: manipulation;
        }
        .session-delete-btn:hover { background: #b71c1c; }
        .history-stats { padding: 12px; border-top: 1px solid var(--vscode-panel-border); font-size: 11px; opacity: 0.8; text-align: center; }
        .history-actions { padding: 8px 12px; border-top: 1px solid var(--vscode-panel-border); display: flex; gap: 8px; }
        .history-action-btn {
            flex: 1;
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none; border-radius: 4px;
            padding: 8px; font-size: 12px; cursor: pointer;
            min-height: 32px; touch-action: manipulation;
        }
        .history-action-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
        .history-action-btn.danger { background: #c62828; color: white; }
        .history-action-btn.danger:hover { background: #b71c1c; }
    `;
}
