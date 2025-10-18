# LINE 二段階返信 MVP (reply→push)

Google Cloud Functions Gen2 と Cloud Tasks を利用して、LINE 公式アカウントで即時返信と非同期 AI 応答を実現する最小構成です。

## 必須環境変数

`.env`（ローカル）または GCF 環境変数に以下を設定してください。

- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_CHANNEL_SECRET`
- `GCP_PROJECT_ID`
- `GCP_LOCATION`（例: `asia-northeast1`）
- `TASKS_QUEUE_ID`（例: `line-async`）
- `PUBLIC_WORKER_URL`（Cloud Tasks が呼び出すワーカーの完全 URL）
- `OPENAI_API_KEY`（任意、将来の拡張用）

`.env.sample` をコピーして `.env` を作成すると便利です。

## セットアップ

1. 依存関係をインストールします。

   ```bash
   npm install
   ```

2. Cloud Tasks のキューを作成します。（例）

   ```bash
   gcloud tasks queues create line-async \
     --location=asia-northeast1
   ```

3. Google Cloud Functions Gen2 にデプロイします。以下は例です。

   ```bash
   gcloud functions deploy lineApp \
     --gen2 \
     --region=asia-northeast1 \
     --runtime=nodejs20 \
     --entry-point=default \
     --source=. \
     --trigger-http \
     --allow-unauthenticated \
     --set-env-vars=LINE_CHANNEL_ACCESS_TOKEN=xxx,LINE_CHANNEL_SECRET=xxx,GCP_PROJECT_ID=your-project,GCP_LOCATION=asia-northeast1,TASKS_QUEUE_ID=line-async,PUBLIC_WORKER_URL=https://asia-northeast1-your-project.cloudfunctions.net/lineApp/tasks/worker
   ```

   `PUBLIC_WORKER_URL` は Cloud Tasks が呼び出すワーカー URL に置き換えてください。

4. LINE Developers コンソールで Webhook URL を設定します。

   ```
   https://asia-northeast1-your-project.cloudfunctions.net/lineApp/line/webhook
   ```

## エンドポイント

- `POST /line/webhook` — LINE からのイベント受付。1 秒以内に固定文を reply し、Cloud Tasks にジョブを登録します。
- `POST /tasks/worker` — Cloud Tasks から呼ばれるワーカー。AI パイプラインを実行し、push メッセージを送信します。
- `GET /healthz` — 動作確認用エンドポイント。

## 動作確認フロー

1. ユーザーが LINE でメッセージや画像を送信します。
2. `/line/webhook` が即時に固定文を reply します。
3. 同時に Cloud Tasks にジョブが投入されます。
4. ワーカー `/tasks/worker` が AI ダミー処理を実行し、push メッセージで本回答を送信します。

## 次フェーズで予定している強化

- LINE 署名検証の追加
- Cloud Tasks からの OIDC 署名検証
- 画像バイナリの取得と実際の AI モデル連携
- Firestore や Redis 等を利用した重複防止・状態管理
