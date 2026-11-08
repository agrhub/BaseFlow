import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rateLimitCallback, RATE_LIMIT_MESSAGE } from '../src/agent/shared_libraries/callbacks';

test('model rate limit returns a clear message instead of a long silent wait', async () => {
  for (let i = 0; i < 50; i++) {
    assert.equal(await rateLimitCallback({ context: {}, request: {} }), undefined);
  }
  const started = Date.now();
  const res = await rateLimitCallback({ context: {}, request: {} });
  assert.ok(Date.now() - started < 1000, 'should not block when the wait would be long');
  assert.equal(res?.content?.parts?.[0]?.text, RATE_LIMIT_MESSAGE);
});
