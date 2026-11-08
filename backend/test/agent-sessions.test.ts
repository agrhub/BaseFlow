import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

process.env.NODE_ENV = 'test';
process.env.ENCRYPTION_KEY = 'unit-test-encryption-key-0123456789abcdef';
process.env.SESSION_SECRET = 'x'.repeat(40);
process.env.PASSWORD = 'unit-test-password';

// ── Persistent agent sessions ─────────────────────────────────────────────────

// Runs one chat turn in a fresh Node process (a "server start") against the same SQLite file.
const TURN_SCRIPT = `
const { createAgentRunner, chatWithAgent, getChatHistory } = require('../src/agent/agent');
const { AnthropicLlm } = require('../src/llm/anthropic_llm');
(async () => {
  const [message, reply] = process.argv.slice(2);
  const requests = [];
  const client = { beta: { messages: { stream: (p) => { requests.push(p); return { finalMessage: async () => ({ content: [{ type: 'text', text: reply }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }) }; } } } };
  const historyBefore = JSON.parse(JSON.stringify(await getChatHistory('persist-test')));
  const runner = createAgentRunner({ model: new AnthropicLlm({ client }) });
  await chatWithAgent(runner, 'persist-test', message);
  process.stdout.write('\\nRESULT:' + JSON.stringify({ historyBefore, sentMessages: requests[0].messages }) + '\\n');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
`;

test('agent sessions and chat history survive a restart with SESSION_DB_URL', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'baseflow-sessions-'));
  const script = path.join(__dirname, `.persist-turn-${process.pid}.ts`);
  fs.writeFileSync(script, TURN_SCRIPT);
  const env = { ...process.env, SESSION_DB_URL: `sqlite://${path.join(dir, 'agent_sessions.db')}`, TEMP_DIR: dir, DATA_DIR: dir };
  const run = (message: string, reply: string) =>
    JSON.parse(
      execFileSync(process.execPath, ['--import', 'tsx', script, message, reply], { env, cwd: path.join(__dirname, '..'), encoding: 'utf8' })
        .split('\n')
        .find(line => line.startsWith('RESULT:'))!
        .slice('RESULT:'.length)
    );
  try {
    const first = run('My name is Tan.', 'Nice to meet you, Tan.');
    assert.deepEqual(first.historyBefore, []);

    // "Restart": new process, same database
    const second = run('What is my name?', 'Your name is Tan.');
    assert.deepEqual(second.historyBefore, [
      { role: 'user', content: 'My name is Tan.' },
      { role: 'assistant', content: 'Nice to meet you, Tan.' }
    ]);
    const sent = JSON.stringify(second.sentMessages);
    assert.match(sent, /My name is Tan\./);
    assert.match(sent, /Nice to meet you, Tan\./);
  } finally {
    fs.rmSync(script, { force: true });
  }
});
