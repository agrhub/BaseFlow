#!/bin/bash
# Deploy BaseFlow to Google Cloud Run

# --- Deployment Configuration ---
PROJECT_ID="your_google_cloud_project_id"
REGION="us-central1"
REPO_NAME="baseflow-repo"
IMAGE_NAME="baseflow"
BUCKET_NAME="baseflow-data-bucket"
SERVICE_ACCOUNT="${PROJECT_ID}-compute@developer.gserviceaccount.com" # Default Compute Engine service account

# --- Application Environment Variables ---
# SECURITY: the server refuses to start in production with weak/default secrets.
# Generate each secret ONCE (e.g. `openssl rand -hex 32`) and keep it stable across deploys:
# changing ENCRYPTION_KEY makes stored Git tokens unreadable.
APP_PASSWORD="${APP_PASSWORD:-change_me_strong_password}"
APP_ENCRYPTION_KEY="${APP_ENCRYPTION_KEY:-change_me_run_openssl_rand_hex_32}"
APP_SESSION_SECRET="${APP_SESSION_SECRET:-change_me_run_openssl_rand_hex_32}"
APP_AGENT_MODEL="gemini-3.1-flash-lite"
GOOGLE_API_KEY="your_google_cloud_agent_api_key"
GEMINI_CLI_MODEL="gemini-3.5-flash"

for VAR in APP_PASSWORD APP_ENCRYPTION_KEY APP_SESSION_SECRET; do
  if [[ "${!VAR}" == change_me* ]]; then
    echo "ERROR: ${VAR} is not configured. Export it or edit this script (see comments above)." >&2
    exit 1
  fi
done

echo "Enabling required Google Cloud APIs..."
gcloud services enable cloudscheduler.googleapis.com run.googleapis.com iam.googleapis.com storage.googleapis.com artifactregistry.googleapis.com --project=${PROJECT_ID} --quiet

echo "Resolving Google Cloud Project Number for default service account..."
if [ "${SERVICE_ACCOUNT}" = "${PROJECT_ID}-compute@developer.gserviceaccount.com" ]; then
  PROJECT_NUMBER=$(gcloud projects describe ${PROJECT_ID} --format="value(projectNumber)")
  SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
fi
echo "Service Account resolved to: ${SERVICE_ACCOUNT}"

echo "Creating Artifact Registry repository if not exists..."
gcloud artifacts repositories create ${REPO_NAME} --repository-format=docker --location=${REGION} --project=${PROJECT_ID} 2>/dev/null || echo "Repository already exists, skipping."

echo "Creating Cloud Storage bucket if not exists..."
gcloud storage buckets create gs://${BUCKET_NAME} --project=${PROJECT_ID} --location=${REGION} 2>/dev/null || echo "Bucket already exists, skipping."

echo "Building and pushing container to Artifact Registry..."
gcloud builds submit --tag ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${IMAGE_NAME}:latest

echo "Deploying to Cloud Run..."
gcloud run deploy ${IMAGE_NAME} \
  --image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${IMAGE_NAME}:latest \
  --region=${REGION} \
  --allow-unauthenticated \
  --port=8080 \
  --execution-environment=gen2 \
  --max-instances=1 \
  --memory=2Gi \
  --add-volume=name=data-vol,type=cloud-storage,bucket=${BUCKET_NAME} \
  --add-volume-mount=volume=data-vol,mount-path=/mnt/storage \
  --set-env-vars="HOST=0.0.0.0,NODE_ENV=production,CLOUD_RUN=1,DATA_DIR=/mnt/storage/data,TEMP_DIR=/mnt/storage/temp,PASSWORD=${APP_PASSWORD},ENCRYPTION_KEY=${APP_ENCRYPTION_KEY},SESSION_SECRET=${APP_SESSION_SECRET},AGENT_MODEL=${APP_AGENT_MODEL},GOOGLE_CLOUD_PROJECT=${PROJECT_ID},GOOGLE_CLOUD_LOCATION=global,GOOGLE_GENAI_USE_VERTEXAI=true,GOOGLE_API_KEY=${GOOGLE_API_KEY},GEMINI_CLI_MODEL=${GEMINI_CLI_MODEL}"

echo "Deployment complete!"