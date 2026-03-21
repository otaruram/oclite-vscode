/**
 * services/auth.ts — Microsoft Authentication for OCLite.
 *
 * Handles:
 * - Mandatory auth gate at activation
 * - Session management (get, sign-in, sign-out)
 * - User ID hashing for privacy
 */
import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { sendTelemetryEvent } from './telemetry';

const MS_AUTH_PROVIDER_ID = 'microsoft';
const MS_AUTH_SCOPES = ['https://graph.microsoft.com/User.Read'];

/** Hash a user ID for privacy in telemetry/storage paths. */
export function hashUserId(userId: string): string {
    return crypto.createHash('sha256').update(userId).digest('hex').substring(0, 8);
}

/**
 * Optional auth check — returns session or null without blocking extension.
 * UI features work without auth, but cloud features require sign-in.
 */
export async function getOptionalMicrosoftAuth(): Promise<vscode.AuthenticationSession | null> {
    try {
        // Try to get existing session silently
        const existing = await vscode.authentication.getSession(MS_AUTH_PROVIDER_ID, MS_AUTH_SCOPES, { silent: true });
        return existing ?? null;
    } catch {
        // No existing session, that's fine
        return null;
    }
}
export async function requireMicrosoftAuth(): Promise<vscode.AuthenticationSession | null> {
    let session: vscode.AuthenticationSession | null = null;

    // 1. Try silent (existing session)
    try {
        const existing = await vscode.authentication.getSession(MS_AUTH_PROVIDER_ID, MS_AUTH_SCOPES, { silent: true });
        session = existing ?? null;
    } catch {
        // No existing session
    }

    if (session) {
        return session;
    }

    // 2. Prompt user with modal
    const loginChoice = await vscode.window.showInformationMessage(
        '🎨 Welcome to OCLite! Sign in with Microsoft to get started.',
        {
            modal: true,
            detail: 'Microsoft authentication is required to use OCLite features including AI image generation, cloud gallery, and sharing.',
        },
        'Sign in with Microsoft'
    );

    if (loginChoice === 'Sign in with Microsoft') {
        try {
            const created = await vscode.authentication.getSession(MS_AUTH_PROVIDER_ID, MS_AUTH_SCOPES, { createIfNone: true });
            session = created ?? null;
        } catch (authError: any) {
            vscode.window.showErrorMessage(
                '❌ Microsoft sign-in is required to use OCLite. Please restart the extension and sign in.',
                'Try Again'
            ).then((sel) => {
                if (sel === 'Try Again') {
                    vscode.commands.executeCommand('workbench.action.reloadWindow');
                }
            });
            return null;
        }
    }

    if (!session) {
        vscode.window.showWarningMessage(
            '⚠️ OCLite requires Microsoft sign-in. Extension features are disabled.',
            'Sign In Now'
        ).then((sel) => {
            if (sel === 'Sign In Now') {
                vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
        });
    }

    return session;
}

/**
 * Interactive sign-in (e.g. from command palette).
 * Returns the new session or null.
 */
export async function signInMicrosoft(): Promise<vscode.AuthenticationSession | null> {
    try {
        const session = await vscode.authentication.getSession(MS_AUTH_PROVIDER_ID, MS_AUTH_SCOPES, { createIfNone: true });
        if (session) {
            vscode.window.showInformationMessage(`✅ Signed in as ${session.account.label}`);
            sendTelemetryEvent('command.signIn.success');
            return session;
        }
        vscode.window.showErrorMessage('❌ Microsoft sign-in failed');
        sendTelemetryEvent('command.signIn.failed');
    } catch (error: any) {
        vscode.window.showErrorMessage(`❌ Sign-in error: ${error.message}`);
        sendTelemetryEvent('command.signIn.error', { error: error.message });
    }
    return null;
}

/**
 * Get a user-specific container path for storage isolation.
 */
export function getUserContainerPath(session: vscode.AuthenticationSession): string {
    return `users/${hashUserId(session.account.id)}`;
}
