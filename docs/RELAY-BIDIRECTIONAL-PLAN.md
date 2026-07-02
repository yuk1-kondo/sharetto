# サーバー経由 双方向通信・接続状態 改修計画

## 課題

1. QR 読み込み後も PC・スマホが「接続待機中」のまま → 繋がっていないと誤解
2. PC → スマホへの送信が P2P 時のみ → サーバー経由では送れない

## 設計

### RTDB パス

| パス | 方向 | 用途 |
|------|------|------|
| `files/{sessionId}` | スマホ → PC | 既存（変更なし） |
| `outbox/{sessionId}` | PC → スマホ | 新規 |
| `presence/{sessionId}/mobile` | スマホ → PC | 参加通知 |

### 接続フロー（サーバー経由）

```
スマホ QR 読込
    │
    ├─ presence/mobile に online: true を書き込み
    ├─ スマホ UI: 「接続完了」
    │
    ▼
PC が presence を監視
    │
    ├─ スマホ参加を検知
    └─ PC UI: 「接続完了」+ 送信パネル表示
```

### PC → スマホ送信

- テキスト / URL / ファイル（Data URL、既存 encode と同方式）
- `outbox/{sessionId}/{entryId}` に書き込み
- スマホは `outbox` をリッスンし「PCから受信」に表示

## 実装ファイル

| ファイル | 役割 |
|----------|------|
| `js/relay-presence.js` | 参加通知・監視 |
| `js/relay-outbox.js` | PC 送信・スマホ受信 |
| `js/pages/pc-view.js` | プレゼンス監視、relay 送信 |
| `js/pages/mobile-upload.js` | 参加宣言、outbox 受信 |
| `database.rules.json` | presence / outbox ルール |
| `index.html` | 送信パネル UI（URL 追加） |

## 完了条件

- [x] サーバー経由 + QR 参加で両端「接続完了」
- [x] P2P 失敗 → relay 切替後も両端「接続完了」
- [x] PC から写真・ファイル・URL・テキストをスマホへ送信
- [x] スマホ「PCから受信」に表示・保存可能
