import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { callLLM } from '../services/llm';

export class ContextAnalyzerAgent {
    /**
     * Menganalisis URI (file atau folder) yang diberikan dan mengembalikan ringkasan entitas.
     * @param resourceUri URI dari file atau folder yang akan dianalisis.
     * @returns Sebuah string yang berisi ringkasan atau 'brief' kreatif.
     */
    public static async analyze(resourceUri: vscode.Uri): Promise<string> {
        try {
            const content = await this.readResource(resourceUri);
            if (!content) {
                vscode.window.showErrorMessage('File atau folder kosong.');
                return '';
            }

            const systemPrompt = `You are an expert game asset analyst. Your task is to read the provided code or file content and identify key entities, atmosphere, and objects that need visual assets. Summarize your findings in a concise creative brief. For example: "A brave knight character with a fire sword, a dark and foggy forest environment, and a healing potion item."`;
            
            // Memanggil LLM untuk menganalisis konten
            const analysisResult = await callLLM(content, systemPrompt);

            return analysisResult ?? '';

        } catch (error) {
            console.error('Error during analysis:', error);
            vscode.window.showErrorMessage('Gagal menganalisis konteks.');
            return '';
        }
    }

    /**
     * Membaca konten dari file atau semua file dalam sebuah folder.
     */
    private static async readResource(uri: vscode.Uri): Promise<string> {
        const stats = await fs.stat(uri.fsPath);
        if (stats.isDirectory()) {
            // Jika folder, baca semua file di dalamnya (implementasi sederhana)
            const files = await fs.readdir(uri.fsPath);
            let combinedContent = '';
            for (const file of files) {
                const filePath = path.join(uri.fsPath, file);
                const fileStats = await fs.stat(filePath);
                if (fileStats.isFile()) {
                    combinedContent += await fs.readFile(filePath, 'utf-8') + '\n\n';
                }
            }
            return combinedContent;
        } else {
            // Jika file, baca isinya
            return fs.readFile(uri.fsPath, 'utf-8');
        }
    }
}
