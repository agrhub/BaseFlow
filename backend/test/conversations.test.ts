import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.ENCRYPTION_KEY = 'unit-test-encryption-key-0123456789abcdef';
process.env.SESSION_SECRET = 'x'.repeat(40);
process.env.PASSWORD = 'unit-test-password';

import { createAgentRunner, chatWithAgent, listConversations, clearAgentSession } from '../src/agent/agent';
import { AnthropicLlm } from '../src/llm/anthropic_llm';

function fakeClaude() {
  const client: any = {
    beta: {
      messages: {
        stream: () => ({
          finalMessage: async () => ({ content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } })
        })
      }
    }
  };
  return new AnthropicLlm({ client });
}

test('conversations are listed per browser, newest first, with their first message as title', async () => {
  const runner = createAgentRunner({ model: fakeClaude() });
  await chatWithAgent(runner, 'browserA:c1', 'How does   the parser work?');
  await new Promise(r => setTimeout(r, 5));
  await chatWithAgent(runner, 'browserA:c2', 'Explain OrderService');
  await chatWithAgent(runner, 'browserA:c2', 'And its tests?'); // title stays the first message
  await chatWithAgent(runner, 'browserB:c3', 'Someone else');

  const a = await listConversations('browserA');
  assert.deepEqual(a.map(c => c.id), ['browserA:c2', 'browserA:c1']);
  assert.deepEqual(a.map(c => c.title), ['Explain OrderService', 'How does the parser work?']);
  assert.ok(a.every(c => c.updatedAt > 1e12), 'updatedAt is in milliseconds');

  assert.deepEqual((await listConversations('browserB')).map(c => c.id), ['browserB:c3']);

  await clearAgentSession(undefined, 'browserA:c1');
  assert.deepEqual((await listConversations('browserA')).map(c => c.id), ['browserA:c2']);
});
