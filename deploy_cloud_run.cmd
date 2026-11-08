@echo off
REM Deploy BaseFlow to Google Cloud Run

REM --- Deployment Configuration ---
SET PROJECT_ID=your_google_cloud_project_id
SET REGION=us-central1
SET REPO_NAME=baseflow-repo
SET IMAGE_NAME=baseflow
SET BUCKET_NAME=baseflow-data-bucket
SET SERVICE_ACCOUNT=%PROJECT_ID%-compute@developer.gserviceaccount.com

REM --- Application Environment Variables ---
REM SECURITY: the server refuses to start in production with weak/default secrets.
REM Generate each secret ONCE (e.g. openssl rand -hex 32) and keep it stable across deploys:
REM changing ENCRYPTION_KEY makes stored Git tokens unreadable.
IF NOT DEFINED APP_PASSWORD SET APP_PASSWORD=change_me_strong_password
IF NOT DEFINED APP_ENCRYPTION_KEY SET APP_ENCRYPTION_KEY=change_me_run_openssl_rand_hex_32
IF NOT DEFINED APP_SESSION_SECRET SET APP_SESSION_SECRET=change_me_run_openssl_rand_hex_32
SET APP_AGENT_MODEL=gemini-3.1-flash-lite
SET GOOGLE_API_KEY=your_google_cloud_agent_api_key
SET GEMINI_CLI_MODEL=gemini-3.5-flash

IF "%APP_PASSWORD:~0,9%"=="change_me" GOTO :missing_secret
IF "%APP_ENCRYPTION_KEY:~0,9%"=="change_me" GOTO :missing_secret
IF "%APP_SESSION_SECRET:~0,9%"=="change_me" GOTO :missing_secret

echo Enabling required Google Cloud APIs...
call gcloud services enable cloudscheduler.googleapis.com run.googleapis.com iam.googleapis.com storage.googleapis.com artifactregistry.googleapis.com --project=%PROJECT_ID% --quiet

echo Resolving Google Cloud Project Number for default service account...
for /f "tokens=*" %%i in ('gcloud projects describe %PROJECT_ID% --format^="value(projectNumber)"') do set PROJECT_NUMBER=%%i
if "%SERVICE_ACCOUNT%"=="%PROJECT_ID%-compute@developer.gserviceaccount.com" set SERVICE_ACCOUNT=%PROJECT_NUMBER%-compute@developer.gserviceaccount.com
echo Service Account resolved to: %SERVICE_ACCOUNT%

echo Creating Artifact Registry repository if not exists...
call gcloud artifacts repositories create %REPO_NAME% --repository-format=docker --location=%REGION% --project=%PROJECT_ID% 2>nul || echo Repository already exists, skipping.

echo Creating Cloud Storage bucket if not exists...
call gcloud storage buckets create gs://%BUCKET_NAME% --project=%PROJECT_ID% --location=%REGION% 2>nul || echo Bucket already exists, skipping.

echo Building and pushing container to Artifact Registry...
call gcloud builds submit --tag %REGION%-docker.pkg.dev/%PROJECT_ID%/%REPO_NAME%/%IMAGE_NAME%:latest

echo Deploying to Cloud Run...
call gcloud run deploy %IMAGE_NAME% ^
  --image=%REGION%-docker.pkg.dev/%PROJECT_ID%/%REPO_NAME%/%IMAGE_NAME%:latest ^
  --region=%REGION% ^
  --allow-unauthenticated ^
  --port=8080 ^
  --execution-environment=gen2 ^
  --max-instances=1 ^
  --memory=2Gi ^
  --add-volume=name=data-vol,type=cloud-storage,bucket=%BUCKET_NAME% ^
  --add-volume-mount=volume=data-vol,mount-path=/mnt/storage ^
  --set-env-vars="HOST=0.0.0.0,NODE_ENV=production,CLOUD_RUN=1,DATA_DIR=/mnt/storage/data,TEMP_DIR=/mnt/storage/temp,PASSWORD=%APP_PASSWORD%,ENCRYPTION_KEY=%APP_ENCRYPTION_KEY%,SESSION_SECRET=%APP_SESSION_SECRET%,AGENT_MODEL=%APP_AGENT_MODEL%,GOOGLE_CLOUD_PROJECT=%PROJECT_ID%,GOOGLE_CLOUD_LOCATION=global,GOOGLE_GENAI_USE_VERTEXAI=true,GOOGLE_API_KEY=%GOOGLE_API_KEY%,GEMINI_CLI_MODEL=%GEMINI_CLI_MODEL%"

echo Deployment complete!
GOTO :eof

:missing_secret
echo ERROR: APP_PASSWORD, APP_ENCRYPTION_KEY and APP_SESSION_SECRET must be configured (see comments at the top of this script).
exit /b 1
