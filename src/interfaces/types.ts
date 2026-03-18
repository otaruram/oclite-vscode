/**
 * interfaces/types.ts — Shared service interfaces for dependency injection.
 */

export interface ILLMService {
    callLLM(
        userMessage: string,
        systemPrompt: string,
        timeoutMs?: number,
        imageUrl?: string
    ): Promise<string | null>;
}

export interface ITelemetryService {
    sendTelemetryEvent(
        eventName: string,
        properties?: Record<string, string>,
        measurements?: Record<string, number>
    ): void;
}
