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

import { issueToken, verifyToken, issueDeviceCookie, verifyDeviceCookie } from '../src/utils/authSession';
import { getSecurityConfig } from '../src/utils/security';

// ── Signed login cookie ───────────────────────────────────────────────────────

test('login tokens verify, keep their session id and reject tampering', () => {
  const sid = 'a'.repeat(32);
  const token = issueToken(sid);
  assert.deepEqual(verifyToken(token)?.sid, sid);

  const [data, sig] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ sid: 'b'.repeat(32), exp: Date.now() + 1e9 })).toString('base64url');
  assert.equal(verifyToken(`${forged}.${sig}`), null);
  assert.equal(verifyToken(`${data}.${sig.slice(0, -2)}xx`), null);
  assert.equal(verifyToken(`${data}`), null);
  assert.equal(verifyToken(undefined), null);
});

test('login tokens expire', () => {
  const token = issueToken(undefined, Date.now() - 2 * 24 * 60 * 60 * 1000);
  assert.equal(verifyToken(token), null);
});

test('changing the password signs everyone out', () => {
  const token = issueToken();
  assert.ok(verifyToken(token));
  const cfg = getSecurityConfig() as any;
  const original = cfg.password;
  try {
    cfg.password = 'another-strong-password';
    assert.equal(verifyToken(token), null);
  } finally {
    cfg.password = original;
  }
});

test('device cookies are signed and keep their id across password changes', () => {
  const cookie = issueDeviceCookie('c'.repeat(32));
  assert.equal(verifyDeviceCookie(cookie), 'c'.repeat(32));
  assert.equal(verifyDeviceCookie('d'.repeat(32) + '.' + cookie.split('.')[1]), null);
  assert.equal(verifyDeviceCookie('not-a-cookie'), null);
  const cfg = getSecurityConfig() as any;
  const original = cfg.password;
  try {
    cfg.password = 'another-strong-password';
    assert.equal(verifyDeviceCookie(cookie), 'c'.repeat(32));
  } finally {
    cfg.password = original;
  }
});
