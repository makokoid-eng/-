# 環境変数の設定

GitHub Actions からデプロイする際は、以下のキーを GitHub リポジトリの **Settings > Secrets and variables > Actions** で登録してください。

- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_CHANNEL_SECRET`
- `GCP_PROJECT_ID`
- `GCP_LOCATION`（例: `asia-northeast1`）
- `TASKS_QUEUE_ID`（例: `line-async`）
- `PUBLIC_WORKER_URL`（例: `https://asia-northeast1-uplifted-sol-472609-p5.a.run.app/tasks/worker`）
- `OPENAI_API_KEY`

LINE Developers には Webhook URL を、Cloud Tasks には Worker URL を以下のように設定します（`asia-northeast1-uplifted-sol-472609-p5` の例）。

- Webhook: `https://asia-northeast1-uplifted-sol-472609-p5.a.run.app/line/webhook`
- Worker: `https://asia-northeast1-uplifted-sol-472609-p5.a.run.app/tasks/worker`

ローカル開発時には `.env.sample` をコピーして `.env` を作成します（`.gitignore` によりコミットされません）。

# プロジェクト構成（推奨の読み順）

1. [.env.sample](./.env.sample)
2. [README.md](./README.md)
3. [scripts/](./scripts/) – セットアップとデプロイ用スクリプト
4. [src/](./src/) – アプリ本体（/line/webhook, /tasks/worker）
5. [cloud/functions/line-webhook/](./cloud/functions/line-webhook/) – 旧構成（必要に応じ参照）
6. [CONTRIBUTING.md](./CONTRIBUTING.md)
7. [privacy.html](./privacy.html)
8. [index.html](./index.html)
9. [robots.txt](./robots.txt)
10. [package.json](./package.json)

## 使い始めの手順（3ステップ）

- `.env.sample` をコピーして `.env` を作成（コミット禁止）
- `scripts/` のセットアップスクリプトを順に実行
- LINE Developers の Webhook に `/line/webhook` を設定

# LINE 二段階返信 MVP (reply→push) — Firestore ログ永続化対応

Google Cloud Functions Gen2（Node.js 20 / TypeScript）と Cloud Tasks を利用した、LINE ボットの二段階返信（即時 reply → 非同期 push）MVP です。これまで Google スプレッドシートへ記録していたログを、Cloud Firestore（Standard / Production / リージョン=asia-northeast1）へ移行し、Sheets とのデュアルライトで安全に切り替えられるようになっています。

## 必須環境

- Firestore: Standard / Production / リージョン = `asia-northeast1`
- Cloud Functions Gen2 / Node.js 20
- Cloud Tasks
- LINE Messaging API（`@line/bot-sdk`）

## 環境変数

`.env.sample` をコピーして `.env` を作成し、以下を設定します。すべて `deploy_gcf.sh` が読み取り、`--set-env-vars` で関数に渡します。

- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_CHANNEL_SECRET`
- `GCP_PROJECT_ID`
- `GCP_LOCATION`（例: `asia-northeast1`）
- `TASKS_QUEUE_ID`（例: `line-async`）
- `TASKS_DLQ_ID`（例: `line-async-dlq`）
- `PUBLIC_WORKER_URL`（Cloud Tasks から呼び出す `/tasks/worker` の完全 URL）
- `TASKS_SA_EMAIL`（任意。指定すると Cloud Tasks が OIDC トークンを付与）
- `OPENAI_API_KEY`（未使用でも空で保持）
- `DUAL_WRITE`（`true` で Sheets と Firestore の二重書き込み）

> **メモ:** `PUBLIC_WORKER_URL` は Cloud Functions デプロイ後に付与されるベース URL に `/tasks/worker` を足したものです。README 末尾の検証手順を参照してください。

## 初期設定手順

1. 依存関係をインストールします。
   ```bash
   npm install
   ```
2. Firestore 権限を Functions 実行サービスアカウントに付与します。
   ```bash
   scripts/setup_firestore_iam.sh
   ```
3. Cloud Tasks のキュー（本隊 + Dead Letter Queue）を作成・更新します。
   ```bash
   scripts/create_tasks_queues.sh
   ```
4. Functions をデプロイします。`.env` を読み込み、必要な環境変数をすべて渡します。
   ```bash
   scripts/deploy_gcf.sh
   ```

## LINE Developers 設定

- Webhook URL: `https://asia-northeast1-<PROJECT_ID>.cloudfunctions.net/lineApp/line/webhook`
- 応答メッセージは即時 reply（固定文）→ Cloud Tasks 経由の push メッセージで最終回答、という二段階構成です。

## 動作・検証フロー

1. ユーザーが画像またはテキストを送信します。
2. `/line/webhook` が即時に固定文で reply し、`logQueued` で Firestore に状態を記録します（`DUAL_WRITE=true` の場合は Sheets にも記録）。
3. Cloud Tasks に投入されたジョブが `/tasks/worker` を呼び出し、ダミー AI パイプラインを実行して push メッセージを送信します。
4. 成功時は Firestore `lineLogs` ドキュメントが `queued → done` へ遷移し、`resultSummary` と `latencyMs` が更新されます。失敗時は `status=error` と例外詳細が保存されます。

Firestore コンソール（`lineLogs` コレクション）で、`queued → done` の遷移を確認してください。

## Sheets から Firestore への切り替え手順

1. 移行初期は `.env` の `DUAL_WRITE=true` のままデプロイし、Sheets と Firestore の二重書き込みを行います。
2. 数日運用してデータ整合が取れていることを確認します。
3. `.env` の `DUAL_WRITE=false` に変更し、`scripts/deploy_gcf.sh` を再実行して再デプロイします。以降は Firestore のみへ書き込みます。

## 今後の拡張候補

- Cloud Tasks からの OIDC トークン検証強化
- LINE push メッセージの Flex Message 化
- `messageId` をキーにした冪等制御（重複防止）
- 画像バイナリ取得と AI モデル差し替え
