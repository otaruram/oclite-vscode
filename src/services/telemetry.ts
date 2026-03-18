/**
 * telemetry.ts — Application Insights integration via @vscode/extension-telemetry.
 *
 * The connection string is embedded (encrypted) — no manual configuration needed.
 * Respects the user's VS Code telemetry setting ("telemetry.telemetryLevel").
 */
import { TelemetryReporter } from '@vscode/extension-telemetry';
import * as vscode from 'vscode';
import { getTelemetryConnectionString as getEmbeddedTelemetryCs } from '../utilities/secrets';

// ── State ──────────────────────────────────────────────────────────────────
let _reporter: TelemetryReporter | null = null;

/**
 * Initialize the telemetry reporter.
 * Uses the encrypted embedded connection string — zero user input.
 */
export async function initializeTelemetry(context: vscode.ExtensionContext): Promise<void> {
    const connectionString = getEmbeddedTelemetryCs();
    if (!connectionString) {
        console.log('[OCLite Telemetry] No connection string — telemetry disabled.');
        return;
    }

    const extensionId = context.extension.id;
    const extensionVersion = context.extension.packageJSON.version;

    if (_reporter) {
        _reporter.dispose();
    }

    _reporter = new TelemetryReporter(connectionString);
    context.subscriptions.push(_reporter);

    console.log(`[OCLite Telemetry] Initialized for ${extensionId} v${extensionVersion}`);

    sendTelemetryEvent('extension.activated', {
        version: extensionVersion,
        platform: process.platform,
        nodeVersion: process.version,
    });
}

/**
 * Send a telemetry event to Application Insights.
 */
export function sendTelemetryEvent(
    eventName: string,
    properties?: { [key: string]: string },
    measurements?: { [key: string]: number }
): void {
    if (_reporter) {
        _reporter.sendTelemetryEvent(eventName, properties, measurements);
    } else {
        console.warn('[OCLite Telemetry] Reporter not initialized. Cannot send event:', eventName);
    }
}

/**
 * Dispose the telemetry reporter.
 */
export function disposeTelemetry(): void {
    if (_reporter) {
        _reporter.dispose();
        _reporter = null;
        console.log('[OCLite Telemetry] Reporter disposed.');
    }
}