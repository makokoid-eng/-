#!/usr/bin/env bash
set -euo pipefail

for var in GCP_PROJECT_ID GCP_LOCATION TASKS_QUEUE_ID TASKS_DLQ_ID; do
  if [[ -z "${!var:-}" ]]; then
    echo "$var is not set. Please export it or source .env." >&2
    exit 1
  fi
done

function ensure_queue_exists() {
  local queue_id="$1"
  if gcloud tasks queues describe "$queue_id" --location="$GCP_LOCATION" >/dev/null 2>&1; then
    return 0
  fi

  gcloud tasks queues create "$queue_id" \
    --location="$GCP_LOCATION"
}

ensure_queue_exists "$TASKS_DLQ_ID"

MAIN_QUEUE_PATH="projects/${GCP_PROJECT_ID}/locations/${GCP_LOCATION}/queues/${TASKS_QUEUE_ID}"
DLQ_PATH="projects/${GCP_PROJECT_ID}/locations/${GCP_LOCATION}/queues/${TASKS_DLQ_ID}"

if gcloud tasks queues describe "$TASKS_QUEUE_ID" --location="$GCP_LOCATION" >/dev/null 2>&1; then
  gcloud tasks queues update "$TASKS_QUEUE_ID" \
    --location="$GCP_LOCATION" \
    --max-attempts=5 \
    --min-backoff=3s \
    --max-backoff=60s \
    --max-doublings=5 \
    --dead-letter-queue="$DLQ_PATH"
else
  gcloud tasks queues create "$TASKS_QUEUE_ID" \
    --location="$GCP_LOCATION" \
    --max-attempts=5 \
    --min-backoff=3s \
    --max-backoff=60s \
    --max-doublings=5 \
    --dead-letter-queue="$DLQ_PATH"
fi
