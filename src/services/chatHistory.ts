/**
 * chatHistory.ts — Service untuk mengelola chat history
 */
import * as vscode from 'vscode';
import { sendTelemetryEvent } from './telemetry';

export interface ChatMessage {
    id: string;
    type: 'user' | 'ai';
    content: string;
    timestamp: number;
    attachedFileName?: string;
    attachedImage?: string;
}

export interface ChatSession {
    id: string;
    title: string;
    messages: ChatMessage[];
    createdAt: number;
    lastModified: number;
}

export class ChatHistoryService {
    private static readonly STORAGE_KEY = 'oclite.chatHistory';
    private static readonly MAX_SESSIONS = 50; // Maksimal 50 session
    private static readonly MAX_MESSAGES_PER_SESSION = 100; // Maksimal 100 pesan per session

    constructor(private context: vscode.ExtensionContext) {}

    /**
     * Mendapatkan semua chat sessions
     */
    getAllSessions(): ChatSession[] {
        const sessions = this.context.globalState.get<ChatSession[]>(ChatHistoryService.STORAGE_KEY, []);
        return sessions.sort((a, b) => b.lastModified - a.lastModified);
    }

    /**
     * Mendapatkan session berdasarkan ID
     */
    getSession(sessionId: string): ChatSession | undefined {
        const sessions = this.getAllSessions();
        return sessions.find(s => s.id === sessionId);
    }

    /**
     * Membuat session baru
     */
    createNewSession(): ChatSession {
        const newSession: ChatSession = {
            id: this.generateId(),
            title: `Chat ${new Date().toLocaleDateString('id-ID')} ${new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`,
            messages: [],
            createdAt: Date.now(),
            lastModified: Date.now()
        };

        const sessions = this.getAllSessions();
        sessions.unshift(newSession);

        // Batasi jumlah session
        if (sessions.length > ChatHistoryService.MAX_SESSIONS) {
            sessions.splice(ChatHistoryService.MAX_SESSIONS);
        }

        this.saveSessions(sessions);
        
        sendTelemetryEvent('chat.session.created', {
            sessionId: newSession.id,
            totalSessions: sessions.length.toString()
        });

        return newSession;
    }

    /**
     * Menambahkan pesan ke session
     */
    addMessage(sessionId: string, message: Omit<ChatMessage, 'id' | 'timestamp'>): ChatMessage {
        const sessions = this.getAllSessions();
        const sessionIndex = sessions.findIndex(s => s.id === sessionId);
        
        if (sessionIndex === -1) {
            throw new Error(`Session ${sessionId} not found`);
        }

        const newMessage: ChatMessage = {
            ...message,
            id: this.generateId(),
            timestamp: Date.now()
        };

        sessions[sessionIndex].messages.push(newMessage);
        sessions[sessionIndex].lastModified = Date.now();

        // Batasi jumlah pesan per session
        if (sessions[sessionIndex].messages.length > ChatHistoryService.MAX_MESSAGES_PER_SESSION) {
            sessions[sessionIndex].messages.splice(0, sessions[sessionIndex].messages.length - ChatHistoryService.MAX_MESSAGES_PER_SESSION);
        }

        // Update title berdasarkan pesan pertama user jika masih default
        if (sessions[sessionIndex].title.startsWith('Chat ') && message.type === 'user' && message.content.trim()) {
            const firstWords = message.content.trim().split(' ').slice(0, 4).join(' ');
            sessions[sessionIndex].title = firstWords.length > 30 ? firstWords.substring(0, 30) + '...' : firstWords;
        }

        this.saveSessions(sessions);

        sendTelemetryEvent('chat.message.saved', {
            sessionId,
            messageType: message.type,
            messageLength: message.content.length.toString()
        });

        return newMessage;
    }

    /**
     * Menghapus session
     */
    deleteSession(sessionId: string): boolean {
        const sessions = this.getAllSessions();
        const initialLength = sessions.length;
        const filteredSessions = sessions.filter(s => s.id !== sessionId);
        
        if (filteredSessions.length < initialLength) {
            this.saveSessions(filteredSessions);
            
            sendTelemetryEvent('chat.session.deleted', {
                sessionId,
                remainingSessions: filteredSessions.length.toString()
            });
            
            return true;
        }
        
        return false;
    }

    /**
     * Menghapus semua history
     */
    clearAllHistory(): void {
        this.context.globalState.update(ChatHistoryService.STORAGE_KEY, []);
        
        sendTelemetryEvent('chat.history.cleared', {
            action: 'all_sessions_deleted'
        });
    }

    /**
     * Update session title
     */
    updateSessionTitle(sessionId: string, newTitle: string): boolean {
        const sessions = this.getAllSessions();
        const sessionIndex = sessions.findIndex(s => s.id === sessionId);
        
        if (sessionIndex === -1) {
            return false;
        }

        sessions[sessionIndex].title = newTitle.trim() || sessions[sessionIndex].title;
        sessions[sessionIndex].lastModified = Date.now();
        
        this.saveSessions(sessions);
        
        sendTelemetryEvent('chat.session.title_updated', {
            sessionId,
            titleLength: newTitle.length.toString()
        });
        
        return true;
    }

    /**
     * Mendapatkan statistik history
     */
    getHistoryStats(): { totalSessions: number; totalMessages: number; oldestSession?: Date } {
        const sessions = this.getAllSessions();
        const totalMessages = sessions.reduce((sum, session) => sum + session.messages.length, 0);
        const oldestSession = sessions.length > 0 ? new Date(Math.min(...sessions.map(s => s.createdAt))) : undefined;

        return {
            totalSessions: sessions.length,
            totalMessages,
            oldestSession
        };
    }

    /**
     * Export chat history sebagai JSON
     */
    exportHistory(): string {
        const sessions = this.getAllSessions();
        const exportData = {
            exportedAt: new Date().toISOString(),
            version: '1.0',
            sessions: sessions.map(session => ({
                ...session,
                messages: session.messages.map(msg => ({
                    ...msg,
                    // Hapus data binary untuk mengurangi ukuran export
                    attachedImage: msg.attachedImage ? '[IMAGE_DATA_REMOVED]' : undefined
                }))
            }))
        };

        sendTelemetryEvent('chat.history.exported', {
            sessionCount: sessions.length.toString(),
            messageCount: sessions.reduce((sum, s) => sum + s.messages.length, 0).toString()
        });

        return JSON.stringify(exportData, null, 2);
    }

    /**
     * Menyimpan sessions ke storage
     */
    private saveSessions(sessions: ChatSession[]): void {
        this.context.globalState.update(ChatHistoryService.STORAGE_KEY, sessions);
    }

    /**
     * Generate ID unik
     */
    private generateId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
}