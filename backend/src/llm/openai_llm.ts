import OpenAI from 'openai';
import { BaseLlm } from '@google/adk';
import type { BaseLlmConnection, LlmRequest, LlmResponse } from '@google/adk';
import type { Content, Part } from '@google/genai';
import { collectTools, functionResponseText, systemInstructionText } from './schema';

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;
type ChatTool = OpenAI.Chat.Completions.ChatCompletionTool;

export const DEFAULT_OPENAI_MODEL = 'gpt-5.5';

export interface OpenAiLlmOptions {
  model?: string;
  apiKey?: string;
  baseURL?: string;
  extraSystem?: string;
  /** Injected client (tests) */
  client?: OpenAI;
}

/**
 * ADK model adapter for OpenAI (Chat Completions API). Also works with
 * OpenAI-compatible endpoints through OPENAI_BASE_URL.
 */
export class OpenAiLlm extends BaseLlm {
  static override readonly supportedModels: Array<string | RegExp> = [/^gpt-/, /^o\d/];

  private readonly client: OpenAI;
  private readonly extraSystem: string;

  constructor(options: OpenAiLlmOptions = {}) {
    super({ model: options.model || process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL });
    this.client = options.client || new OpenAI({
      ...(options.apiKey ? { apiKey: options.apiKey } : {}),
      ...(options.baseURL || process.env.OPENAI_BASE_URL ? { baseURL: options.baseURL || process.env.OPENAI_BASE_URL } : {})
    });
    this.extraSystem = options.extraSystem || '';
  }

  async *generateContentAsync(llmRequest: LlmRequest, _stream?: boolean, abortSignal?: AbortSignal): AsyncGenerator<LlmResponse, void> {
    const system = [systemInstructionText(llmRequest.config), this.extraSystem].filter(Boolean).join('\n\n');
    const tools: ChatTool[] = collectTools(llmRequest.config).map(t => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.inputSchema }
    }));
    const messages: ChatMessage[] = [
      ...(system ? [{ role: 'system', content: system } as ChatMessage] : []),
      ...toChatMessages(llmRequest.contents || [])
    ];
    const reasoningEffort = process.env.OPENAI_REASONING_EFFORT as OpenAI.ReasoningEffort | undefined;

    const completion = await this.client.chat.completions.create(
      {
        model: this.model,
        messages,
        ...(tools.length ? { tools } : {}),
        ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {})
      },
      { signal: abortSignal }
    );

    const choice = completion.choices[0];
    const msg = choice?.message;
    const usageMetadata = {
      promptTokenCount: completion.usage?.prompt_tokens,
      candidatesTokenCount: completion.usage?.completion_tokens
    };

    if (msg?.refusal) {
      yield { content: { role: 'model', parts: [{ text: `⚠️ ${msg.refusal}` }] }, turnComplete: true, usageMetadata };
      return;
    }

    const parts: Part[] = [];
    if (msg?.content) parts.push({ text: msg.content });
    const calls = (msg?.tool_calls || []).filter((c): c is OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall => c.type === 'function');
    if (calls.length && choice?.finish_reason === 'length') {
      // Arguments were truncated: never run them
      parts.push({ text: '\n⚠️ The response was cut off before the tool call completed. Please ask again with a narrower request.' });
    } else {
      for (const call of calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || '{}');
        } catch {
          args = { INVALID_JSON: call.function.arguments };
        }
        parts.push({ functionCall: { id: call.id, name: call.function.name, args } });
      }
    }

    yield {
      content: { role: 'model', parts: parts.length ? parts : [{ text: '' }] },
      turnComplete: true,
      usageMetadata
    };
  }

  async connect(_llmRequest: LlmRequest): Promise<BaseLlmConnection> {
    throw new Error('Live connections are not supported for OpenAI models.');
  }
}

/** Map ADK (Gemini-shaped) history to Chat Completions messages. */
export function toChatMessages(contents: Content[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const content of contents) {
    const parts = content.parts || [];
    const text = parts
      .filter(p => typeof p.text === 'string' && p.text && !p.thought)
      .map(p => p.text as string)
      .join('');

    if (content.role === 'model') {
      const toolCalls = parts
        .filter(p => p.functionCall?.id && p.functionCall.name)
        .map(p => ({
          id: p.functionCall!.id as string,
          type: 'function' as const,
          function: { name: p.functionCall!.name as string, arguments: JSON.stringify(p.functionCall!.args || {}) }
        }));
      if (!text && !toolCalls.length) continue;
      out.push({ role: 'assistant', content: text || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) });
      continue;
    }

    for (const part of parts) {
      if (part.functionResponse) {
        out.push({
          role: 'tool',
          tool_call_id: part.functionResponse.id || '',
          content: functionResponseText(part.functionResponse.response)
        });
      }
    }
    if (text) out.push({ role: 'user', content: text });
  }
  return out;
}
