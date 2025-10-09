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

---


---

## ライセンス
必要に応じて追記してください（例：All rights reserved）。

## ☁️ Cloud Functions (LINE Webhook)
Google Cloud Functions 第2世代で LINE Webhook を提供する Node.js 関数を `cloud/functions/line-webhook` に配置しています。ローカルで関数を確認する場合は以下を実行します。

```bash
cd cloud/functions/line-webhook
npm install
npm start
```

### GitHub Actions + Workload Identity Federation
`main` ブランチへの push で LINE Webhook 関数を自動デプロイします。事前に以下のリソースと GitHub Secrets を用意してください。

1. Google Cloud 上で Cloud Functions API / Artifact Registry API を有効化。
2. デプロイ用サービスアカウントを作成し、少なくとも以下のロールを付与。
   - Cloud Functions Admin
   - Cloud Run Admin
   - Service Account User (対象: Cloud Functions 実行サービスアカウント)
3. 上記サービスアカウントを紐づける Workload Identity プロバイダを作成し、GitHub リポジトリ `makokoid-eng/akarilab` をトラスト設定。
4. GitHub Secrets を設定。

| Secret 名 | 内容 |
| --- | --- |
| `GCP_PROJECT_ID` | デプロイ先のプロジェクト ID |
| `GCP_REGION` | Cloud Functions を配置するリージョン (例: `asia-northeast1`) |
| `GCP_LINE_FUNCTION_NAME` | デプロイする関数名 |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Workload Identity プロバイダのリソース名 (`projects/.../providers/...`) |
| `GCP_SERVICE_ACCOUNT` | デプロイに使用するサービスアカウント (`name@project.iam.gserviceaccount.com`) |
| `LINE_CHANNEL_SECRET` | LINE Developers で発行される Channel secret |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Developers で発行される Channel access token |

設定が完了すると `.github/workflows/line-webhook-deploy.yml` が自動で Cloud Functions (Gen2) にデプロイします。手動デプロイが必要な場合は GitHub Actions の `workflow_dispatch` から実行できます。
