import * as vscode from 'vscode';

export function registerCanvasCommands(context: vscode.ExtensionContext): void {
    const push = (...d: vscode.Disposable[]) => d.forEach((x) => context.subscriptions.push(x));

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
}
