import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { FunctionTool, InMemoryRunner, LlmAgent } from '@google/adk';

import { AnthropicLlm, echoableContent } from '../src/llm/anthropic_llm';
import { OpenAiLlm, toChatMessages } from '../src/llm/openai_llm';
import { genaiSchemaToJsonSchema } from '../src/llm/schema';
import { defaultLlmProvider, listLlmProviders } from '../src/llm/providers';
import { createAgentRunner, chatWithAgent } from '../src/agent/agent';

// ── Fake SDK clients ──────────────────────────────────────────────────────────

function fakeAnthropic(responses: any[]) {
  const requests: any[] = [];
  const client: any = {
    beta: {
      messages: {
        stream: (params: any) => {
          requests.push(JSON.parse(JSON.stringify(params)));
          const next = responses.shift();
          return { finalMessage: async () => next };
        }
      }
    }
  };
  return { client, requests };
}

function fakeOpenAi(responses: any[]) {
  const requests: any[] = [];
  const client: any = {
    chat: {
      completions: {
        create: async (params: any) => {
          requests.push(JSON.parse(JSON.stringify(params)));
          return responses.shift();
        }
      }
    }
  };
  return { client, requests };
}

const usage = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0 };

// A tiny ADK agent with one tool, driven by the given model
async function runAgent(model: any, prompt: string) {
  const calls: any[] = [];
  const tool = new FunctionTool({
    name: 'lookup_class',
    description: 'Look up a class by name',
    parameters: z.object({ className: z.string() }) as any,
    execute: (async ({ className }: any) => {
      calls.push(className);
      return { found: true, file: `${className}.ts` };
    }) as any
  } as any);
  const agent = new LlmAgent({ name: 'test_agent', model, instruction: 'You are a test agent.', tools: [tool] });
  const runner = new InMemoryRunner({ agent, appName: 'test' });
  await runner.sessionService.createSession({ appName: 'test', userId: 'u', sessionId: 's' });
  let text = '';
  for await (const event of runner.runAsync({ userId: 'u', sessionId: 's', newMessage: { role: 'user', parts: [{ text: prompt }] } })) {
    text += (event.content?.parts || []).map((p: any) => p.text || '').join('');
  }
  return { calls, text };
}

// ── Schema conversion ─────────────────────────────────────────────────────────

test('genai schema is converted to JSON schema', () => {
  const schema = genaiSchemaToJsonSchema({
    type: 'OBJECT',
    properties: { tab: { type: 'STRING', enum: ['a', 'b'] }, items: { type: 'ARRAY', items: { type: 'INTEGER' } } },
    required: ['tab']
  });
  assert.deepEqual(schema, {
    type: 'object',
    properties: { tab: { type: 'string', enum: ['a', 'b'] }, items: { type: 'array', items: { type: 'integer' } } },
    required: ['tab']
  });
});

// ── Claude ────────────────────────────────────────────────────────────────────

test('Claude adapter runs an ADK agent tool loop and replays thinking blocks unchanged', async () => {
  const assistantTurn = [
    { type: 'thinking', thinking: '', signature: 'sig-1' },
    { type: 'text', text: 'Let me check.' },
    { type: 'tool_use', id: 'toolu_1', name: 'lookup_class', input: { className: 'Foo' } }
  ];
  const { client, requests } = fakeAnthropic([
    { content: assistantTurn, stop_reason: 'tool_use', usage },
    { content: [{ type: 'text', text: 'Foo lives in Foo.ts.' }], stop_reason: 'end_turn', usage }
  ]);
  const { calls, text } = await runAgent(new AnthropicLlm({ client, model: 'claude-opus-5-5' }), 'Where is Foo?');

  assert.deepEqual(calls, ['Foo']);
  assert.match(text, /Foo lives in Foo\.ts/);
  assert.equal(requests.length, 2);

  const first = requests[0];
  assert.equal(first.model, 'claude-opus-5-5');
  assert.match(first.system, /You are a test agent/);
  assert.deepEqual(first.output_config, { effort: 'medium' });
  assert.deepEqual(first.cache_control, { type: 'ephemeral' });
  assert.equal(first.fallbacks, 'default');
  assert.deepEqual(first.betas, ['server-side-fallback-2026-07-01']);
  const tool = first.tools.find((t: any) => t.name === 'lookup_class');
  assert.equal(tool.eager_input_streaming, true);
  assert.equal(tool.input_schema.type, 'object');
  assert.equal(tool.input_schema.properties.className.type, 'string');

  // Second request: assistant turn replayed verbatim (incl. thinking), then the tool result
  const msgs = requests[1].messages;
  assert.equal(msgs[0].role, 'user');
  assert.deepEqual(msgs[1], { role: 'assistant', content: assistantTurn });
  assert.equal(msgs[2].role, 'user');
  assert.equal(msgs[2].content[0].type, 'tool_result');
  assert.equal(msgs[2].content[0].tool_use_id, 'toolu_1');
  assert.match(msgs[2].content[0].content, /Foo\.ts/);
});

test('Claude refusals and truncated tool calls never run tools', async () => {
  const refusal = fakeAnthropic([{ content: [], stop_reason: 'refusal', usage }]);
  const r1 = await runAgent(new AnthropicLlm({ client: refusal.client }), 'x');
  assert.deepEqual(r1.calls, []);
  assert.match(r1.text, /declined/);

  const truncated = fakeAnthropic([{
    content: [{ type: 'tool_use', id: 'toolu_2', name: 'lookup_class', input: { className: 'Fo' } }],
    stop_reason: 'max_tokens',
    usage
  }]);
  const r2 = await runAgent(new AnthropicLlm({ client: truncated.client }), 'x');
  assert.deepEqual(r2.calls, []);
  assert.match(r2.text, /cut off/);
});

