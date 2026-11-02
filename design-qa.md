# Sharetto — Quiet Index / 写真ギャラリー QA

確認日: 2026年11月2日。公開デプロイは未実施。

## Source visual truth

- ユーザーが選択した直近の1番: `/Users/yuki/.codex/generated_images/01a19994-1289-77d1-b2b2-4d0081a97d20/exec-97e42b2a-786c-4236-9939-4d9d7e848eca.png`
- 写真ギャラリーの追加要求を反映した修正版: `/Users/yuki/.codex/generated_images/01a19994-1289-77d1-b2b2-4d0081a97d20/exec-4d686a3d-90b8-4e2c-b2fc-e71d343e4253.png`
- 参考: https://www.nuevo.tokyo/home 。実測したナビ・説明文は IBM Plex Mono / 14px / 400。

## Implementation evidence

- URL: http://127.0.0.1:4173/ （ローカル専用のFirebaseエミュレーターを使用。公開プロジェクトには接続しないプレビューサーバー）
- PC: `/Users/yuki/.codex/visualizations/2026/11/02/01a19994-1289-77d1-b2b2-4d0081a97d20/sharetto-gallery/desktop.png`
- Mobile: `/Users/yuki/.codex/visualizations/2026/11/02/01a19994-1289-77d1-b2b2-4d0081a97d20/sharetto-gallery/mobile.png`
- Full comparison: `/Users/yuki/.codex/visualizations/2026/11/02/01a19994-1289-77d1-b2b2-4d0081a97d20/sharetto-gallery/comparison.png`
- Focused comparison: `/Users/yuki/.codex/visualizations/2026/11/02/01a19994-1289-77d1-b2b2-4d0081a97d20/sharetto-gallery/typography-comparison.png`
- PC viewport1440×1024 CSS px、スクリーンショット1440×1024。原画像1487×1058を1440×1024に正規化して同じ比較画像内に並べた。拡縮に由来する微小差は判定から除外。
- Mobile viewport390×844、全ページキャプチャ。横はみ出しなし、写真2列（各167px）。
- 状態: 接続済み、ローカル検証用の写真3枚・通常ファイル1件。ファイル名、参加台数、コード、残り時間、写真の内容は実データに応じて変わる。公開版にサンプルを埋め込んでいない。

## Findings / comparison history

1. [P2 / fixed] 初回は方眼の線が強く、受信欄が約50px下がっていた。生成背景を不透明度0.26にし、イントロ・受信欄の余白と送信欄の配置を調整。最終比較で見出し・QR・ギャラリーが参照と同じ配置関係になった。
2. [P2 / fixed] 写真と通常ファイルが混ざると、通常ファイルの全幅行がギャラリーを分断した。写真を先、通常ファイルを後に並べるCSS orderを指定。PC3列、スマホ2列をブラウザで確認。
3. [P2 / fixed] 画像プレビューが旧モーダルに依存していた。native dialogに統一し、画像を押す→拡大→Escape→元の写真にフォーカスが戻る操作を確認。
4. 一時的にスクロール位置とviewportが異なるキャプチャを検出して不採用とした。ページ先頭・1440×1024で撮り直した最終比較を使用。

## Required fidelity surfaces

- Typography: 本文14px、見出し16px、太さ400。英数字IBM Plex Mono、日本語Noto Sans JP。実際のcomputed styleでも見出し16px/400を確認。大きな太字・絵文字中心の操作を廃止。
- Layout: 左の接続欄と右の送受信欄。接続後もQRを維持。200px正方形サムネイル、軽い罫線、角丸・大きな影なし。受信数・ZIP・参加用ナビは実機能に必要な追加。
- Color: 白地、黒文字、薄い罫線、黒い主ボタン。背景の濃さは読みやすさを優先して控えめにしている。
- Images: 方眼は生成した実素材。写真はユーザーが受信する画像で、aspect-ratio:1 / object-fit:coverのサムネイル。拡大時は元の比率を保つ。標準UI操作は文字ラベルで表示し、独自のSVG等で画像を代替していない。
- Copy: 写真・ファイルを選ぶ、テキスト・リンクを送る、保存という具体的なラベル。ファイル上限50MB。通信の詳細は設定にまとめた。

## Interaction / checks

