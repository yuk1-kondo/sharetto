# 💻 シェアっと (Sharetto) 📱

スマートフォンとPCの間でファイルやURLを簡単に転送できるWebアプリケーション。QRコードスキャンで即座に接続し、リアルタイムでデータを共有できます。

## 🎨 特徴

- **Liquid Glass UI**: 美しいガラス効果を使った現代的なデザイン
- **QRコード連携**: PCでQRコードを表示、モバイルで読み取ってファイル共有
- **PC間共有**: セッションコードを使って複数のPC間で直接ファイル共有
- **画像プレビュー**: アップロードした画像をサムネイル＆フルサイズプレビュー
- **リアルタイム同期**: Firebase Realtime Databaseによる即座のデータ同期
- **ファイル転送**: ドラッグ&ドロップまたはタップでファイルアップロード
- **URL共有**: WebページのURLを簡単に共有
- **認証システム**: セキュアなアクセス制御
- **レスポンシブデザイン**: PC・スマートフォン両対応
- **完全無料**: Firebase無料プランで運用

## 🚀 本番環境

- **URL**: https://sharetto.web.app
- **ホスティング**: Firebase Hosting
- **データベース**: Firebase Realtime Database
- **自動デプロイ**: Firebase CLI

## 🛠 技術スタック

- **Frontend**: HTML5, CSS3, JavaScript (ES6 Modules)
- **Backend**: Firebase Realtime Database (リアルタイムデータ同期)
- **Hosting**: Firebase Hosting (高速配信)
- **External Libraries**: QRCode Generator (QRコード生成)
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
1. **PC側**: https://sharetto.web.app にアクセス
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

### PC間共有
1. **🖥️ PC間共有**: PC側で「PC間共有」ボタンをクリック
2. **セッション作成**: 6桁のセッションコードが生成される
3. **コード共有**: セッションコードを他のPCに伝える
4. **参加**: 他のPCで同じセッションコードを入力
5. **ファイル共有**: 複数のPCで同時にファイルをアップロード・ダウンロード

## 🔧 ローカル開発

### 前提条件
- 最新のWebブラウザ
- Firebase CLI (デプロイ/エミュレータ用)
- Firebase プロジェクト設定

### セットアップ手順

1. リポジトリをクローン
```bash
git clone https://github.com/yuk1-kondo/sharetto.git
cd sharetto
```

2. ローカルでテスト（静的ホスティング）
```bash
# public ディレクトリを配信
npx serve public
# または（プロジェクトルートで）
python3 -m http.server 8000
# ブラウザで http://localhost:8000/public/ にアクセス
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
firebase use sharetto
```

4. デプロイ
```bash
firebase deploy
```

Functions を利用する場合は、後述の「自動削除(10分)」セクションも参照してください。

## 📝 ファイル構成

```
├── public/                     # ホスティング対象
│   ├── index.html             # PC側UI (QR表示/閲覧)
│   ├── upload.html            # モバイルUI (アップロード/URL共有)
│   ├── pc-share.html          # PC間共有UI（6桁コード）
│   ├── join-session.html      # セッション参加UI（コード入力）
│   ├── config.js              # Firebase公開設定（共通化）
│   └── upload-liquid-glass.html # 互換: upload.html にリダイレクト
├── firebase.json               # Firebase Hosting 設定
├── database.rules.json         # Realtime Database セキュリティルール
├── functions/                  # Cloud Functions（自動削除の定期実行）
│   ├── index.js
│   └── package.json
├── cost-optimization-plan.md   # コスト最適化方針
├── icon-design-brief.md        # アイコンデザイン企画
└── README.md                   # このファイル
```

## 🔐 認証・セキュリティ

- PC側: Google アカウントでログイン（Firebase Auth）
- モバイル側: 匿名認証（Firebase Auth）
- ルール: `auth != null` を前提に、セッションIDとタイムスタンプでアクセス制御（`database.rules.json`）
- 招待コードUI: 廃止（クライアント側直書きはセキュリティにならないため）
- 設定の共通化: `public/config.js` にFirebase公開設定を集約

## 🧹 自動削除（10分）

UIでは10分の残り時間を表示し、ルールで「古いデータへの書込/読込」を抑制しています。実データの削除は Cloud Functions の定期実行で行います。

- スケジュール: 1分ごとに実行
- クリーニング対象: `files/{sessionId}/{fileId}`, `pc-share/{sessionId}/{fileId}`
- 期限: 10分経過したアイテムを削除。空になったセッションノードも削除

デプロイ手順（初回）:
```bash
cd functions
npm ci # or npm install
cd ..
firebase deploy --only functions
```
ローカルでエミュレーションする場合は Firebase Emulator Suite を利用できます。

## 🤝 コントリビューション

プルリクエストや Issue の報告を歓迎します！

1. このリポジトリをフォーク
2. 新しいブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'Add some amazing feature'`)
4. ブランチにプッシュ (`git push origin feature/amazing-feature`)
5. プルリクエストを作成

## 📄 ライセンス / 作者 / 謝辞

MIT License

作者: **YUKI KONDO**
- GitHub: [@yuk1-kondo](https://github.com/yuk1-kondo)

謝辞:

このプロジェクトの開発にあたり、以下の技術・サービスを使用させていただきました：

- [Firebase](https://firebase.google.com/) - リアルタイムデータベース・ホスティング
- [QRious.js](https://github.com/neocotic/qrious) - QRコード生成ライブラリ
- [GitHub Copilot](https://github.com/features/copilot) - AI プログラミングアシスタント

---

⭐ このプロジェクトが役に立った場合は、ぜひスターをお願いします！

## 🤝 コントリビューション

プルリクエストや Issue の報告を歓迎します！
