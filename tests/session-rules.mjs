// Start with: firebase emulators:start --only database --project demo-sharetto
// Then run: node --test tests/session-rules.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

const base = 'http://127.0.0.1:9000';
const ns = 'demo-sharetto-default-rtdb';
async function request(path, method = 'GET', value, admin = false) {
  const response = await fetch(`${base}/${path}.json?ns=${ns}`, {
    method,
    headers: { ...(admin ? { Authorization: 'Bearer owner' } : {}), 'Content-Type': 'application/json' },
    body: value === undefined ? undefined : JSON.stringify(value),
  });
  return { status: response.status, value: await response.json() };
}

test('two-hour lifecycle enforces expiry, extension, termination and PIN privacy', async () => {
  const id = 'testsession01';
  await request(`sessions/${id}`, 'DELETE', undefined, true);
  await request('codes/123456', 'DELETE', undefined, true);
  const now = Date.now();
  const session = { status: 'active', createdAt: now - 1000, expiresAt: now + 7200000 };
  assert.equal((await request(`sessions/${id}`, 'PUT', session)).status, 200);
  assert.equal((await request(`sessions/${id}`, 'DELETE')).status, 401, 'active lifecycle cannot be deleted');
  assert.equal((await request('codes', 'GET')).status, 401, 'PIN list cannot be enumerated');
  assert.equal((await request('codes/123456', 'PUT', { sessionId: id, timestamp: now - 1000 })).status, 200);
  assert.equal((await request('codes/123456')).status, 200);
  assert.equal((await request('codes/123456', 'PUT', { sessionId: id, timestamp: now - 1000 })).status, 401, 'active PIN cannot be replaced');
  const payload = { type: 'file', name: 'example.txt', timestamp: now - 1000, size: 4, data: 'data:text/plain;base64,dGVzdA==' };
  for (const path of ['files', 'outbox']) {
    assert.equal((await request(`${path}/${id}`, 'PATCH', { entry001: payload, timestamp: payload.timestamp, size: payload.size })).status, 200);
    assert.equal((await request(`${path}/${id}`)).status, 200);
  }
  assert.equal((await request(`files/${id}/entry002`, 'PUT', { ...payload, size: 52428801 })).status, 401);
  assert.equal((await request(`sessions/${id}`, 'PATCH', { expiresAt: session.expiresAt + 7200000 })).status, 200);
  assert.equal((await request(`outbox/${id}`)).status, 200, 'data remains readable after extension');
  assert.equal((await request(`sessions/${id}`, 'PATCH', { status: 'ended' })).status, 200);
  for (const path of ['files', 'outbox', 'signal', 'presence']) {
    assert.equal((await request(`${path}/${id}`)).status, 401, `${path} denies reads after end`);
    assert.equal((await request(`${path}/${id}/bypass`, 'PUT', { timestamp: now })).status, 401, `${path} denies child writes after end`);
  }
  assert.equal((await request(`sessions/${id}`, 'PATCH', { status: 'active', expiresAt: now + 7200000 })).status, 401, 'ended sessions cannot be restarted');
  assert.equal((await request(`sessions/${id}`, 'DELETE')).status, 401, 'cannot delete lifecycle tombstone');
  await request(`sessions/${id}`, 'PUT', { ...session, expiresAt: now - 1000 }, true);
  assert.equal((await request(`files/${id}`)).status, 401, 'natural expiry blocks reads');
  assert.equal((await request(`sessions/${id}`, 'PATCH', { expiresAt: now + 7200000 })).status, 401, 'expired sessions cannot be extended');
});
