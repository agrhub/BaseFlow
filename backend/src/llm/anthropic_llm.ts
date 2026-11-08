import Anthropic from '@anthropic-ai/sdk';
import { BaseLlm } from '@google/adk';
import type { BaseLlmConnection, LlmRequest, LlmResponse } from '@google/adk';
import type { Content, Part } from '@google/genai';
import { collectTools, contentText, functionResponseText, systemInstructionText } from './schema';

type BetaMessageParam = Anthropic.Beta.BetaMessageParam;
type BetaContentBlock = Anthropic.Beta.BetaContentBlock;
type BetaContentBlockParam = Anthropic.Beta.BetaContentBlockParam;
type BetaToolUnion = Anthropic.Beta.BetaToolUnion;
type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5-5';

// Models that accept server-side refusal fallbacks in their "default" form (Claude API).
const SERVER_FALLBACK_MODELS = new Set(['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);
const MAX_RAW_TURNS = 200;

export interface AnthropicLlmOptions {
  model?: string;
  apiKey?: string;
  effort?: Effort;
  /** Request-level guidance appended to the system prompt (e.g. "respond with JSON only"). */
  extraSystem?: string;
  /** Injected client (tests) */
  client?: Anthropic;
}

/**
 * ADK model adapter for Claude (Anthropic Messages API).
 *
 * ADK keeps conversation history as Gemini-shaped `Content`; this adapter maps
 * it to Claude messages and back. Claude's assistant turns contain thinking
 * blocks that must be passed back unchanged, so the exact content of every
 * response is kept per adapter instance (one instance per chat runner) and
 * replayed verbatim instead of the lossy Gemini-shaped copy.
 */
export class AnthropicLlm extends BaseLlm {
  static override readonly supportedModels: Array<string | RegExp> = [/^claude-/];

  private readonly client: Anthropic;
  private readonly effort: Effort;
  private readonly extraSystem: string;
  // Exact assistant content, keyed by tool_use id or by visible text
  private readonly rawTurns = new Map<string, BetaContentBlock[]>();

  constructor(options: AnthropicLlmOptions = {}) {
    super({ model: options.model || process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL });
    this.client = options.client || new Anthropic(options.apiKey ? { apiKey: options.apiKey } : {});
    this.effort = options.effort || (process.env.ANTHROPIC_EFFORT as Effort) || 'medium';
    this.extraSystem = options.extraSystem || '';
  }

  async *generateContentAsync(llmRequest: LlmRequest, _stream?: boolean, abortSignal?: AbortSignal): AsyncGenerator<LlmResponse, void> {
    const system = [systemInstructionText(llmRequest.config), this.extraSystem].filter(Boolean).join('\n\n');
    const tools: BetaToolUnion[] = collectTools(llmRequest.config).map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Beta.BetaTool.InputSchema,
      // Stream large inputs (file contents) as generated; inputs are validated by ADK tools before running
      eager_input_streaming: true
    }));
    const messages = this.toMessages(llmRequest.contents || []);
    const useFallback = SERVER_FALLBACK_MODELS.has(this.model) && process.env.ANTHROPIC_SERVER_FALLBACK !== 'off';

    const params: Anthropic.Beta.MessageCreateParamsStreaming = {
      model: this.model,
      max_tokens: 64000,
      messages,
      output_config: { effort: this.effort },
      // Caches the stable prefix (tools + system prompt) across turns
      cache_control: { type: 'ephemeral' },
      ...(system ? { system } : {}),
      ...(tools.length ? { tools } : {}),
      ...(useFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {})
    } as Anthropic.Beta.MessageCreateParamsStreaming;

    let message: Anthropic.Beta.BetaMessage | null = null;
    for (let attempt = 0; attempt < 2 && !message; attempt++) {
      try {
        message = await this.client.beta.messages.stream(params, { signal: abortSignal }).finalMessage();
      } catch (err) {
        // Only an unparseable streamed tool input is retried; API errors (auth, rate limit…) propagate
        if (err instanceof Anthropic.APIError || attempt === 1) throw err;
        console.warn('[AnthropicLlm] Tool input was not parseable JSON, re-issuing the turn.');
      }
    }
    if (!message) return;

    yield this.toLlmResponse(message);
  }

  async connect(_llmRequest: LlmRequest): Promise<BaseLlmConnection> {
    throw new Error('Live connections are not supported for Claude models.');
  }

  // ── Response → ADK ────────────────────────────────────────────────────────

  private toLlmResponse(message: Anthropic.Beta.BetaMessage): LlmResponse {
    const usageMetadata = {
      promptTokenCount: message.usage.input_tokens,
      candidatesTokenCount: message.usage.output_tokens,
      cachedContentTokenCount: message.usage.cache_read_input_tokens ?? undefined
    };

    if (message.stop_reason === 'refusal') {
      // A refusal can cut a tool call off mid-input: never run that turn's tools
      return {
        content: { role: 'model', parts: [{ text: '⚠️ Claude declined to answer this request. Try rephrasing it.' }] },
        turnComplete: true,
        usageMetadata
      };
    }

    const blocks = echoableContent(message.content);
    const parts: Part[] = [];
    const toolUses: Anthropic.Beta.BetaToolUseBlock[] = [];
    for (const block of blocks) {
      if (block.type === 'text' && block.text) parts.push({ text: block.text });
      if (block.type === 'tool_use') toolUses.push(block);
    }

    if (toolUses.length && message.stop_reason === 'max_tokens') {
      // A tool input cut off at max_tokens parses as a valid-looking partial object: don't run it
      parts.push({ text: '\n⚠️ The response was cut off before the tool call completed. Please ask again with a narrower request.' });
    } else {
      for (const tu of toolUses) {
        parts.push({ functionCall: { id: tu.id, name: tu.name, args: (tu.input || {}) as Record<string, unknown> } });
      }
    }

    // Remember the exact assistant content for verbatim replay
    if (!(toolUses.length && message.stop_reason === 'max_tokens')) {
      this.remember(blocks, toolUses.map(t => t.id), parts);
    }

    return {
      content: { role: 'model', parts: parts.length ? parts : [{ text: '' }] },
      turnComplete: true,
      usageMetadata
    };
  }

  private remember(blocks: BetaContentBlock[], toolUseIds: string[], parts: Part[]) {
    const key = toolUseIds.length ? `tool:${toolUseIds[0]}` : `text:${parts.map(p => p.text || '').join('')}`;
    this.rawTurns.set(key, blocks);
    while (this.rawTurns.size > MAX_RAW_TURNS) {
      this.rawTurns.delete(this.rawTurns.keys().next().value as string);
    }
  }

  // ── ADK history → Claude messages ────────────────────────────────────────

  private toMessages(contents: Content[]): BetaMessageParam[] {
    const messages: BetaMessageParam[] = [];
    const push = (role: 'user' | 'assistant', blocks: BetaContentBlockParam[]) => {
      if (!blocks.length) return;
      const last = messages[messages.length - 1];
      if (last && last.role === role && Array.isArray(last.content)) {
        (last.content as BetaContentBlockParam[]).push(...blocks);
      } else {
        messages.push({ role, content: blocks });
      }
    };

    for (const content of contents) {
      const parts = content.parts || [];
      if (content.role === 'model') {
        push('assistant', this.assistantBlocks(content));
        continue;
      }
      // User turn: tool results must come first, then any text
      const toolResults: BetaContentBlockParam[] = [];
      const text: BetaContentBlockParam[] = [];
      for (const part of parts) {
        if (part.functionResponse) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: part.functionResponse.id || '',
            content: functionResponseText(part.functionResponse.response)
          });
        } else if (typeof part.text === 'string' && part.text && !part.thought) {
          text.push({ type: 'text', text: part.text });
        }
      }
      push('user', [...toolResults, ...text]);
    }

    // The conversation must start with a user turn
    while (messages.length && messages[0].role !== 'user') messages.shift();
    if (!messages.length) messages.push({ role: 'user', content: 'Continue.' });
    return messages;
  }

  private assistantBlocks(content: Content): BetaContentBlockParam[] {
    const parts = content.parts || [];
    const firstCall = parts.find(p => p.functionCall)?.functionCall;
    const raw = firstCall?.id
      ? this.rawTurns.get(`tool:${firstCall.id}`)
      : this.rawTurns.get(`text:${contentText(content)}`);
    if (raw) return raw as BetaContentBlockParam[];

    // Not produced by this adapter (e.g. history from another provider): rebuild it
    const blocks: BetaContentBlockParam[] = [];
    for (const part of parts) {
      if (typeof part.text === 'string' && part.text && !part.thought) {
        blocks.push({ type: 'text', text: part.text });
      } else if (part.functionCall?.id && part.functionCall.name) {
        blocks.push({ type: 'tool_use', id: part.functionCall.id, name: part.functionCall.name, input: part.functionCall.args || {} });
      }
    }
    return blocks;
  }
}

/**
 * Content that may be sent back to the API. After a mid-output server-side
 * fallback, thinking / tool_use blocks (and unpaired server tool calls) that
 * appear before the last `fallback` block belong to the declined attempt and
 * must be omitted; text and everything after the boundary is kept.
 */
export function echoableContent(content: BetaContentBlock[]): BetaContentBlock[] {
  let boundary = -1;
  content.forEach((block, i) => {
    if (block.type === 'fallback') boundary = i;
  });
  if (boundary < 0) return content;
  const resultIds = new Set(
    content
      .slice(0, boundary)
      .map(b => (b as any).tool_use_id)
      .filter(Boolean)
  );
  return content.filter((block, i) => {
    if (i >= boundary) return true;
    if (block.type === 'text') return true;
    if (block.type === 'server_tool_use') return resultIds.has(block.id);
    // Paired server tool results stay; thinking, tool_use and unknown internal blocks are dropped
    return block.type.endsWith('_tool_result') && resultIds.has((block as any).tool_use_id);
  });
}
