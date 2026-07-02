---
version: 2.0
name: Sharetto-Claude-design-system
description: >-
  シェアっと — Anthropic / Claude 公式風ベージュ基調。3D なし・フラット・可読性優先。
theme: claude-warm
sources:
  - https://github.com/VoltAgent/awesome-design-md (claude)
---

# Sharetto DESIGN.md

## 1. Visual Theme & Atmosphere

- **ムード**: 温かいクリーム地、編集的で人間的（Claude 公式サイト準拠）
- **密度**: ゆったり — カード間 16–24px、十分な余白
- **哲学**: **3D なし**。機能第一、フラット 2 カラム

## 2. Color Palette

| トークン | Hex | 役割 |
|---------|-----|------|
| `canvas` | `#faf9f5` | ページ背景 |
| `surface` | `#ffffff` | カード |
| `canvas-soft` | `#f5f0e8` | ステータスバー・QR枠内 |
| `ink` | `#141413` | 見出し |
| `body` | `#3d3d3a` | 本文 |
| `muted` | `#6c6a64` | 補助テキスト |
| `hairline` | `#e6dfd8` | ボーダー |
| `primary` | `#cc785c` | CTA（テラコッタ） |
| `primary-active` | `#a9583e` | hover |

## 3. Typography

- **Display**: Lora（serif）— 見出し
- **Body**: Inter — UI 全体
- **Mono**: JetBrains Mono — 参加コード

## 4–8. Components / Layout

- CSS: `design-tokens.css` + `sharetto-app.css`
- レイアウト: ヘッダー + ステータス + 左 360px（接続）/ 右（受信）
- ボタン: 40px 高、primary は coral、secondary は ghost

## 9. Agent Prompt

```
DESIGN.md と sharetto-app.css に従う。ベージュ基調・3D 禁止・DOM id 維持。
```
