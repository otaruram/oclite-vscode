/**
 * secrets.ts — Runtime decryption for sensitive configuration values.
 *
 * All API endpoints, keys, and tokens are stored as XOR-encrypted byte arrays.
 * They are NEVER present as readable strings in the compiled JavaScript output.
 *
 * This module provides:
 *  1. `xorDecode()` — Decrypts a byte array back to a string at runtime.
 *  2. `xorEncode()` — Encrypts a string into a byte array (dev utility only).
 *  3. `generateRequestSignature()` — Creates a per-request HMAC-like signature
 *     so the Azure Function URL cannot be trivially reused outside the extension.
 *
 * Security layers:
 *  - Strings never appear in plain text in source or compiled output.
 *  - Webpack minification mangles variable names, making reverse-engineering harder.
 *  - Request signatures tie each API call to a timestamp + extension identity.
 */

// ── Cipher key (derived from extension identity, NOT a readable word) ──────
// This is intentionally split and computed to avoid appearing as a pattern.
const _CK: number[] = (() => {
    const a = [0x39, 0x6B, 0x21, 0x58, 0x40, 0x7E, 0x33, 0x4C];
    const b = [0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88];
    return a.map((v, i) => v ^ b[i]);
})();

/**
 * Decrypt a XOR-encrypted byte array back to a UTF-8 string.
 * The cipher key is derived at runtime to avoid static patterns.
 */
export function xorDecode(encoded: number[]): string {
    const keyLen = _CK.length;
    return encoded
        .map((byte, i) => String.fromCharCode(byte ^ _CK[i % keyLen]))
        .join('');
}

/**
 * Encrypt a plain-text string into a XOR byte array.
 * **Dev utility only** — used to pre-compute encrypted values.
 * Do NOT ship this in production; it's here for convenience during development.
 */
export function xorEncode(plaintext: string): number[] {
    const keyLen = _CK.length;
    return Array.from(plaintext).map(
        (char, i) => char.charCodeAt(0) ^ _CK[i % keyLen],
    );
}

/**
 * Generate a time-based request signature for API calls.
 *
 * Format: `oclite-<timestamp>-<hash>`
 *
 * The hash is a lightweight checksum derived from the timestamp + a secret salt.
 * This prevents casual replay of the Azure Function URL outside the extension.
 */
export function generateRequestSignature(): { signature: string; timestamp: number } {
    const timestamp = Date.now();

    // Simple but effective: rotate through XOR operations on timestamp digits
    const tsStr = timestamp.toString();
    let hash = 0;
    for (let i = 0; i < tsStr.length; i++) {
        hash = ((hash << 5) - hash + tsStr.charCodeAt(i) * _CK[i % _CK.length]) | 0;
    }

    const signature = `oclite-${timestamp}-${Math.abs(hash).toString(36)}`;
    return { signature, timestamp };
}
