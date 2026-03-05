# Deploying to Google Cloud Run

This guide walks through the full first-time production deployment of the Pocket Inspector backend on **Google Cloud Run** with **Cloud SQL (PostgreSQL)** and **Artifact Registry**.

---

## Prerequisites

- GCP project: `pocket-inspector-production`
- `gcloud` CLI installed and authenticated (`gcloud auth login`)
- Docker installed locally (only needed if you want to test the image locally)
- GitHub repository connected to GCP (for CI/CD)

Set your project as the default once so you don't repeat it every command:

```bash
gcloud config set project pocket-inspector-production
export PROJECT_ID=pocket-inspector-production
export REGION=europe-west2
```

---

## Step 1 — Enable required APIs

```bash
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  iamcredentials.googleapis.com \
  --project=$PROJECT_ID
```

---

## Step 2 — Create Artifact Registry repository

```bash
gcloud artifacts repositories create pocket-inspector \
  --repository-format=docker \
  --location=$REGION \
  --description="Pocket Inspector Docker images"
```

---

## Step 3 — Create Cloud SQL (PostgreSQL) instance

```bash
gcloud sql instances create pocket-inspector-db \
  --database-version=POSTGRES_16 \
  --tier=db-f1-micro \
  --region=$REGION \
  --storage-auto-increase \
  --backup-start-time=02:00
```

Create the database and user:

```bash
gcloud sql databases create pocket_inspector --instance=pocket-inspector-db

# Set a strong password — save it, you'll need it for the secret
gcloud sql users create app_user \
  --instance=pocket-inspector-db \
  --password=REPLACE_WITH_STRONG_PASSWORD
```

The Cloud SQL connection name is:
```
pocket-inspector-production:europe-west2:pocket-inspector-db
```

---

## Step 4 — Store secrets in Secret Manager

Cloud Run reads these at runtime — never hardcoded.

```bash
# Database URL (Cloud SQL socket format)
echo -n "postgresql://app_user:REPLACE_WITH_STRONG_PASSWORD@/pocket_inspector?host=/cloudsql/pocket-inspector-production:europe-west2:pocket-inspector-db" \
  | gcloud secrets create pocket-inspector-db-url --data-file=-

# JWT secrets (generate with: openssl rand -base64 32)
echo -n "YOUR_JWT_SECRET_HERE" \
  | gcloud secrets create pocket-inspector-jwt-secret --data-file=-

echo -n "YOUR_JWT_REFRESH_SECRET_HERE" \
  | gcloud secrets create pocket-inspector-jwt-refresh-secret --data-file=-

# Firebase service account key (single-line JSON)
cat secrets/pocket-inspector-production-firebase-adminsdk-fbsvc-dbda2bd3b2.json \
  | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin)), end='')" \
  | gcloud secrets create pocket-inspector-firebase-key --data-file=-
```

---

## Step 5 — Grant permissions to the service account

The Cloud Run service runs as `pocket-inspector-storage`. Grant it access to secrets and Cloud SQL:

```bash
SA="pocket-inspector-storage@$PROJECT_ID.iam.gserviceaccount.com"

# Read secrets
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SA" \
  --role="roles/secretmanager.secretAccessor"

# Connect to Cloud SQL
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SA" \
  --role="roles/cloudsql.client"
```

Also grant Cloud Build the rights to deploy Cloud Run and push to Artifact Registry:

```bash
# Get the Cloud Build service account
CB_SA="$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')@cloudbuild.gserviceaccount.com"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$CB_SA" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$CB_SA" \
  --role="roles/iam.serviceAccountUser"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$CB_SA" \
  --role="roles/artifactregistry.writer"
```

---

## Step 6 — Create a production GCS bucket

```bash
gcloud storage buckets create gs://pocket-inspector-prod-bucket \
  --location=$REGION \
  --uniform-bucket-level-access \
  --no-public-access-prevention=false
```

---

## Step 7 — Connect Cloud Build to GitHub

1. Go to [console.cloud.google.com/cloud-build/triggers](https://console.cloud.google.com/cloud-build/triggers)
2. Click **Connect Repository** → choose GitHub → authorise → select your repo
3. Click **Create Trigger**:
   - **Name**: `deploy-on-push-main`
   - **Event**: Push to branch `^main$`
   - **Configuration**: Cloud Build configuration file → `cloudbuild.yaml`
   - **Substitutions** (optional overrides):
     - `_REGION` = `europe-west2`
     - `_SERVICE` = `pocket-inspector-api`
     - `_AR_REPO` = `pocket-inspector`
4. Click **Create**

---

## Step 8 — First deploy (manual trigger)

Push to `main` or manually trigger:

```bash
gcloud builds submit --config cloudbuild.yaml .
```

---

## Step 9 — Verify the deployment

```bash
# Get the service URL
gcloud run services describe pocket-inspector-api \
  --region=$REGION \
  --format='value(status.url)'
```

Hit the health endpoint:

```bash
curl https://YOUR_SERVICE_URL/health
```

Expected:
```json
{ "data": { "status": "ok", "services": { "database": { "status": "ok" } } } }
```

---

## Ongoing deployments

Every `git push origin main` automatically:
1. Builds a new Docker image
2. Pushes to Artifact Registry
3. Deploys to Cloud Run (zero-downtime rolling update)
4. Runs `prisma migrate deploy` on startup

---

## Environment variables reference (production)

| Variable | Source | Notes |
|---|---|---|
| `DATABASE_URL` | Secret Manager | Cloud SQL socket URL |
| `JWT_SECRET` | Secret Manager | Min 32 chars |
| `JWT_REFRESH_SECRET` | Secret Manager | Min 32 chars |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Secret Manager | Stringified JSON |
| `NODE_ENV` | Cloud Run env var | `production` |
| `PORT` | Cloud Run env var | `3000` |
| `GCS_PROJECT_ID` | Cloud Run env var | `pocket-inspector-production` |
| `GCS_BUCKET_NAME` | Cloud Run env var | `pocket-inspector-prod-bucket` |
| `FCM_PROJECT_ID` | Cloud Run env var | `pocket-inspector-production` |
| `GOOGLE_APPLICATION_CREDENTIALS` | **Not needed** | Cloud Run uses ADC via service account |

---

## Useful commands

```bash
# View live logs
gcloud run services logs read pocket-inspector-api --region=$REGION --limit=50

# Tail logs
gcloud beta run services logs tail pocket-inspector-api --region=$REGION

# List revisions
gcloud run revisions list --service=pocket-inspector-api --region=$REGION

# Rollback to previous revision
gcloud run services update-traffic pocket-inspector-api \
  --region=$REGION \
  --to-revisions=REVISION_NAME=100
```
