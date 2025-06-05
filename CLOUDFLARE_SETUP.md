# 🚀 らくらく転送 - Cloudflare Pages デプロイ手順

## 📋 手順

### 1️⃣ GitHubリポジトリ作成
1. https://github.com/new にアクセス
2. リポジトリ名: `rakuraku-transfer`
3. Public リポジトリとして作成

### 2️⃣ コードをプッシュ
```bash
git remote add origin https://github.com/YOUR_USERNAME/rakuraku-transfer.git
git branch -M main
git push -u origin main
```

### 3️⃣ Cloudflare Pages セットアップ
1. https://dash.cloudflare.com/pages にアクセス
2. "Create a project" をクリック
3. "Connect to Git" を選択
4. GitHubアカウントを連携
5. `rakuraku-transfer` リポジトリを選択

### 4️⃣ ビルド設定
- **Framework preset**: None
- **Build command**: (空)
- **Build output directory**: `public`
- **Root directory**: (空)

### 5️⃣ ドメイン設定
- **カスタムドメイン**: `rakuraku-transfer.pages.dev` (自動割り当て)
- **カスタムサブドメイン**: 好きな名前に変更可能

## 🎯 完了後のURL例
- https://rakuraku-transfer.pages.dev
- https://your-custom-name.pages.dev

## ⚡ 自動デプロイ
- Gitプッシュごとに自動デプロイ
- プレビューデプロイ機能
- ロールバック機能