| 項目 | 結果 |
|---|---|
| ページ識別・空白画面・エラーオーバーレイ | 正常 |
| Console errors / warnings | アプリの該当エラーなし |
| PC / mobile screenshot | 確認済み |
| 実際のWebRTC写真・通常ファイル受信 | 写真1枚とテキストファイル1件を別タブから選択・送信して確認 |
| サーバー経由のギャラリー | エミュレーターへの通常書込で写真3枚と通常ファイルを確認 |
| 写真の拡大・Escape・フォーカス復帰 | 確認済み |
| テキスト送信・使い方ダイアログ | 確認済み |
| 2時間延長・QR維持 | 確認済み |
| ZIP保存 | ブラウザから保存されたZIPを読み、4ファイルすべて元データとバイト一致、CRC正常 |
| 個別保存 | クリックとダウンロード開始を確認。大きなdata URLはBlob URLへ変換するよう改善。アプリ内ブラウザの実ファイル保存先までの照合は未完了 |
| 自動検証 | session-timer / session-cleanup / session-rulesの3テスト通過。JavaScript47モジュールの構文検証通過 |

## Assets

- Built-in ImageGenで生成した背景: `public/assets/grid-paper.png`
- Prompt summary: 白い紙、非常に薄い均一な正方形の方眼、文字・影・パース・余白なし、繰り返し背景用。
- 検証用写真はImageGen生成のローカル専用素材。公開HTMLへ固定の写真として入れていない。

## Intentional deviations / remaining risk

- QRは実際のセッション用コードを生成するため、参照画像の模様とは異なる。
- 原寸写真ではなくサムネイルを表示し、元の写真は拡大・保存で扱う。
- 同じ書体でも日本語グリフや写真の内容には参照画像との差がある。小さい文字と400ウェイト、薄い背景、同じ列構成は維持。
- 実機iPhone/Android、物理的なQR読み取り、異なるネットワーク間、個別保存の実機ファイル照合は未確認。
- ダウンロードの実行環境差は保存動作の追加確認項目。画像一覧・拡大・接続の表示を阻害する未解決のP0/P1/P2はない。

## Implementation checklist

- [x] 選択した1番の細い文字・方眼・余白を実装
- [x] P2P/relayで共通の写真ギャラリー
- [x] 写真以外のファイル一覧、個別保存、ZIP操作を維持
- [x] キーボード拡大・閉じる、スマホ幅を確認
- [x] 新しい最終比較を検査
- [ ] 実機スマホで個別保存とQR読み取りを確認
- [ ] ユーザー確認後に公開版へ反映


## 追記: 文章・URLの統合（2026年11月2日）

ユーザーの追加指示を正本とする部分変更。スクエアのギャラリー、文字、背景、写真の保存処理を維持し、文章・URLの入力欄と受信一覧をギャラリー下へ移した。元の承認画像とはこの部分が意図的に異なる。

- PCもスマホも入力欄は1つ。スマホのリンク・文章タブを廃止。
- 受信一覧はTEXT/LINK、小さい時刻、本文、コピーを罫線で整列。
- 混在する文章内のHTTP(S) URLをリンクとして表示。HTML挿入を使わずテキストノードを生成。
- WebRTCで文章＋URL・URL単体を送信し、PC→スマホの受信も確認。
- 改行を含む本文のコピー、URL単体コピーがクリップボードと一致。
- サーバー経由でも同じ一覧に表示。方式切替時は既存の写真・文章を消さず、再読込した項目が重複しないよう共通化。写真3枚、通常ファイル1件、受信文章2件の維持を確認。
- PC1440×1024、スマホ390×844で検証。スマホの横はみ出しなし。ギャラリー下に統合欄があることをDOM座標でも確認。実行時の該当エラー・警告なし。
- PC全体: /Users/yuki/.codex/visualizations/2026/11/02/01a19994-1289-77d1-b2b2-4d0081a97d20/sharetto-notes/desktop.png
- スマホ: /Users/yuki/.codex/visualizations/2026/11/02/01a19994-1289-77d1-b2b2-4d0081a97d20/sharetto-notes/mobile.png
- 全フロントエンドJavaScriptの構文検証通過。公開サイトには未反映。

final result: passed

## JP / EN language switch — 2026-11-02
- English is the default. The right-side language controls are present on the workspace, join and sender pages; a stored JP preference survives navigation/reload.
- Live changes preserve the current session URL and join code; no reload is used.
- UI text, placeholders, accessible names, timer and asynchronous status messages are localized through a shared dictionary. Shared note bodies, URLs, editable values, filenames and image titles are excluded.
- Browser checks: EN ↔ JP, saved preference, same session URL, sender at 390 px, real message/file renderers preserve Japanese content and filenames when toggled. Sender transfer smoke test did not finish initializing in this preview, so no new end-to-end send claim is made.
- Four tests pass: localization, session timer, cleanup, and emulator lifecycle rules. Changed JS syntax checks pass.
- Screenshot: /Users/yuki/.codex/visualizations/2026/11/02/01a19994-1289-77d1-b2b2-4d0081a97d20/sharetto-english.png
- This language update has not been deployed.
