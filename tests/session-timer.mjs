import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSessionTimer } from '../public/js/session-timer.js';
import { SESSION_TTL_MS, SESSION_WARNING_THRESHOLD_MS } from '../public/js/constants.js';

test('timer uses shared deadlines, preserves extension and expires once', () => {
  assert.equal(SESSION_TTL_MS, 7200000);
  assert.equal(SESSION_WARNING_THRESHOLD_MS, 600000);
  const originalNow = Date.now;
  let now = 1000000;
  Date.now = () => now;
  let expired = 0;
  const display = { textContent: '' };
  const detail = { textContent: '' };
  const container = { style: {}, className: '', classList: { add(value) { container.className += ` ${value}`; } } };
  const timer = createSessionTimer({ onExpire: () => expired++, elements: { display, detail, container } });
  try {
    const deadline = now + SESSION_TTL_MS;
    timer.start(deadline);
    assert.equal(display.textContent, '2時間0分');
    now += 111 * 60000;
    timer.start(deadline);
    assert.equal(display.textContent, '9:00');
    assert.match(container.className, /warning/);
    timer.start(deadline + SESSION_TTL_MS);
    assert.equal(display.textContent, '2時間9分');
    assert.doesNotMatch(container.className, /warning/);
    now = deadline + SESSION_TTL_MS;
    timer.start(deadline + SESSION_TTL_MS);
    assert.equal(expired, 1);
    assert.equal(display.textContent, '期限切れ');
    assert.equal(timer.getRemainingRatio(), 0);
  } finally { timer.stop(); Date.now = originalNow; }
});
