# 🚀 Firebase デプロイ手順

## 📋 事前準備
1. **Firebase CLI インストール**
   ```bash
   npm install -g firebase-tools
   ```

2. **Firebaseにログイン**
   ```bash
   firebase login
   ```

## 🔧 プロジェクト設定
1. **Firebaseプロジェクト初期化**
   ```bash
   firebase init
   ```
   - Hosting を選択
   - 既存プロジェクト `rakupic` を選択
   - public ディレクトリを指定
   - SPA として設定

2. **デプロイ実行**
   ```bash
   firebase deploy
   ```

## 🌐 現在のFirebase設定
- **プロジェクトID**: rakupic
- **Database URL**: https://rakupic-default-rtdb.firebaseio.com
- **Hosting**: Firebaseプロジェクトで自動設定

## 📱 URL共有機能テスト方法
1. PC側でindex.htmlを開く
2. QRコードをスマホでスキャン
3. URL共有タブでURLを入力
4. PC側にリアルタイムで表示されることを確認

## 🔗 アクセスURL
デプロイ後のURL: https://rakupic.web.app/
