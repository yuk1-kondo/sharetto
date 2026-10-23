import {
  createFileItem, createUrlItem, createTextItem, createMessageItem,
} from './file-items.js';

/**
 * 端末間のやり取りを時系列で並べるタイムライン。
 * 受信は左（in）、送信は右（out）。新しいものほど下。
 *
 * @param {HTMLElement} root  .timeline 要素（.timeline__list を含む）
 * @param {{ onDownload?: Function, onViewImage?: Function, onCopy?: Function }} handlers
 */
export function createTimeline(root, handlers) {
  const list = root.querySelector('.timeline__list');
  let count = 0;

  function isNearBottom() {
    const doc = document.documentElement;
    return window.innerHeight + window.scrollY >= doc.scrollHeight - 200;
  }

  /** 入力バーが下に固定されているので、要素ではなくページの末尾までスクロールする */
  function scrollToEnd() {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
  }

  function push(node, dir) {
    if (!node) return null;
    const follow = dir === 'out' || isNearBottom();
    const msg = document.createElement('div');
    msg.className = `msg msg--${dir}`;
    msg.appendChild(node);
    list.appendChild(msg);
    count += 1;
    root.dataset.empty = 'false';
    if (follow) {
      requestAnimationFrame(scrollToEnd);
      msg.querySelectorAll('img').forEach((img) => img.addEventListener('load', scrollToEnd, { once: true }));
    }
    return msg;
  }

  return {
    file(file, dir, tag) {
      return push(createFileItem(file, handlers, { tag }), dir);
    },
    url(item, dir, tag) {
      return push(createUrlItem(item, handlers, { tag }), dir);
    },
    text(item, dir, tag) {
      return push(createTextItem(item, handlers, { tag }), dir);
    },
    /** 文字列を URL ならリンク、それ以外はテキストとして追加 */
    message(text, dir, tag) {
      return push(createMessageItem(text, handlers, { tag }), dir);
    },
    /** 送信中の進捗バーを付ける */
    progress(msg) {
      if (!msg) return { set() {}, done() {}, fail() {} };
      const bar = document.createElement('div');
      bar.className = 'msg__progress';
      bar.innerHTML = '<i></i>';
      msg.appendChild(bar);
      msg.classList.add('is-sending');
      const fill = bar.firstChild;
      return {
        set(p) { fill.style.width = `${Math.round(Math.max(0, Math.min(1, p)) * 100)}%`; },
        done() {
          fill.style.width = '100%';
          msg.classList.remove('is-sending');
          msg.classList.add('is-sent');
          setTimeout(() => bar.remove(), 600);
        },
        fail(message = '送信できませんでした') {
          msg.classList.remove('is-sending');
          msg.classList.add('is-failed');
          bar.remove();
          const note = document.createElement('p');
          note.className = 'msg__error';
          note.textContent = message;
          msg.appendChild(note);
        },
      };
    },
    /** 区切りの注記（コードの切り替えなど）。件数には数えない */
    note(text) {
      if (count === 0) return;
      const line = document.createElement('p');
      line.className = 'timeline__note';
      line.textContent = text;
      list.appendChild(line);
    },
    clear() {
      list.innerHTML = '';
      count = 0;
      root.dataset.empty = 'true';
    },
    get size() { return count; },
  };
}
