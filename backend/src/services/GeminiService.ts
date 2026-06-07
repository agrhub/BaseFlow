import dotenv from 'dotenv';
const { GoogleGenAI } = require('@google/genai');

dotenv.config();

export class GeminiService {
  private static instance: GeminiService;
  private genAI: any;
  private modelId: string;

  private constructor() {
    const apiKey = process.env.GOOGLE_API_KEY || "";
    const vertexai = process.env.GOOGLE_GENAI_USE_VERTEXAI === '1';
    this.modelId = process.env.AGENT_MODEL || 'gemini-3.1-flash-lite';

    this.genAI = new GoogleGenAI({ vertexai, apiKey });
    
    console.log(`[GeminiService] Initialized with model: ${this.modelId} (VertexAI: ${vertexai})`);
  }

  public static getInstance(): GeminiService {
    if (!GeminiService.instance) {
      GeminiService.instance = new GeminiService();
    }
    return GeminiService.instance;
  }

  /**
   * Generates content using the configured model.
   * @param prompt The user-provided prompt or context.
   * @param systemInstruction The system instruction for the model.
   * @returns The text response from Gemini.
   */
  async generateContent(prompt: string | any[], systemInstruction?: string, responseMimeType?: string): Promise<string> {
    try {
      const response = await this.genAI.models.generateContent({
        model: this.modelId,
        contents: prompt,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.3,
          responseMimeType: responseMimeType,
        },
      });
      const text = response.text || '';
      return text;
    } catch (error: any) {
      console.error('[GeminiService] Error generating content:', error);
      throw error;
    }
  }

  /**
   * Generates JSON content and attempts to parse it.
   */
  async generateJSON<T>(prompt: string, systemInstruction?: string): Promise<T> {
    const text = await this.generateContent(prompt, systemInstruction, 'application/json');
    try {
      let jsonStr = text.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '');
      }
      return JSON.parse(jsonStr) as T;
    } catch (parseErr) {
      console.error('[GeminiService] Failed to parse JSON response:', text);
      throw new Error('Failed to parse AI response as JSON.');
    }
  }
}

export const geminiService = GeminiService.getInstance();
