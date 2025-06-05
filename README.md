# RakuDrop Clone

スマートフォンとPCの間でファイルを簡単に転送できるWebアプリケーション。QRコードスキャンによるシンプルな操作で、ファイル共有を実現します。

## 🚀 機能

- **QRコードによる簡単接続**: PCでQRコードを表示、スマホでスキャンして接続
- **ドラッグ&ドロップアップロード**: 直感的なファイルアップロード
- **リアルタイム同期**: アップロードされたファイルが即座にPC側に表示
- **自動ファイル削除**: 24時間後に自動的にファイルが削除される安全設計
- **レスポンシブデザイン**: PC・スマートフォン両対応

## 🛠 技術スタック

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Backend**: Firebase
  - Firebase Hosting (静的サイトホスティング)
  - Firebase Storage (ファイルストレージ)
  - Firebase Realtime Database (リアルタイムデータ同期)
  - Firebase Functions (自動削除機能)
- **External Libraries**: QRCode.js

## 🏗 アーキテクチャ

```
PC側UI (QRコード表示) ←→ Firebase Realtime Database ←→ スマホ側UI (ファイルアップロード)
                              ↕
                     Firebase Storage (ファイル保存)
                              ↕
                     Firebase Functions (自動削除)
```

## 📱 使い方

1. PC側でアプリケーションを開き、QRコードを表示
2. スマートフォンでQRコードをスキャン
3. ファイルを選択またはドラッグ&ドロップでアップロード
4. PC側にファイルが表示され、ダウンロード可能

## 🔧 セットアップ

### 前提条件
- Node.js
- Firebase CLI
- Googleアカウント

### インストール

1. リポジトリをクローン
```bash
git clone https://github.com/yuk1-kondo/rakuraku.git
cd rakuraku
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
