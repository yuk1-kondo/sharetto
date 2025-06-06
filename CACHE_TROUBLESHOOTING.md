# 🔧 Cloudflare Pages キャッシュ問題 解決ガイド

## 🚨 問題状況
- デザイン変更をプッシュしたが、サイトに反映されない
- 古い黄色デザインのままキャッシュされている
- ブラウザの強制リロードでも変わらない

## 💡 解決方法

### 1️⃣ **URLパラメータ追加**
```
通常URL: https://rakuraku.pages.dev
キャッシュ回避: https://rakuraku.pages.dev?v=20250606
```

### 2️⃣ **Cloudflare Dashboard 手動操作**

#### 📍 アクセス手順
1. https://dash.cloudflare.com/pages にアクセス
2. **rakuraku** プロジェクトを選択
3. **"Deployments"** タブをクリック
4. 最新デプロイメントの状況確認

#### ⚡ キャッシュパージ
1. **"Caching"** → **"Configuration"**
2. **"Purge Everything"** をクリック
3. 確認ダイアログで **"Purge Everything"** を再クリック

#### 🔄 再デプロイ強制
1. **"Deployments"** タブ
2. 最新デプロイメント横の **"..."** メニュー
3. **"Retry deployment"** を選択

### 3️⃣ **Git強制プッシュ**
```bash
# ダミー変更を追加
echo "<!-- $(date) -->" >> index.html

# プッシュ
git add .
git commit -m "🔄 Force cache busting"
git push origin main
```

### 4️⃣ **ブラウザ別強制リロード**

#### 🖥️ **デスクトップ**
- **Chrome/Safari**: `Cmd + Shift + R`
- **Firefox**: `Cmd + F5`
- **開発者ツール**: `Network`タブで`Disable cache`

#### 📱 **モバイル**
- **プライベートブラウジング**で確認
- **ブラウザデータ削除**後に再アクセス

## 🎯 **期待されるデザイン**

### 🖥️ **PC側**
- 背景色: **ロイヤルブルー** (#4169E1)
- タイトル: **💻 QRコードをスキャンしてファイル転送 📱**
- 白い角丸コンテナ + 青いボーダー

### 📱 **モバイル側**  
- 背景色: **ビビッドオレンジ** (#FF6B35)
- タイトル: **📱 ファイルをアップロード**
- 白い角丸コンテナ + オレンジボーダー

### 👨‍💻 **共通**
- フッター: **"Created by YUKI KONDO"**
- マテリアルデザイン + ブルーナ風

## ⏰ **タイムライン**
- Cloudflare Pages: 通常1-3分でデプロイ
- グローバルキャッシュ: 最大5-10分で更新
- CDNエッジ: 地域により異なる

---
**最終更新**: 2025年6月6日 09:27
