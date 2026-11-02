import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translate } from '../public/js/i18n.js';

test('English labels, statuses and interpolated values preserve their data', () => {
  assert.equal(translate('文章・URL'), 'Notes & links');
  assert.equal(translate('  コピー\n'), '  Copy\n');
  assert.equal(translate('2時間9分'), '2h 9m');
  assert.equal(translate('1台が参加中'), '1 device connected');
  assert.equal(translate('3台が参加中'), '3 devices connected');
  assert.equal(translate('旅行 写真.jpg を送信中 (2/3)'), 'Sending 旅行 写真.jpg (2/3)');
  assert.equal(translate('コピー', 'ja'), 'コピー');
  assert.equal(translate('https://example.com/日本語?q=コピー'), 'https://example.com/日本語?q=コピー');
});
