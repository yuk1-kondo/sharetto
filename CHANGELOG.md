# Changelog

## 2026-10-23

- フロントエンドを全面リデザイン（`DESIGN.md` v3 "Instrument"）
  - Apple × Teenage Engineering 風：アルミ地・黒インク・シグナルオレンジ、ライト/ダーク両対応
  - CSS を `css/app.css` 1 枚に統合（旧 7 ファイルを削除）。外部フォントと Three.js の接続ビジュアルを廃止し、CSS の「PC ··· スマホ」リンク表示に置き換え
  - PC：接続（QR・OLED風参加コード）／リンク状態／スマホへ送信／受信 の4ブロック構成。送信欄は URL を自動判別、複数ファイル・ドラッグ&ドロップ・⌘/Ctrl+Enter に対応
  - スマホ：「写真・ファイル」「テキスト・リンク」の2タブ、選択ファイルのサムネイル、下部固定の送信ボタン、受信画像のプレビュー
  - 受信アイテムを `file-items.js` に共通化し、ファイル名などを `textContent` で挿入（P2P 受信時の HTML 挿入を解消）
  - `files-view.js` で `createTextItem` が未定義になる不具合を修正

## 2025-08-31

- Stabilize first-time Realtime Database writes on `upload.html`:
  - Add connection warm-up using `.info/connected` and a no-op `get()`
  - Add retry wrapper with exponential backoff around DB writes
- Fix URL share permissions and robustness:
  - Allow writes without `size` by adjusting RTDB rules, then permit parent `timestamp`/`size` keys explicitly
  - Widen child item timestamp validate window to 5 minutes to tolerate clock skew
  - Switch `putFile`/`putUrl` to parent-level `update(files/{sessionId}, { [id]: payload, timestamp, size })`
  - Add fallback update paths for both file and URL from `upload.html`
- Fix PC side download action:
  - Expose `downloadFile` and `copyToClipboard` on `window` in `index.html`
- Cache-busting and diagnostics:
  - Add `?v=20250831a` to module imports on `upload.html`
  - Add version logs in `files-save.js` and `upload.html`
- Deployments:
  - Deployed Hosting and Database rules via Firebase

## 2025-08-31 (UI polish)

- Theme and visibility
  - Switch primary buttons to yellow; keep white text and hover
  - Force session timer to start in blue; keep warning(yellow)/critical(red) transitions
  - Force timer text (time + detail) to white across states
  - Make URL preview text dark on light background
- Mobile layout fixes (upload.html)
  - Prevent sticky action button overlapping inputs/status on small screens
  - Add extra bottom padding and margins for URL input and statuses
  - File preview name/size set to dark text; spacing improved
  - Compact, rounded “トップへ戻る” pill aligned left with consistent radius
- PC page tweaks (index.html)
  - Precisely center the top title; keep logout on the right
  - Remove obsolete inline comment at file end
  - Footer credit: “Develop by YUKI KONDO”
- Deployments:
  - Deployed Hosting updates multiple times during UI polish
