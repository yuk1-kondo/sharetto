/**
 * 画面下の入力バー（テキスト / リンク）の共通挙動。
 * - 入力に合わせて高さを自動調整
 * - マウス/トラックパッド環境では Enter で送信、Shift+Enter で改行
 * - タッチ環境では Enter は改行（送信はボタン）
 * - どの環境でも ⌘/Ctrl+Enter で送信
 */

const MAX_HEIGHT = 200;

/** タッチが主入力の端末か（スマホ・タブレット） */
export function isTouchPrimary() {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}

/**
 * @param {HTMLTextAreaElement} input
 * @param {{ onSend: () => void, onChange?: () => void }} opts
 */
export function bindComposer(input, { onSend, onChange }) {
  const grow = () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, MAX_HEIGHT)}px`;
  };

  input.addEventListener('input', () => {
    grow();
    onChange?.();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
    const withModifier = e.metaKey || e.ctrlKey;
    if (withModifier || (!e.shiftKey && !isTouchPrimary())) {
      e.preventDefault();
      onSend();
    }
  });

  return {
    set(value) {
      input.value = value;
      grow();
      onChange?.();
    },
    reset() {
      input.value = '';
      grow();
      onChange?.();
    },
  };
}

/** ⌘ / Ctrl の表記を OS に合わせる */
export function applyModifierLabels(root = document) {
  const isApple = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  root.querySelectorAll('[data-mod-key]').forEach((el) => { el.textContent = isApple ? '⌘' : 'Ctrl'; });
}
