#!/bin/bash

echo "🔥 Firebase デプロイスクリプト"

# Firebase CLIのインストール確認
if ! command -v firebase &> /dev/null; then
    echo "Firebase CLIをインストール中..."
    npm install -g firebase-tools
fi

echo "Firebaseにログイン（ブラウザが開きます）"
firebase login

echo "プロジェクトをデプロイ中..."
firebase deploy

echo "✅ デプロイ完了！"
echo "🌐 アクセスURL: https://rakupic.web.app/"
