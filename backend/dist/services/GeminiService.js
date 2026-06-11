"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.geminiService = exports.GeminiService = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const { GoogleGenAI } = require('@google/genai');
dotenv_1.default.config();
// Custom queue to manage concurrency and request spacing
class RequestQueue {
    queue = [];
    activeCount = 0;
    maxConcurrency;
    minIntervalMs;
    constructor(maxConcurrency = 1, minIntervalMs = 1000) {
        this.maxConcurrency = maxConcurrency;
        this.minIntervalMs = minIntervalMs;
    }
    enqueue(fn) {
        return new Promise((resolve, reject) => {
            this.queue.push(async () => {
                try {
                    const result = await fn();
                    resolve(result);
                }
                catch (err) {
                    reject(err);
                }
            });
            this.processNext();
        });
    }
    async processNext() {
        if (this.activeCount >= this.maxConcurrency || this.queue.length === 0) {
            return;
        }
        const task = this.queue.shift();
        if (!task)
            return;
        this.activeCount++;
        try {
            await task();
        }
        finally {
            this.activeCount--;
            // Enforce a pacing interval between starting consecutive tasks
            setTimeout(() => this.processNext(), this.minIntervalMs);
        }
    }
}
// Helper for exponential backoff retries
async function callWithRetry(fn, retries = 5, delayMs = 2000) {
    try {
        return await fn();
    }
    catch (error) {
        const errorStr = String(error?.message || error || '');
        const isRateLimit = errorStr.includes('429') ||
            errorStr.includes('RESOURCE_EXHAUSTED') ||
            errorStr.includes('Resource exhausted') ||
            (error?.status === 429);
        if (isRateLimit && retries > 0) {
            const jitter = Math.random() * 1000;
            const nextDelay = delayMs * 2 + jitter;
            console.warn(`[GeminiService] Rate limit (429) encountered. Retrying in ${(nextDelay / 1000).toFixed(1)}s... (${retries} retries left)`);
            await new Promise(resolve => setTimeout(resolve, nextDelay));
            return callWithRetry(fn, retries - 1, delayMs * 2);
        }
        throw error;
    }
}
class GeminiService {
    static instance;
    genAI;
    modelId;
    requestQueue;
    constructor() {
        const apiKey = process.env.GOOGLE_API_KEY || "";
        const vertexai = process.env.GOOGLE_GENAI_USE_VERTEXAI === '1' || process.env.GOOGLE_GENAI_USE_VERTEXAI === 'true';
        this.modelId = process.env.AGENT_MODEL || 'gemini-3.1-flash-lite';
        this.genAI = new GoogleGenAI({ vertexai, apiKey });
        // Concurrency limit of 1 request at a time, with a minimum 1.5s interval to prevent rate limit spikes
        this.requestQueue = new RequestQueue(1, 1500);
        console.log(`[GeminiService] Initialized with model: ${this.modelId} (VertexAI: ${vertexai})`);
    }
    static getInstance() {
        if (!GeminiService.instance) {
            GeminiService.instance = new GeminiService();
        }
        return GeminiService.instance;
    }
    /**
     * Generates content using the configured model.
     * Runs inside the concurrency queue and uses exponential backoff retries.
     */
    async generateContent(prompt, systemInstruction, responseMimeType) {
        return this.requestQueue.enqueue(async () => {
            return callWithRetry(async () => {
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
                    return response.text || '';
                }
                catch (error) {
                    console.error('[GeminiService] Error generating content:', error);
                    throw error;
                }
            });
        });
    }
    /**
     * Generates JSON content and attempts to parse it.
     */
    async generateJSON(prompt, systemInstruction) {
        const text = await this.generateContent(prompt, systemInstruction, 'application/json');
        try {
            let jsonStr = text.trim();
            if (jsonStr.startsWith('```')) {
                jsonStr = jsonStr.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '');
            }
            return JSON.parse(jsonStr);
        }
        catch (parseErr) {
            console.error('[GeminiService] Failed to parse JSON response:', text);
            throw new Error('Failed to parse AI response as JSON.');
        }
    }
}
exports.GeminiService = GeminiService;
exports.geminiService = GeminiService.getInstance();
