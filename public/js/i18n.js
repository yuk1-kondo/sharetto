import { translations } from './translations.js';

const KEY = 'sharetto.language';
export function translate(text, language = 'en') {
  if (language === 'ja') return text;
  const value = text.trim();
  let translated = translations[value];
  if (!translated) {
    const patterns = [
      [/^(\d+)台が参加中$/, (_, n) => `${n} device${n === '1' ? '' : 's'} connected`],
      [/^(\d+)時間(\d+)分$/, (_, h, m) => `${h}h ${m}m`],
      [/^まとめて保存 \/ ZIP \((\d+)\)$/, (_, n) => `Save all / ZIP (${n})`],
      [/^(\d+) 件を ZIP 保存しました$/, (_, n) => `Saved ${n} files as ZIP`],
      [/^(\d+)件を送信しました$/, (_, n) => `Sent ${n} files`],
      [/^(\d+) 件のファイル$/, (_, n) => `${n} files`],
      [/^(\d+) 件を送信$/, (_, n) => `Send ${n} files`],
      [/^(\d+) 件を送信中\.\.\.$/, (_, n) => `Sending ${n} files…`],
      [/^合計 (.+)$/, (_, size) => `Total ${size}`],
      [/^参加コード: (\d+)$/, (_, code) => `Join code: ${code}`],
      [/^(.+) を送信中 \((\d+)\/(\d+)\)$/, (_, name, i, n) => `Sending ${name} (${i}/${n})`],
      [/^(.+) を直接受信しました$/, (_, name) => `Received ${name} directly`],
      [/^(.+) をPCから受信しました$/, (_, name) => `Received ${name} from your computer`],
      [/^(.+) を受信しました$/, (_, name) => `Received ${name}`],
      [/^(.+) を受信中$/, (_, name) => `Receiving ${name}`],
      [/^(.+) を JPEG に変換中\.\.\.$/, (_, name) => `Converting ${name} to JPEG…`],
      [/^(.+) → JPEG に変換しました$/, (_, name) => `Converted ${name} to JPEG`],
      [/^(.+) が大きすぎます \(最大(\d+)MB\)$/, (_, name, size) => `${name} is too large (max ${size} MB)`],
      [/^(.+): 最大(\d+)MBまで$/, (_, name, size) => `${name}: maximum ${size} MB`],
      [/^送信に失敗しました: (.+)$/, (_, error) => `Could not send: ${translate(error, language)}`],
      [/^(.+)を拡大$/, (_, name) => `View ${name}`],
      [/^(.+)を保存$/, (_, name) => `Save ${name}`],
    ];
    for (const [pattern, render] of patterns) {
      if (pattern.test(value)) { translated = value.replace(pattern, render); break; }
    }
  }
  return translated ? text.replace(value, translated) : text;
}

// Localize presentation only. Shared notes, URLs, filenames and editable values
// are user data and must remain byte-for-byte unchanged in either language.
export function initLanguageSwitch(root = document) {
  let language = 'en';
  try { if (localStorage.getItem(KEY) === 'ja') language = 'ja'; } catch { /* Storage may be unavailable. */ }
  const records = new WeakMap();
  const excluded = 'script, style, textarea, input, .message-body, .file-name, #file-name, #qrUrl, #joinCode, [data-no-translate], .language-switch';
  const attributes = ['aria-label', 'placeholder', 'title'];
  function localize(node, key, read, write) {
    const current = read();
    const entries = records.get(node) || {};
    const previous = entries[key];
    const source = previous && previous.output === current ? previous.source : current;
    const output = translate(source, language);
    entries[key] = { source, output };
    records.set(node, entries);
    if (current !== output) write(output);
  }
  function render() {
    observer.disconnect();
    root.documentElement.lang = language;
    const walker = root.createTreeWalker(root.documentElement, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!node.parentElement?.closest(excluded)) {
        const text = node;
        localize(text, 'text', () => text.nodeValue, value => { text.nodeValue = value; });
      }
    }
    for (const element of root.querySelectorAll('[aria-label], [placeholder], [title]')) {
      if (element.closest('.message-body, .file-name, #file-name, #qrUrl, #joinCode, [data-no-translate], .language-switch')) continue;
      for (const attribute of attributes) {
        if (element.hasAttribute(attribute)) localize(element, attribute, () => element.getAttribute(attribute), value => element.setAttribute(attribute, value));
      }
    }
    for (const button of root.querySelectorAll('[data-language]')) button.setAttribute('aria-pressed', String(button.dataset.language === language));
    observer.observe(root.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: attributes });
  }
  // Existing transfer modules write status labels asynchronously. Observe only
  // presentation changes, retaining their original strings for live switching.
  const observer = new MutationObserver(render);
  for (const button of root.querySelectorAll('[data-language]')) {
    button.addEventListener('click', () => {
      language = button.dataset.language === 'ja' ? 'ja' : 'en';
      try { localStorage.setItem(KEY, language); } catch { /* Keep the in-memory choice. */ }
      render();
    });
  }
  render();
  return () => observer.disconnect();
}

if (typeof document !== 'undefined') initLanguageSwitch();
