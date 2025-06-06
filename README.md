# 💻 らくらく転送 📱

ディック・ブルーナ風マテリアルデザインのファイル転送サービス。QRコードスキャンでスマートフォンとPCの間でファイルを簡単に転送できるWebアプリケーション。

## 🎨 特徴

- **美しいデザイン**: ディック・ブルーナ風の単色マテリアルデザイン
- **PC側**: ロイヤルブルー (`#4169E1`) の洗練されたUI
- **モバイル側**: ビビッドオレンジ (`#FF6B35`) の親しみやすいUI
- **QRコードによる簡単接続**: PCでQRコードを表示、スマホでスキャンして接続
- **サムネイル表示**: 画像ファイルは40x40pxのプレビュー付き
- **リアルタイム同期**: アップロードされたファイルが即座にPC側に表示
- **レスポンシブデザイン**: PC・スマートフォン両対応
- **完全無料**: Firebase Spark (無料) プランで運用

## 🚀 本番環境

- **URL**: https://rakuraku.pages.dev
- **ホスティング**: Cloudflare Pages
- **データベース**: Firebase Realtime Database
- **自動デプロイ**: GitHub連携

## 🛠 技術スタック

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Backend**: Firebase Realtime Database (リアルタイムデータ同期)
- **Hosting**: Cloudflare Pages (高速グローバル配信)
- **External Libraries**: QRCode.js
- **Design**: Material Design + Dick Bruna Style

## 🏗 アーキテクチャ

```
PC側 (ブルーデザイン) ←→ Firebase Realtime Database ←→ モバイル側 (オレンジデザイン)
                              ↓
                     Cloudflare Pages (ホスティング)
```

## 📱 使い方

1. **PC側**: https://rakuraku.pages.dev にアクセス
2. **QRコード表示**: 自動生成されたQRコードが表示
3. **スマホでスキャン**: QRコードリーダーでスキャン
4. **ファイルアップロード**: タップまたはドラッグ&ドロップでアップロード
5. **PC側で受信**: サムネイル付きでファイルが表示、ダウンロード可能

## 🔧 ローカル開発

### 前提条件
- 最新のWebブラウザ
- Firebase プロジェクト設定

### セットアップ

1. リポジトリをクローン
```bash
git clone https://github.com/yuk1-kondo/rakuraku.git
cd rakuraku
```

2. ローカルサーバーで起動
```bash
# シンプルなHTTPサーバーで起動
python3 -m http.server 8000
# または
npx serve public
```

2. Firebase CLIをインストール
```bash
npm install -g firebase-tools
```

3. Firebaseにログイン
```bash
firebase login
```

4. Firebaseプロジェクトを初期化
```bash
firebase init
```

5. デプロイ
```bash
firebase deploy
```

詳細なデプロイ手順は `RakuDrop Clone デプロイ手順.md` を参照してください。

## 📝 ファイル構成

```
├── index.html              # PC側UI (QRコード表示画面)
├── upload.html             # スマホ側UI (ファイルアップロード画面)
├── index.js                # Firebase Functions (自動削除機能)
├── firebase.json           # Firebase設定
├── storage.rules           # Firebase Storage セキュリティルール
├── database.rules.json     # Firebase Realtime Database セキュリティルール
└── docs/                   # ドキュメント
    ├── システムアーキテクチャ.md
    ├── デプロイ手順.md
    └── プロジェクト ToDo.md
```

## 🔐 セキュリティ

- セッションベースのアクセス制御
- 24時間自動ファイル削除
- Firebase セキュリティルールによるアクセス制限

## 📄 ライセンス

MIT License

## 🤝 コントリビューション

プルリクエストやイシューの報告を歓迎します。

---

作成者: Yuki
作成日: 2025年6月5日
