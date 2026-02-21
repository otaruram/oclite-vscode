/**
 * telemetry.ts — Application Insights integration via @vscode/extension-telemetry.
 *
 * Tracks anonymised usage events so the developer can understand
 * how the extension is being used (no user data, no prompts, no images).
 *
 * The package automatically respects the user's VS Code telemetry setting
 * ("telemetry.telemetryLevel"). If the user has disabled telemetry, no
 * events are sent. This is the Microsoft-recommended approach.
 */
import { TelemetryReporter } from '@vscode/extension-telemetry';
import * as vscode from 'vscode';

// ── Secure Application Insights Configuration ─────────────────────────────
const TELEMETRY_SECRET_KEY = 'oclite.telemetry.connectionString';
let _reporter: TelemetryReporter | null = null;
let _context: vscode.ExtensionContext | null = null;

/**
 * Configure the telemetry connection string securely.
 * This should be called once during setup with the actual connection string.
 */
export async function configureTelemetryConnectionString(
    context: vscode.ExtensionContext,
    connectionString: string
): Promise<void> {
    await context.secrets.store(TELEMETRY_SECRET_KEY, connectionString);
    console.log('[OCLite Telemetry] Connection string configured securely.');
    
    // Reinitialize if context is available
    if (_context) {
        await initializeTelemetry(_context);
    }
}

/**
 * Get the telemetry connection string from secure storage.
 */
async function getTelemetryConnectionString(): Promise<string | undefined> {
    if (!_context) {
        console.warn('[OCLite Telemetry] Context not available for secure storage access.');
        return undefined;
    }
    return await _context.secrets.get(TELEMETRY_SECRET_KEY);
}

/**
 * Initialize the telemetry reporter.
 * Call once from `extension.ts` activate(), passing the extension context.
 */
export async function initializeTelemetry(context: vscode.ExtensionContext): Promise<void> {
    _context = context;
    
    const connectionString = await getTelemetryConnectionString();
    if (!connectionString) {
        console.log('[OCLite Telemetry] Connection string not configured — telemetry disabled.');
        console.log('[OCLite Telemetry] Use "OCLite: Configure Telemetry" command to set up Application Insights.');
        return;
    }

    const extensionId = context.extension.id;
    const extensionVersion = context.extension.packageJSON.version;

    // Dispose existing reporter if any
    if (_reporter) {
        _reporter.dispose();
    }

    _reporter = new TelemetryReporter(connectionString);
    context.subscriptions.push(_reporter);

    console.log(`[OCLite Telemetry] Initialized securely for ${extensionId} v${extensionVersion}`);

    // Send initialization event
    sendTelemetryEvent('extension.activated', {
        version: extensionVersion,
        platform: process.platform,
        nodeVersion: process.version
    });
}

/**
 * Send a telemetry event to Application Insights.
 *
 * @param eventName — A descriptive name for the event (e.g., 'generateImage.success').
 * @param properties — Optional: A key-value map of custom properties (string: string).
 * @param measurements — Optional: A key-value map of custom measurements (string: number).
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
 * Call this during extension deactivation.
 */
export function disposeTelemetry(): void {
    if (_reporter) {
        _reporter.dispose();
        _reporter = null;
        console.log('[OCLite Telemetry] Reporter disposed.');
    }
}