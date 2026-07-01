let container = null;

function ensureContainer() {
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
  }
  return container;
}

/**
 * 画面下部に短い通知を表示する。
 * @param {string} message
 * @param {'info'|'success'|'error'} [type]
 * @param {number} [durationMs]
 */
export function showToast(message, type = 'info', durationMs = 2600) {
  const root = ensureContainer();
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  root.appendChild(el);

  requestAnimationFrame(() => el.classList.add('show'));

  const remove = () => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 220);
  };

  const timer = setTimeout(remove, durationMs);
  el.addEventListener('click', () => {
    clearTimeout(timer);
    remove();
  });
}
