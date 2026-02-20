import { callLLM } from '../services/llm';

export class CreativePromptAgent {
    /**
     * Mengubah brief kreatif menjadi beberapa prompt gambar yang detail.
     * @param creativeBrief Ringkasan dari ContextAnalyzerAgent.
     * @returns Sebuah array berisi string prompt yang siap digunakan.
     */
    public static async generatePrompts(creativeBrief: string): Promise<string[]> {
        if (!creativeBrief) {
            return [];
        }

        const systemPrompt = `You are a master prompt engineer for image generation models like DALL-E 3. Based on the following creative brief, generate 3 distinct, detailed, and visually rich prompts. Each prompt should be on a new line and nothing else. Use descriptive keywords like "cinematic," "4k," "digital painting," "artstation," "vibrant colors," etc.

        Brief: "${creativeBrief}"`;

        const promptsResult = await callLLM(creativeBrief, systemPrompt);

        if (!promptsResult) {
            return [];
        }

        // Memisahkan hasil menjadi beberapa prompt berdasarkan baris baru
        return promptsResult.split('\n').filter(p => p.trim() !== '');
    }
}
