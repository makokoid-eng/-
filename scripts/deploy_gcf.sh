#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f .env ]]; then
  echo ".env file not found. Please create it from .env.sample" >&2
  exit 1
fi

# shellcheck disable=SC1091
source ./.env

for var in LINE_CHANNEL_ACCESS_TOKEN LINE_CHANNEL_SECRET GCP_PROJECT_ID GCP_LOCATION TASKS_QUEUE_ID TASKS_DLQ_ID PUBLIC_WORKER_URL DUAL_WRITE; do
  if [[ -z "${!var:-}" ]]; then
    echo "Environment variable $var is required." >&2
    exit 1
  fi
done

ENV_VARS=(
  "LINE_CHANNEL_ACCESS_TOKEN=${LINE_CHANNEL_ACCESS_TOKEN}"
  "LINE_CHANNEL_SECRET=${LINE_CHANNEL_SECRET}"
  "GCP_PROJECT_ID=${GCP_PROJECT_ID}"
  "GCP_LOCATION=${GCP_LOCATION}"
  "TASKS_QUEUE_ID=${TASKS_QUEUE_ID}"
  "TASKS_DLQ_ID=${TASKS_DLQ_ID}"
  "PUBLIC_WORKER_URL=${PUBLIC_WORKER_URL}"
  "TASKS_SA_EMAIL=${TASKS_SA_EMAIL:-}"
  "OPENAI_API_KEY=${OPENAI_API_KEY:-}"
  "DUAL_WRITE=${DUAL_WRITE}"
)

ENV_STRING=$(IFS=,; echo "${ENV_VARS[*]}")

echo "Deploying Cloud Function lineApp to ${GCP_LOCATION}"

gcloud functions deploy lineApp \
  --gen2 \
  --region="$GCP_LOCATION" \
  --runtime=nodejs20 \
  --entry-point=default \
  --source=. \
  --trigger-http \
  --allow-unauthenticated \
  --set-env-vars="$ENV_STRING"

cat <<'NOTE'

Deployment complete.
PUBLIC_WORKER_URL should be the function base URL with /tasks/worker appended, for example:
https://asia-northeast1-<PROJECT_ID>.cloudfunctions.net/lineApp/tasks/worker

NOTE
