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

## ☁️ Cloud Functions v2 デプロイ時の注意
- Cloud Functions のソースディレクトリ直下（`cloud/functions/line-webhook/`）に `package.json` を置き、`googleapis` を依存として追加してください。これによりビルド時に自動でインストールされ、`MODULE_NOT_FOUND: 'googleapis'` を防げます。
- `.gcloudignore` で `node_modules/` を除外し、デプロイ対象を最小限に保ちます（Cloud Functions v2 がデプロイ時に `npm install` を実行します）。
- GitHub Actions のデプロイジョブは `working-directory: cloud/functions/line-webhook` を指定した上で `gcloud functions deploy` を実行してください。
- 実行サービスアカウント（`GCP_RUNTIME_SA`）を Google スプレッドシート（`SHEET_ID`）の編集権限で共有してください。ログ追記時に必要です。

## 検索・SNS対策（任意）

- `og:title` / `og:description` / `og:image` を適切に設定（済）
- `robots.txt`/`sitemap.xml` は任意。必要に応じて追加
- OGPを差し替えたら `?v=` のバージョン番号を更新し、Xカードバリデータで確認すること

---


---

## ライセンス
必要に応じて追記してください（例：All rights reserved）。
