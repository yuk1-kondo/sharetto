# 💻 らくらく転送 📱

スマートフォンとPCの間でファイルやURLを簡単に転送できるWebアプリケーション。QRコードスキャンで即座に接続し、リアルタイムでデータを共有できます。

## 🎨 特徴

- **美しいデザイン**: モダンなマテリアルデザイン
- **PC側**: 洗練されたブルー系UI
- **モバイル側**: 親しみやすいオレンジ系UI
- **QRコードによる簡単接続**: PCでQRコードを表示、スマホでスキャンして接続
- **ファイル転送**: ドラッグ&ドロップまたはタップでファイルアップロード
- **URL共有**: WebページのURLを簡単に共有
- **リアルタイム同期**: アップロードされたデータが即座にPC側に表示
- **認証システム**: セキュアなアクセス制御
- **レスポンシブデザイン**: PC・スマートフォン両対応
- **完全無料**: Firebase無料プランで運用

## 🚀 本番環境

- **URL**: https://rakupic-19e91.web.app
- **ホスティング**: Firebase Hosting
- **データベース**: Firebase Realtime Database
- **自動デプロイ**: Firebase CLI

## 🛠 技術スタック

- **Frontend**: HTML5, CSS3, JavaScript (ES6 Modules)
- **Backend**: Firebase Realtime Database (リアルタイムデータ同期)
- **Hosting**: Firebase Hosting (高速配信)
- **External Libraries**: QRious.js (QRコード生成)
- **Authentication**: カスタム認証システム
- **Design**: モダンマテリアルデザイン

## 🏗 アーキテクチャ

```
PC側 (ブルーUI) ←→ Firebase Realtime Database ←→ モバイル側 (オレンジUI)
                            ↓
                   Firebase Hosting (ホスティング)
```

## 📱 使い方

### 基本的な使い方
1. **PC側**: https://rakupic-19e91.web.app にアクセス
2. **新しいセッション**: 「新しいセッションを開始」をクリック
3. **QRコード表示**: 自動生成されたQRコードが表示
4. **スマホでスキャン**: QRコードリーダーでスキャン
5. **自動認証**: QRコードからのアクセスは自動で認証される

### ファイル転送
1. **📁 ファイルタブ**: デフォルトで選択済み
2. **ファイル選択**: タップまたはドラッグ&ドロップでファイル選択
3. **アップロード**: 「アップロード」ボタンをクリック
4. **PC側で受信**: リアルタイムでファイルが表示、ダウンロード可能

### URL共有
1. **🔗 URLタブ**: タブを切り替え
2. **URL入力**: 共有したいWebページのURLを入力
3. **プレビュー**: URLのプレビューが自動表示
4. **共有**: 「URLを共有」ボタンをクリック
5. **PC側で受信**: リアルタイムでURLが表示、クリック可能

## 🔧 ローカル開発

### 前提条件
- 最新のWebブラウザ
- Firebase CLI (デプロイ用)
- Firebase プロジェクト設定

### セットアップ

1. リポジトリをクローン
```bash
### セットアップ手順

1. リポジトリをクローン
```bash
git clone https://github.com/yuk1-kondo/rakuraku.git
cd rakuraku
```

2. ローカルでテスト
```bash
# シンプルなHTTPサーバーで起動
python3 -m http.server 8000
# または
npx serve public
```

### Firebase デプロイ (本番環境)

1. Firebase CLIをインストール
```bash
npm install -g firebase-tools
```

2. Firebaseにログイン
```bash
firebase login
```

3. プロジェクトを選択
```bash
firebase use rakupic
```

4. デプロイ
```bash
firebase deploy
```

詳細なデプロイ手順は `FIREBASE_DEPLOY_GUIDE.md` を参照してください。

## 📝 ファイル構成

```
├── public/                 # 本番用ファイル
│   ├── index.html         # PC側UI (QRコード表示画面)
│   └── upload.html        # スマホ側UI (ファイル・URL共有画面)
├── index.html              # 開発用PC側UI
├── upload.html             # 開発用スマホ側UI
├── firebase.json           # Firebase設定
├── database.rules.json     # Firebase Realtime Database セキュリティルール
├── CHANGELOG.md            # 更新履歴
├── DEVELOPMENT_LOG.md      # 開発作業履歴
├── README.md               # このファイル
└── docs/                   # ドキュメント
    ├── FIREBASE_DEPLOY_GUIDE.md
    ├── URL_SHARING_GUIDE.md
    └── プロジェクト ToDo.md
```

## 🔐 認証・セキュリティ

- **アクセスコード認証**: 設定されたアクセスコードでの認証
- **QRコード自動認証**: QRコードからのアクセス時は自動認証
- **セッション管理**: 24時間有効な認証セッション
- **Firebase セキュリティルール**: データベースアクセス制御
- **セッションベースのアクセス制御**: 一意のセッションIDでデータ分離
- **自動データ削除**: 24時間後の自動削除（実装予定）

## 🤝 コントリビューション

プルリクエストや Issue の報告を歓迎します！

1. このリポジトリをフォーク
2. 新しいブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'Add some amazing feature'`)
4. ブランチにプッシュ (`git push origin feature/amazing-feature`)
5. プルリクエストを作成

## 📄 ライセンス

このプロジェクトは MIT ライセンスの下で公開されています。詳細は [LICENSE](LICENSE) ファイルを参照してください。

## 👨‍💻 作者

**YUKI KONDO**
- GitHub: [@yuk1-kondo](https://github.com/yuk1-kondo)

## 🎉 謝辞

このプロジェクトの開発にあたり、以下の技術・サービスを使用させていただきました：

- [Firebase](https://firebase.google.com/) - リアルタイムデータベース・ホスティング
- [QRious.js](https://github.com/neocotic/qrious) - QRコード生成ライブラリ
- [GitHub Copilot](https://github.com/features/copilot) - AI プログラミングアシスタント

---

⭐ このプロジェクトが役に立った場合は、ぜひスターをお願いします！
- Firebase セキュリティルールによるアクセス制限

## 📄 ライセンス

MIT License

## 🤝 コントリビューション

プルリクエストやイシューの報告を歓迎します。

---

作成者: Yuki
作成日: 2025年6月5日
