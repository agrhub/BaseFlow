import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

process.env.NODE_ENV = 'test';
process.env.ENCRYPTION_KEY = 'unit-test-encryption-key-0123456789abcdef';
process.env.SESSION_SECRET = 'x'.repeat(40);
process.env.PASSWORD = 'unit-test-password';
process.env.TEMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'baseflow-temp-'));
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'baseflow-data-'));

import { bindAgentSession, drainActions, getModifiedFiles } from '../src/agent/tools';
import { writeWorkspaceFileTool, readWorkspaceFileTool } from '../src/agent/tools/devops.tools';
import { highlightClassTool } from '../src/agent/tools/connection.tools';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'baseflow-agent-'));
const repoA = path.join(tmp, 'repoA');
const repoB = path.join(tmp, 'repoB');
fs.mkdirSync(repoA);
fs.mkdirSync(repoB);
fs.writeFileSync(path.join(repoA, 'a.txt'), 'from A');
fs.writeFileSync(path.join(repoB, 'a.txt'), 'from B');

const cls = (name: string) => ({ name, filePath: `${name}.ts`, implementsList: [], properties: [], methods: [], dependencies: [] });
bindAgentSession('s1', 'connA', { repoPath: repoA, classes: [cls('Alpha')] });
bindAgentSession('s2', 'connB', { repoPath: repoB, classes: [cls('Beta')] });

const ctx = (sessionId: string) => ({ sessionId });
const run = (tool: any, args: any, sessionId: string) => tool.runAsync({ args, toolContext: ctx(sessionId) });

test('each session reads its own repository', async () => {
  assert.equal(await run(readWorkspaceFileTool, { filePath: 'a.txt' }, 's1'), 'from A');
  assert.equal(await run(readWorkspaceFileTool, { filePath: 'a.txt' }, 's2'), 'from B');
});

test('writes go to the session repository and are tracked per repository', async () => {
  await run(writeWorkspaceFileTool, { filePath: 'skills/x.md', content: 'hello' }, 's2');
  assert.equal(fs.existsSync(path.join(repoB, 'skills', 'x.md')), true);
  assert.equal(fs.existsSync(path.join(repoA, 'skills', 'x.md')), false);
  assert.deepEqual([...getModifiedFiles(repoB)], ['skills/x.md']);
  assert.equal(getModifiedFiles(repoA).size, 0);
});

test('agent cannot write outside the repo or into protected paths', async () => {
  const r1 = await run(writeWorkspaceFileTool, { filePath: '../evil.txt', content: 'x' }, 's1');
  assert.match(String(r1), /Failed to write file/);
  assert.equal(fs.existsSync(path.join(tmp, 'evil.txt')), false);
  const r2 = await run(writeWorkspaceFileTool, { filePath: '.github/workflows/ci.yml', content: 'x' }, 's1');
  assert.match(String(r2), /not allowed/);
});

test('UI actions are queued per session', async () => {
  drainActions('s1');
  drainActions('s2');
  await run(highlightClassTool, { className: 'Alpha' }, 's1');
  assert.match(String(await run(highlightClassTool, { className: 'Alpha' }, 's2')), /not found/);
  assert.deepEqual(drainActions('s1'), [{ type: 'HIGHLIGHT_CLASS', payload: { className: 'Alpha' } }]);
  assert.deepEqual(drainActions('s2'), []);
});

test('unbound sessions see no repository', async () => {
  assert.match(String(await run(readWorkspaceFileTool, { filePath: 'a.txt' }, 'unknown')), /No active repository|No repository/);
});
