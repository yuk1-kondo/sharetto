import {
  SESSION_TTL_MS,
  SESSION_WARNING_THRESHOLD_MS,
  SESSION_CRITICAL_THRESHOLD_MS,
} from './constants.js';

/**
 * セッション残り時間タイマーを管理する。
 * @param {{
 *   durationMs?: number,
 *   warningMs?: number,
 *   criticalMs?: number,
 *   onExpire?: () => void,
 *   elements: { container: HTMLElement, display: HTMLElement, detail?: HTMLElement }
 * }} options
 */
export function createSessionTimer(options) {
  const {
    durationMs = SESSION_TTL_MS,
    warningMs = SESSION_WARNING_THRESHOLD_MS,
    criticalMs = SESSION_CRITICAL_THRESHOLD_MS,
    onExpire,
    elements,
  } = options;

  let intervalId = null;
  let startTime = null;

  function stop() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  function update() {
    if (!startTime) return;

    const remaining = durationMs - (Date.now() - startTime);
    if (remaining <= 0) {
      stop();
      if (elements.display) elements.display.textContent = '期限切れ';
      if (elements.container) {
        elements.container.className = 'session-timer critical';
        if (elements.detail) {
          elements.detail.textContent = '新しいセッションを開始してください';
        }
      }
      onExpire?.();
      return;
    }

    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    if (elements.display) {
      elements.display.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    if (elements.container) {
      elements.container.className = 'session-timer';
      if (remaining <= criticalMs) {
        elements.container.classList.add('critical');
      } else if (remaining <= warningMs) {
        elements.container.classList.add('warning');
      }
    }
  }

  return {
    start() {
      stop();
      startTime = Date.now();
      if (elements.container) elements.container.style.display = 'block';
      if (elements.detail) elements.detail.textContent = 'ファイルは自動的に削除されます';
      update();
      intervalId = setInterval(update, 1000);
    },
    stop,
    resetDetail(text) {
      if (elements.detail) elements.detail.textContent = text;
    },
  };
}
