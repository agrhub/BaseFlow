import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

process.env.NODE_ENV = 'test';
process.env.ENCRYPTION_KEY = 'unit-test-encryption-key-0123456789abcdef';
process.env.SESSION_SECRET = 'x'.repeat(40);
process.env.PASSWORD = 'unit-test-password';

import {
  isPathInside,
  resolveInside,
  assertValidRepoUrl,
  assertValidConnectionName,
  remoteRepoDirName,
  safeEqual,
  RateLimiter,
  buildSandboxEnv
} from '../src/utils/security';
import { encrypt, decrypt } from '../src/utils/crypto';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'baseflow-sec-'));
const repo = path.join(tmp, 'repo');
const outside = path.join(tmp, 'secret.txt');
fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
fs.writeFileSync(path.join(repo, 'src', 'a.ts'), 'export {}');
fs.writeFileSync(outside, 'secret');

test('resolveInside accepts paths inside the repo', () => {
  assert.equal(resolveInside(repo, 'src/a.ts'), path.join(repo, 'src', 'a.ts'));
  assert.equal(resolveInside(repo, 'skills/new_file.md'), path.join(repo, 'skills', 'new_file.md'));
});

test('resolveInside rejects traversal and absolute paths', () => {
  assert.throws(() => resolveInside(repo, '../secret.txt'));
  assert.throws(() => resolveInside(repo, 'src/../../secret.txt'));
  assert.throws(() => resolveInside(repo, outside));
  assert.throws(() => resolveInside(repo, ''));
  assert.throws(() => resolveInside(repo, 'a\0b'));
});

test('isPathInside is not fooled by sibling prefixes', () => {
  const sibling = repo + '-evil';
  fs.mkdirSync(sibling, { recursive: true });
  assert.equal(isPathInside(repo, path.join(sibling, 'x')), false);
});

test('isPathInside follows symlinks', { skip: process.platform === 'win32' }, () => {
  const link = path.join(repo, 'link.txt');
  fs.symlinkSync(outside, link);
  assert.equal(isPathInside(repo, link), false);
  assert.throws(() => resolveInside(repo, 'link.txt'));
});

test('assertValidRepoUrl validates GitHub / GitLab URLs', () => {
  assert.deepEqual(assertValidRepoUrl('https://github.com/owner/repo.git'), {
    provider: 'github', owner: 'owner', repo: 'repo', fullPath: 'owner/repo'
  });
  assert.equal(assertValidRepoUrl('https://gitlab.com/group/sub/proj').fullPath, 'group/sub/proj');
  assert.throws(() => assertValidRepoUrl('https://github.com/owner/re"po$(id)'));
  assert.throws(() => assertValidRepoUrl('https://evil.com/owner/repo'));
  assert.throws(() => assertValidRepoUrl('https://github.com/../etc'));
});

test('remoteRepoDirName is owner-qualified and filesystem safe', () => {
  assert.equal(remoteRepoDirName('https://github.com/a/app'), 'a__app');
  assert.equal(remoteRepoDirName('https://github.com/b/app'), 'b__app');
  assert.match(remoteRepoDirName('weird/../"name'), /^[A-Za-z0-9_.-]+$/);
});

test('connection names are validated', () => {
  assert.equal(assertValidConnectionName('My Repo_1'), 'My Repo_1');
  assert.throws(() => assertValidConnectionName('../etc'));
  assert.throws(() => assertValidConnectionName('a/b'));
  assert.throws(() => assertValidConnectionName(''));
});

test('encrypt/decrypt round-trips with AES-GCM and detects tampering', () => {
  const enc = encrypt('ghp_secret_token');
  assert.ok(enc.startsWith('v2:'));
  assert.equal(decrypt(enc), 'ghp_secret_token');
  const tampered = enc.slice(0, -2) + (enc.endsWith('00') ? '11' : '00');
  assert.equal(decrypt(tampered), '');
});

test('decrypt reads legacy CBC values encrypted with the old default key', () => {
  const key = crypto.createHash('sha256').update('default_32_characters_secret_key_123').digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const legacy = `${iv.toString('hex')}:${cipher.update('https://github.com/a/b', 'utf8', 'hex')}${cipher.final('hex')}`;
  assert.equal(decrypt(legacy), 'https://github.com/a/b');
  assert.equal(decrypt('https://github.com/plain/text'), 'https://github.com/plain/text');
});

test('safeEqual compares strings', () => {
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
});

test('RateLimiter blocks after the limit', () => {
  const rl = new RateLimiter(2, 60_000);
  assert.equal(rl.hit('ip'), 0);
  assert.equal(rl.hit('ip'), 0);
  assert.ok(rl.hit('ip') > 0);
  rl.reset('ip');
  assert.equal(rl.hit('ip'), 0);
});

test('buildSandboxEnv never forwards server secrets', () => {
  const env = buildSandboxEnv({ GEMINI_API_KEY: 'k' });
  assert.equal(env.PASSWORD, undefined);
  assert.equal(env.ENCRYPTION_KEY, undefined);
  assert.equal(env.SESSION_SECRET, undefined);
  assert.equal(env.GEMINI_API_KEY, 'k');
});
