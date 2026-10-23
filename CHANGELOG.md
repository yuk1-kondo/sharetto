# Changelog

## 2026-10-23

- 画面はライトのみにした。端末がダークでも地の色は白のまま。送信の吹き出しの黒は、届いたものと送ったものを分ける色として残す
- 上部バー、参加コード、受信の吹き出し、入力欄をリキッドグラスにした。入力欄は下に浮かせ、QR の台紙は読み取りのため白のままにした

- ペアリング画面の下半分を静かにした。操作は「リンクをコピー」だけを残し、共有は共有できる端末だけ、新しいコードは詳細設定へ移した。スマホ幅の黒い案内帯は「このスマホから参加する」の一文にした
- 上部の状態表示は、待機中と接続完了では状態名だけにした。転送中のファイル名、失敗、サーバー経由のときだけ補足を出す
- 吹き出しから容量・文字数・「直接」を外した。容量は行にホバーするか、タッチ端末では行をタップすると出る。サーバー経由のときだけタグを残す
- 空画面とフッターのクレジットを1行にまとめた

- 書体を角ゴシックのまま、見出しを 600、参加コードを 500 に落として字間を詰めた。丸ゴシックや極太は使わない

- ペアリング画面を Apple の 1 列配置に寄せた。背景のドット格子と PHONE / PC のラベルを外し、参加コードは白いグループの中の大きな数字にした。スマホの空状態から大きなオレンジの＋を外した

- 画面構成を作り直し（見た目だけでなくワイヤーフレームから）
  - 画面を「ペアリング」と「やりとり」の2状態に整理。未接続の間は大きな QR と参加コードだけを表示し、つながると自動でやりとりの画面に切り替え
  - やりとりは送受信を1本のタイムライン（受信=左・白、送信=右・黒）に並べ、下部固定の入力バーから送る。PC 側と送信側ページで同じ構成に統一
  - 送信側のタブ・選択エリア・確認ステップを廃止。＋で選んだ瞬間に送り、吹き出しごとに進捗・失敗を表示
  - 画像は吹き出しの中で大きくプレビュー、テキストは本文だけを表示
  - PC では Enter で送信・Shift+Enter で改行（日本語変換中は送信しない）
  - 「新しいコード」を押してもやりとりの履歴は残し、区切りを表示
  - PC 側の受信をサーバー経由モードでも差分追加に統一（一覧の全再描画と「更新」ボタンを廃止）

- PC どうしのやり取りを改善
  - トップページで相手のコードの数字をそのままキーボード入力するだけで参加（「コードで接続」ダイアログ。自分のコードは弾く）
  - ⌘V / Ctrl+V の貼り付けで、スクリーンショットやファイルをすぐ送信（ファイル名は日時入りに自動変更）。テキストは入力欄に入れて確認後に送信
  - ウィンドウ全体へのドラッグ&ドロップで即送信（送信側ページにも対応）、⌘/Ctrl+Enter で送信
  - 送信を1本のキューで順番に流し、連続して送っても混線しないように
  - 送信側ページを 960px 以上で2カラム（送る / 受け取る）に
  - 直接接続中は、参加コードが10分で期限切れになっても接続を維持（切断されたら新しいコードを自動発行）
  - 背景タブで受信すると、タブのタイトルに未読数を表示
  - `join.html?code=123456` で開くと自動で参加

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
