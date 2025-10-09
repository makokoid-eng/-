# AkarI Lab ｜ AIの光で、人の人生に“あかり”を灯す

https://makokoid-eng.github.io/akarilab/

AkarI Lab は、AIを人の暮らしに温かく溶け込ませる開発プロジェクトです。  
第一弾の「食習慣サポートLINE Bot」は、写真を送るだけで〈野菜・たんぱく質・kcal〉の目安を返信します。

---

## 📘 構成
- `index.html` … メインLP（OGP/フォーム/投資家向け含む）
- `privacy.html`, `terms.html` … 各種ポリシー
- `assets/` … 画像・アイコン・OGP

---

## 🧭 更新方法
GitHub Pages を使用。
`main` ブランチに push するだけで自動的に公開されます。

```bash
git add .
git commit -m "update"
git push
```

## 検索・SNS対策（任意）

- `og:title` / `og:description` / `og:image` を適切に設定（済）
- `robots.txt`/`sitemap.xml` は任意。必要に応じて追加
- OGPを差し替えたら `?v=` のバージョン番号を更新し、Xカードバリデータで確認すること

---

## 🤖 ChatGPT API 連携／オンボーディング／モード設定

Cloud Functions の `cloud/functions/line-webhook/` では、LINE で受信した写真・テキストを OpenAI(ChatGPT) API に渡して栄養推定を行います。友だち追加時にはオンボーディングとモード選択（記録／お試し）を案内し、モードは Google Sheets の `Users` シートに保存されます。お試しモードでは MealLog への書き込みを行わず、確認メッセージとログのみを残します。

### GitHub Secrets（Actions → Repository secrets）

デプロイ用の GitHub Actions（`line-webhook-deploy.yml`）は以下のシークレットを参照します。**キーは必ず Secrets に保存し、ソースコードに直書きしないでください。**

- `OPENAI_API_KEY` : OpenAI API キー（テキスト／画像推定に使用）
- `OPENAI_MODEL` : （任意）利用したい ChatGPT モデル名。未設定時は `gpt-4o-mini`
- `LINE_CHANNEL_ACCESS_TOKEN` : LINE Messaging API チャネルのアクセストークン
- `LINE_CHANNEL_SECRET` : LINE Messaging API チャネルのシークレット
- `GCP_PROJECT_ID` : デプロイ先 GCP プロジェクト ID
- `SHEET_ID` : MealLog / logs / Users が含まれる Google Sheets のスプレッドシート ID

### 動作確認フロー

1. LINE で Bot を友だち追加し、オンボーディングとモード選択のメッセージを確認します。
2. クイックリプライで「記録モード」または「お試しモード」を選択します。
3. テキストまたは写真を送信し、ChatGPT による推定結果（野菜g/たんぱく質g/kcal・サマリー）が返ることを確認します。
4. 「OK」または「修正」を選び、修正入力の後に記録／スキップ動作がモードに応じて行われることを確認します。

ローカルからの疎通テストは、署名検証を無効化した Cloud Functions のエミュレーターや本番 URL に対して、LINE Webhook 互換のイベント JSON を送信します。

```bash
curl -X POST "https://<YOUR_CLOUD_FUNCTION_URL>" \
  -H "Content-Type: application/json" \
  -d '{
    "events": [
      {
        "type": "message",
        "replyToken": "dummy",
        "source": { "type": "user", "userId": "Uxxxxxxxx" },
        "message": { "id": "1234567890", "type": "text", "text": "鶏むね肉とサラダ" }
      }
    ]
  }'
```

※ 実際の運用では、LINE Platform から送信される `X-Line-Signature` の検証を必ず有効化してください。


---

## ライセンス
必要に応じて追記してください（例：All rights reserved）。
