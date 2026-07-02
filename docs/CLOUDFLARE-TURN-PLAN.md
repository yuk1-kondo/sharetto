# Cloudflare Realtime TURN 導入計画（Sharetto 直接接続用）

## 目的

Sharetto の **WebRTC 直接接続（P2P）** で、キャリア NAT や企業ファイアウォール越えに失敗するケースを減らす。  
ファイル本体は引き続き端末間で暗号化（DTLS）され、Cloudflare は中継のみ。

## なぜ Cloudflare か

| 項目 | 現状（無料 Open Relay） | Cloudflare Realtime TURN |
|------|-------------------------|---------------------------|
| 安定性 | 混雑・停止しやすい | 本番向け SLA・グローバルエッジ |
| 料金 | 無料（非保証） | 月 1,000 GB 無料枠後 $0.05/GB |
| 運用 | なし | ダッシュボードで利用量確認 |
| STUN | Google STUN（継続利用可） | Cloudflare STUN も無料 |

参考: [Cloudflare Realtime TURN FAQ](https://developers.cloudflare.com/realtime/turn/faq/)

## 料金試算（Sharetto 想定）

- 課金単位: Cloudflare エッジ → TURN クライアントへの **転送 GB**
- 無料枠: **月 1,000 GB**（SFU と共有）
- 超過: **$0.05 / GB**

| 利用規模 | 1回転送 | 月間回数 | 概算転送量 | 月額目安 |
|----------|---------|----------|------------|----------|
| 個人・検証 | 5 MB | 100 回 | ~0.5 GB | **$0**（無料枠内） |
| 小規模 | 10 MB | 1,000 回 | ~10 GB | **$0** |
| 中規模 | 20 MB | 5,000 回 | ~100 GB | **$0** |
| TURN 常用 | 30 MB | 50,000 回 | ~1.5 TB | **~$25/月** |

※ TURN は直接接続できないときだけ使われるため、全転送が TURN 経由になるわけではない。

## 導入フェーズ

### Phase 0 — 前提（現在）

- [x] サーバー経由（RTDB relay）で確実に送受信
- [x] 接続状態 UI（プレゼンス）で「接続済み」を表示
- [ ] P2P は STUN + 無料 TURN（不安定）

### Phase 1 — Cloudflare アカウント準備（1日）

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) でアカウント作成（既存可）
2. **Realtime** 製品を有効化
3. TURN 用 **API トークン** またはアプリ ID を発行
4. 請求アラート設定（例: 月 $10 超で通知）

### Phase 2 — クレデンシャル API（1〜2日）

Cloudflare TURN は短期トークンを推奨。本番では **バックエンドでトークン発行** が望ましい。

```
[スマホ/PC] ──GET /api/turn-credentials──▶ [Firebase Functions]
                                              │
                                              ▼
                                    Cloudflare API（TTL 24h 等）
                                              │
◀────────────── iceServers JSON ──────────────┘
```

**Spark（無料）プランの場合**

- Firebase Functions でトークン発行エンドポイントを追加
- または開発初期はダッシュボードの静的クレデンシャル（ローテーション手動）

**Blaze 推奨理由**: Functions 常時呼び出し・Secrets 管理が楽

### Phase 3 — アプリ組み込み（半日）

`public/config.js` の `customTurn` を Cloudflare 値に差し替え:

```javascript
export const iceConfig = {
  stun: ['stun:stun.cloudflare.com:3478', /* 既存 Google STUN も併用可 */],
  turn: [], // 無料 Open Relay は本番で削除
  customTurn: {
    urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:5349?transport=tcp'],
    username: '<from-api>',
    credential: '<from-api>',
  },
};
```

`public/js/ice-config.js` は既に `customTurn` を最優先で読み込む。

### Phase 4 — 検証（1〜2日）

| テスト | 期待結果 |
|--------|----------|
| 同一 Wi‑Fi | P2P 直接 or host 候補で接続 |
| スマホ LTE + 自宅 PC | TURN リレーで接続 |
| 会社 Wi‑Fi | TCP TURN（`:5349`）で接続 |
| 接続失敗時 | 自動でサーバー経由にフォールバック |

Chrome `chrome://webrtc-internals` で `candidateType: relay` を確認。

### Phase 5 — 本番運用

- 月次: Cloudflare Realtime ダッシュボードで GB 確認
- 四半期: TURN 利用率が低ければ無料枠内で継続、高ければ料金最適化
- 障害時: サーバー経由モードを UI デフォルトに切替可能（既存機能）

## 必要な契約・プラン

| サービス | プラン | 用途 |
|----------|--------|------|
| Cloudflare | Free 〜 Pro（$20/月） | TURN 利用にアカウント必須。Pro は WAF 等別用途 |
| Cloudflare Realtime TURN | 従量（1,000 GB 無料） | 直接接続の中継 |
| Firebase | Spark → **Blaze 推奨** | TURN トークン API（Functions） |

**最低コスト構成**: Cloudflare Free + Realtime 従量 + Firebase Blaze（Functions 無料枠内）

## リスクと対策

| リスク | 対策 |
|--------|------|
| TURN コスト増 | 請求アラート、サーバー経由をデフォルトに |
| トークン漏洩 | 短期 TTL + サーバー発行のみ |
| P2P 依然失敗 | サーバー経由は既に双方向対応済み |

## 次のアクション（優先順）

1. **今すぐ**: サーバー経由で双方向 + 接続済み UI（本改修）
2. **今週**: Cloudflare アカウント作成、Realtime 有効化
3. **来週**: Functions で TURN クレデンシャル API
4. **検証後**: 無料 Open Relay 削除、本番 TURN 切替

## 関連ファイル（実装時）

- `public/config.js` — `iceConfig.customTurn`
- `public/js/ice-config.js` — ICE サーバー組み立て
- `functions/` — TURN トークン発行 API（新規）
- `docs/CLOUDFLARE-TURN-PLAN.md` — 本ドキュメント
