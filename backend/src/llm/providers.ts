import type { BaseLlm } from '@google/adk';
import { AnthropicLlm, DEFAULT_ANTHROPIC_MODEL } from './anthropic_llm';
import { OpenAiLlm, DEFAULT_OPENAI_MODEL } from './openai_llm';

/**
 * LLM providers available to the chatbot. Gemini runs through ADK's built-in
 * model; Claude and OpenAI run through the adapters in this folder. A provider
 * is offered only when its credentials are configured.
 */

export type LlmProviderId = 'gemini' | 'anthropic' | 'openai';

export interface LlmProviderInfo {
  id: LlmProviderId;
  label: string;
  model: string;
  configured: boolean;
}

export const LLM_PROVIDER_IDS: LlmProviderId[] = ['gemini', 'anthropic', 'openai'];

export function isLlmProviderId(value: unknown): value is LlmProviderId {
  return typeof value === 'string' && (LLM_PROVIDER_IDS as string[]).includes(value);
}

function geminiConfigured(): boolean {
  const vertex = process.env.GOOGLE_GENAI_USE_VERTEXAI === '1' || process.env.GOOGLE_GENAI_USE_VERTEXAI === 'true';
  return !!(process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || (vertex && process.env.GOOGLE_CLOUD_PROJECT));
}

export function listLlmProviders(): LlmProviderInfo[] {
  return [
    {
      id: 'gemini',
      label: 'Gemini',
      model: process.env.AGENT_MODEL || 'gemini-3.1-flash-lite',
      configured: geminiConfigured()
    },
    {
      id: 'anthropic',
      label: 'Claude',
      model: process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL,
      configured: !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN)
    },
    {
      id: 'openai',
      label: 'OpenAI',
      model: process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
      configured: !!process.env.OPENAI_API_KEY
    }
  ];
}

export function isLlmProviderConfigured(id: LlmProviderId): boolean {
  return listLlmProviders().some(p => p.id === id && p.configured);
}

/**
 * Default provider: LLM_PROVIDER if set and configured, otherwise the first
 * configured provider (Gemini first, for backward compatibility).
 */
export function defaultLlmProvider(): LlmProviderId {
  const requested = process.env.LLM_PROVIDER;
  if (isLlmProviderId(requested) && isLlmProviderConfigured(requested)) return requested;
  return listLlmProviders().find(p => p.configured)?.id || 'gemini';
}

/** Model handed to ADK's LlmAgent: a model name for Gemini, an adapter instance otherwise. */
export function createAgentModel(id: LlmProviderId, options: { extraSystem?: string } = {}): string | BaseLlm {
  switch (id) {
    case 'anthropic':
      return new AnthropicLlm(options);
    case 'openai':
      return new OpenAiLlm(options);
    default:
      return process.env.AGENT_MODEL || 'gemini-3.1-flash-lite';
  }
}
