---
version: 3.0
name: Sharetto-Instrument-design-system
description: >-
  シェアっと — Apple のシステム感 × Teenage Engineering の計器感。
  アルミ地・黒インク・シグナルオレンジ1色。3D なし・軽量・ライト/ダーク両対応。
theme: instrument
---

# Sharetto DESIGN.md

## 1. コンセプト

- **計器のように一目でわかる**: 状態は LED・リンク表示（PC ··· スマホ）・モノスペース表示で伝える
- **1画面1目的**: PC＝「つなぐ・受け取る・送る」、スマホ＝「選ぶ・送る」
- **装飾より余白**: カードは影1段、色はオレンジ1色のみをアクセントに使う
- **3D・外部フォントなし**: システムフォントと CSS だけで描画（初回表示を速く）

## 2. カラー（`css/app.css` の `:root`）

| トークン | Light | Dark | 役割 |
|---------|-------|------|------|
| `--bg` | `#ebebe7` | `#0b0b0a` | アルミ地（ドットグリッド付き） |
| `--surface` | `#ffffff` | `#171716` | パネル |
| `--surface-2` | `#f5f5f2` | `#1f1f1d` | 入力・リスト行 |
| `--ink` | `#0f0f0e` | `#f2f2ee` | 文字・primary ボタン |
| `--ink-2` / `--ink-3` | `#55554f` / `#8b8b84` | `#a8a8a1` / `#6f6f69` | 本文補助 / ラベル |
| `--accent` | `#ff5b14` | 同左 | 送信キー・番号・転送中 |
| `--display` | `#121211` | `#000000` | 参加コード等の OLED 表示 |
| `--ok` / `--warn` / `--err` | `#22a652` / `#f2a516` / `#e5483d` | 同左 | LED |

オレンジ地の文字は黒（`--accent-ink`）でコントラストを確保する。

## 3. タイポグラフィ

- 本文: `-apple-system, "SF Pro Text", "Hiragino Sans", "Noto Sans JP", "Segoe UI", system-ui`
- 数字・ラベル: `ui-monospace, "SF Mono", "JetBrains Mono", Menlo`（`.eyebrow` は 11px 大文字・字間 0.12em）
- 見出し 22px/700、大見出し 26–34px、本文 15px、補助 12–13px

## 4. コンポーネント

| クラス | 用途 |
|-------|------|
| `.panel` | 角丸 26px のカード。`.eyebrow` で「01 CONNECT」のように番号付き見出し |
| `.btn` (`--primary` / `--accent` / `--ghost` / `--quiet`) | ピル型ボタン。最小 44px（タッチ） |
| `.segmented` + `.tab-button` | Apple 風セグメント切替 |
| `.display` / `.code-input` | OLED 風の黒い表示部（参加コード） |
| `.link` | PC ··· スマホ のリンク表示。`body[data-connection-state]` で色・動きが変わる |
| `.led` / `.status-pill` | 状態 LED（待機=点滅グレー、接続中=点滅アンバー、接続=緑、転送=オレンジ、失敗=赤） |
| `.item` | 受信行（サムネイル or 拡張子タイル・名前・メタ・アイコン操作） |
| `.dock` | スマホ下部の送信ボタン（親指で押せる位置に固定） |

## 5. レイアウト

- **PC（index.html）**: 上部バー（ブランド・有効期限・新しいコード）＋ 左 390px「接続」（QR・参加コード）＋ 右「リンク状態 → 送信 → 受信」
- **〜980px**: 1カラム。順序は「リンク状態 → 接続 → 送信 → 受信」
- **スマホ（upload.html）**: 状態 → セグメント（写真・ファイル / テキスト・リンク）→ 大きな選択キー → 下部ドックで送信
- **参加（join.html / 認証画面）**: 中央1カラム、OLED 風コード入力

## 6. ルール

```
css/app.css のトークンとコンポーネントだけを使う。新しい色を足さない。
JS が参照する DOM id（README / 各 pages/*.js）を維持する。
ユーザー由来の文字列は textContent で挿入する（file-items.js 参照）。
```
