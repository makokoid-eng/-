#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${GCP_PROJECT_ID:-}" ]]; then
  echo "GCP_PROJECT_ID is not set. Please export it or source .env." >&2
  exit 1
fi

PROJECT_NUMBER=$(gcloud projects describe "$GCP_PROJECT_ID" --format="value(projectNumber)")
if [[ -z "$PROJECT_NUMBER" ]]; then
  echo "Failed to retrieve project number for $GCP_PROJECT_ID" >&2
  exit 1
fi

SA_EMAIL="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

echo "Granting roles/datastore.user to ${SA_EMAIL}"

gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/datastore.user"
