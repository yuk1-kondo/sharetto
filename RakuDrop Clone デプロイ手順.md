# RakuDrop Clone デプロイ手順

## 前提条件
- Googleアカウント
- Firebase CLIのインストール (`npm install -g firebase-tools`)

## デプロイ手順

### 1. Firebaseプロジェクトの作成
1. [Firebase Console](https://console.firebase.google.com/)にアクセス
2. 「プロジェクトを追加」をクリック
3. プロジェクト名を入力（例：rakudrop-clone）
4. Google アナリティクスの設定（任意）
5. 「プロジェクトを作成」をクリック

### 2. 必要なサービスの有効化
1. **Firebase Hosting**
   - 左メニューから「Hosting」を選択
   - 「開始する」をクリック
   - 画面の指示に従って設定

2. **Firebase Storage**
   - 左メニューから「Storage」を選択
   - 「開始する」をクリック
   - セキュリティルールを選択（テスト用なら「テストモードで開始」）

3. **Firebase Realtime Database**
   - 左メニューから「Realtime Database」を選択
   - 「データベースを作成」をクリック
   - ロケーションを選択
   - セキュリティルールを選択（テスト用なら「テストモードで開始」）

4. **Firebase Functions**
   - 左メニューから「Functions」を選択
   - 「開始する」をクリック
   - Blaze プラン（従量課金制）にアップグレードする必要があります

### 3. Firebase設定情報の取得
1. プロジェクト設定（⚙️アイコン）をクリック
2. 「全般」タブの「マイアプリ」セクションで「</>」（Webアプリ）をクリック
3. アプリのニックネームを入力（例：rakudrop-web）
4. 「アプリを登録」をクリック
5. 表示されるFirebaseConfigの情報をコピー

### 4. ローカルプロジェクトの設定
1. ターミナルでFirebaseにログイン
   ```
   firebase login
   ```

2. プロジェクトを初期化
   ```
   cd rakudrop-clone
   firebase init
   ```
   - 使用するサービスを選択（Hosting, Storage, Realtime Database, Functions）
   - 既存のプロジェクトを選択
   - 各サービスのデフォルト設定を確認

3. Firebase設定情報の適用
   - `public/index.html`と`public/upload.html`の両方のファイルを開く
   - `firebaseConfig`オブジェクトを、コピーした設定情報で置き換える

### 5. Functionsの依存関係インストール
```
cd functions
npm install firebase-admin firebase-functions
```

### 6. デプロイ
```
cd ..
firebase deploy
```

### 7. 動作確認
1. デプロイ完了後に表示されるHosting URLにアクセス
2. QRコードが表示されることを確認
3. スマートフォンでQRコードをスキャン
4. ファイルをアップロードして転送できることを確認

## 注意事項
- Firebase Functionsを使用するには、Blazeプラン（従量課金制）が必要です
- 無料枠の範囲内で使用する場合は、使用量に注意してください
- 本番環境では、適切なセキュリティルールを設定することをお勧めします
