/**
 * services/rateLimit.ts — Simple per-user rate limiting.
 */
import * as vscode from 'vscode';
import { sendTelemetryEvent } from './telemetry';
import { hashUserId } from './auth';

const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10;

const _rateLimitMap = new Map<string, { count: number; resetTime: number }>();

/**
 * Check rate limit for a user. Returns true if allowed.
 * Shows a warning and returns false if limit exceeded.
 */
export function checkRateLimit(userId: string): boolean {
    const now = Date.now();
    const entry = _rateLimitMap.get(userId);

    if (!entry || now > entry.resetTime) {
        _rateLimitMap.set(userId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
        return true;
    }

    if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
        const wait = Math.ceil((entry.resetTime - now) / 1000);
        vscode.window.showWarningMessage(`⚡ Rate limit reached. Please wait ${wait} seconds.`);
        sendTelemetryEvent('blob.rateLimit.hit', { userId: hashUserId(userId) });
        return false;
    }

    entry.count++;
    return true;
}

/**
 * Get current rate-limit status for a user.
 */
export function getRateLimitStatus(userId: string): { remaining: number; resetTime: number } {
    const entry = _rateLimitMap.get(userId);
    if (!entry) {
        return { remaining: MAX_REQUESTS_PER_WINDOW, resetTime: 0 };
    }
    return {
        remaining: Math.max(0, MAX_REQUESTS_PER_WINDOW - entry.count),
        resetTime: entry.resetTime,
    };
}
