# RepiMEMO LINE Webhook

`repi-webhook` は RepiMEMO Bot 専用の Cloud Functions (2nd gen) HTTP エンドポイントです。既存の `line-webhook` とは別プロジェクトとして共存し、Firestore には `repi_users/{userId}` 以下でイベントログを保存します。

## 役割
- LINE Messaging API からの Webhook を受信
- 署名検証後に Firestore (`repi_users`) へイベントを保存
- `ping` テキストに対する死活監視用レスポンス

## 必須環境変数
| 名前 | 用途 |
| --- | --- |
| `LINE_CHANNEL_SECRET_REPI` | RepiMEMO チャネルシークレット。署名検証に使用します。 |
| `LINE_CHANNEL_ACCESS_TOKEN_REPI` | RepiMEMO チャネルアクセストークン。reply/push に使用します。 |
| `FIREBASE_PROJECT_ID` | Firestore へ接続する Firebase プロジェクト ID。 |

GitHub Actions では `${{ vars.GCP_LINE_FUNCTION_NAME_REPI }}` を Cloud Functions 名として利用してください。

## ローカル開発メモ
```bash
npm install
npx functions-framework --target=repiWebhook --port=8080
```
ローカルで署名検証を行う場合は `LINE_CHANNEL_SECRET_REPI` と `LINE_CHANNEL_ACCESS_TOKEN_REPI` を `.env` などで設定してください。
