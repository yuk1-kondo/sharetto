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
| `.btn` (`--primary` / `--accent` / `--ghost` / `--quiet`) | ピル型ボタン。最小 36–44px |
| `.segmented` + `.tab-button` | Apple 風セグメント切替（転送方式） |
| `.code-display` | 白いグループの中の大きな参加コード |
| `.link` | PC ··· スマホ のリンク表示。`body[data-connection-state]` で色・動きが変わる |
| `.led` / `.status-pill` | 上部バーの状態表示（待機=点滅グレー、接続中=点滅アンバー、接続=緑、転送=オレンジ、失敗=赤） |
| `.pair-stage` | ペアリング画面（大きな QR・参加コード・接続方法） |
| `.timeline` / `.msg--in` / `.msg--out` | 送受信を時系列で並べる吹き出し。受信=白・左、送信=黒・右 |
| `.item` | 吹き出しの中身（画像は大きくプレビュー、ファイルは拡張子タイル、テキストは本文のみ） |
| `.msg__progress` / `.is-failed` | 送信中の進捗バー／送信失敗の表示（吹き出しごと） |
| `.composer-bar` / `.composer-key` / `.send-key` | 下部固定の入力バー（＋・自動で伸びる入力欄・送信キー） |
| `.code-input` | 参加コードの入力欄。大きな数字、中央揃え |

## 5. レイアウト（画面は2つの状態だけ）

`body[data-view]` で切り替える。

- **pair（未接続）**: 画面中央の 1 列。短い見出し、白い台の QR、白いグループの中の大きな参加コード。背景に模様は置かない
- **session（接続後）**: 画面全体が1本のタイムライン（最大 820px 幅）＋下部固定の入力バー。PC 側（index.html）も送信側（upload.html）も同じ構成
  - PC 側は上部バーの「QRを表示」で、ペアリング画面をシートとして重ねられる（Esc / × で閉じる）
  - 接続が切れても履歴があれば session のまま。入力バーをロックし「QRを表示して再接続」を出す。何もやりとりしていなければ pair に戻る
- **送る操作**: ＋で選んだ瞬間に送信（選択→確認→送信の段階をなくした）。ドロップ・⌘/Ctrl+V も同じ。テキストは PC なら Enter 送信／Shift+Enter 改行、タッチ端末は送信キー
- **参加（join.html / 認証画面）**: 中央1カラム、OLED 風コード入力

## 6. ルール

```
css/app.css のトークンとコンポーネントだけを使う。新しい色を足さない。
新しい画面要素は timeline.js / composer.js / file-items.js を通す。
ユーザー由来の文字列は textContent で挿入する（file-items.js 参照）。
```