test('no server-side fallback for models without support', async () => {
  const { client, requests } = fakeAnthropic([{ content: [{ type: 'text', text: 'hi' }], stop_reason: 'end_turn', usage }]);
  await runAgent(new AnthropicLlm({ client, model: 'claude-haiku-5-5' }), 'hi');
  assert.equal(requests[0].fallbacks, undefined);
  assert.equal(requests[0].betas, undefined);
});

test('content declined before a mid-output fallback is not echoed back', () => {
  const kept = echoableContent([
    { type: 'thinking', thinking: '', signature: 's' },
    { type: 'text', text: 'partial ' },
    { type: 'tool_use', id: 't', name: 'x', input: {} },
    { type: 'fallback', from: { model: 'a' }, to: { model: 'b' } },
    { type: 'thinking', thinking: '', signature: 's2' },
    { type: 'text', text: 'rest' }
  ] as any);
  assert.deepEqual(kept.map((b: any) => b.type), ['text', 'fallback', 'thinking', 'text']);
});

// ── OpenAI ────────────────────────────────────────────────────────────────────

test('OpenAI adapter runs an ADK agent tool loop', async () => {
  const { client, requests } = fakeOpenAi([
    {
      choices: [{
        finish_reason: 'tool_calls',
        message: { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'lookup_class', arguments: '{"className":"Bar"}' } }] }
      }],
      usage: { prompt_tokens: 10, completion_tokens: 5 }
    },
    {
      choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'Bar lives in Bar.ts.' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 }
    }
  ]);
  const { calls, text } = await runAgent(new OpenAiLlm({ client, model: 'gpt-5.5' }), 'Where is Bar?');

  assert.deepEqual(calls, ['Bar']);
  assert.match(text, /Bar lives in Bar\.ts/);
  const first = requests[0];
  assert.equal(first.messages[0].role, 'system');
  assert.equal(first.tools.find((t: any) => t.function.name === 'lookup_class').function.parameters.type, 'object');
  const second = requests[1].messages;
  const assistant = second.find((m: any) => m.role === 'assistant');
  assert.equal(assistant.tool_calls[0].id, 'call_1');
  const toolMsg = second.find((m: any) => m.role === 'tool');
  assert.equal(toolMsg.tool_call_id, 'call_1');
  assert.match(toolMsg.content, /Bar\.ts/);
});

test('OpenAI truncated tool calls never run tools', async () => {
  const { client } = fakeOpenAi([{
    choices: [{ finish_reason: 'length', message: { role: 'assistant', content: null, tool_calls: [{ id: 'c', type: 'function', function: { name: 'lookup_class', arguments: '{"classN' } }] } }]
  }]);
  const r = await runAgent(new OpenAiLlm({ client }), 'x');
  assert.deepEqual(r.calls, []);
  assert.match(r.text, /cut off/);
});

test('history mapping keeps tool results paired with their calls', () => {
  const msgs = toChatMessages([
    { role: 'user', parts: [{ text: 'q' }] },
    { role: 'model', parts: [{ functionCall: { id: 'c1', name: 'f', args: { a: 1 } } }] },
    { role: 'user', parts: [{ functionResponse: { id: 'c1', name: 'f', response: { ok: true } } }] }
  ]);
  assert.deepEqual(msgs.map((m: any) => m.role), ['user', 'assistant', 'tool']);
});

// ── Provider registry ─────────────────────────────────────────────────────────

test('only configured providers are offered and the default respects LLM_PROVIDER', () => {
  const saved = { ...process.env };
  try {
    delete process.env.GOOGLE_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_GENAI_USE_VERTEXAI;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    process.env.ANTHROPIC_API_KEY = 'test';
    process.env.LLM_PROVIDER = 'openai'; // not configured -> ignored
    assert.deepEqual(listLlmProviders().filter(p => p.configured).map(p => p.id), ['anthropic']);
    assert.equal(defaultLlmProvider(), 'anthropic');
    process.env.OPENAI_API_KEY = 'test';
    assert.equal(defaultLlmProvider(), 'openai');
  } finally {
    process.env = saved;
  }
});

// ── Switching providers mid-conversation ─────────────────────────────────────

test('switching the chat model keeps the conversation history', async () => {
  const claude = fakeAnthropic([
    { content: [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'text', text: 'Nice to meet you, Tan.' }], stop_reason: 'end_turn', usage }
  ]);
  const openai = fakeOpenAi([
    { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'Your name is Tan.' } }] }
  ]);
  const sessionId = 'switch-test';

  const runner1 = createAgentRunner({ model: new AnthropicLlm({ client: claude.client }) });
  const first = await chatWithAgent(runner1, sessionId, 'My name is Tan.');
  assert.match(first.reply, /Nice to meet you/);

  // A new runner (as created when the user picks another provider) sees the same session
  const runner2 = createAgentRunner({ model: new OpenAiLlm({ client: openai.client }) });
  const second = await chatWithAgent(runner2, sessionId, 'What is my name?');
  assert.match(second.reply, /Your name is Tan/);

  const history = JSON.stringify(openai.requests[0].messages);
  assert.match(history, /My name is Tan\./);
  assert.match(history, /Nice to meet you, Tan\./);
  assert.match(history, /What is my name\?/);
});
