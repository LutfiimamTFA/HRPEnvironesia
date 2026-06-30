#!/bin/bash
# ============================================================
# HRP Cloud Backup — Deployment Script
# Jalankan dari direktori cloud-backup/
# ============================================================

set -euo pipefail

# ── Config — sesuaikan sebelum menjalankan ────────────────────────────────────
PROJECT_ID="YOUR_GCP_PROJECT_ID"
REGION="asia-southeast2"           # Jakarta
SERVICE_NAME="hrp-cloud-backup"
IMAGE_NAME="gcr.io/$PROJECT_ID/$SERVICE_NAME"

# Secret values — GANTI sebelum deploy
BACKUP_SECRET="$(openssl rand -hex 32)"   # random 64-char hex, simpan di tempat aman!
FIREBASE_PROJECT_ID="$PROJECT_ID"
FIREBASE_CLIENT_EMAIL="YOUR_SERVICE_ACCOUNT@$PROJECT_ID.iam.gserviceaccount.com"
FIREBASE_PRIVATE_KEY_BASE64="BASE64_ENCODED_PRIVATE_KEY"  # base64 encode key untuk menghindari newline issues
GOOGLE_DRIVE_BACKUP_FOLDER_ID="16bMATK_p7d0bd82JgUySQe6bhtJKPXgx"

# ── Step 1: Build & push Docker image ────────────────────────────────────────
echo "==> Building Docker image..."
docker build -t "$IMAGE_NAME" .
docker push "$IMAGE_NAME"

# ── Step 2: Store secrets in Google Secret Manager ───────────────────────────
echo "==> Creating secrets in Secret Manager..."
echo -n "$BACKUP_SECRET" | gcloud secrets create hrp-backup-secret --data-file=- --project="$PROJECT_ID" 2>/dev/null || \
  echo -n "$BACKUP_SECRET" | gcloud secrets versions add hrp-backup-secret --data-file=- --project="$PROJECT_ID"

echo -n "$FIREBASE_CLIENT_EMAIL" | gcloud secrets create hrp-firebase-client-email --data-file=- --project="$PROJECT_ID" 2>/dev/null || \
  echo -n "$FIREBASE_CLIENT_EMAIL" | gcloud secrets versions add hrp-firebase-client-email --data-file=- --project="$PROJECT_ID"

# Note: Private key — decode dari base64 saat deploy
FIREBASE_PRIVATE_KEY=$(echo "$FIREBASE_PRIVATE_KEY_BASE64" | base64 --decode)
echo -n "$FIREBASE_PRIVATE_KEY" | gcloud secrets create hrp-firebase-private-key --data-file=- --project="$PROJECT_ID" 2>/dev/null || \
  echo -n "$FIREBASE_PRIVATE_KEY" | gcloud secrets versions add hrp-firebase-private-key --data-file=- --project="$PROJECT_ID"

# ── Step 3: Deploy to Cloud Run ───────────────────────────────────────────────
echo "==> Deploying to Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
  --image="$IMAGE_NAME" \
  --region="$REGION" \
  --platform=managed \
  --no-allow-unauthenticated \
  --timeout=540 \
  --memory=1Gi \
  --cpu=1 \
  --max-instances=3 \
  --set-env-vars="FIREBASE_PROJECT_ID=$FIREBASE_PROJECT_ID,GOOGLE_DRIVE_BACKUP_FOLDER_ID=$GOOGLE_DRIVE_BACKUP_FOLDER_ID,NODE_ENV=production" \
  --set-secrets="BACKUP_SECRET=hrp-backup-secret:latest,FIREBASE_CLIENT_EMAIL=hrp-firebase-client-email:latest,FIREBASE_PRIVATE_KEY=hrp-firebase-private-key:latest" \
  --project="$PROJECT_ID"

# Ambil URL Cloud Run
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" --region="$REGION" --format="value(status.url)" --project="$PROJECT_ID")
echo "==> Cloud Run URL: $SERVICE_URL"

# ── Step 4: Create Cloud Scheduler jobs ──────────────────────────────────────
echo "==> Creating Cloud Scheduler jobs..."

# Pastikan Cloud Scheduler API enabled
gcloud services enable cloudscheduler.googleapis.com --project="$PROJECT_ID"

# Service account untuk Scheduler (gunakan default Compute SA atau buat khusus)
SCHEDULER_SA="$PROJECT_ID-compute@developer.gserviceaccount.com"

# Backup Harian — 23:55 WIB (16:55 UTC)
gcloud scheduler jobs create http hrp-backup-daily \
  --location="$REGION" \
  --schedule="55 16 * * *" \
  --uri="$SERVICE_URL/backup" \
  --http-method=POST \
  --headers="Content-Type=application/json,Authorization=Bearer $BACKUP_SECRET" \
  --message-body='{"backupType":"scheduled_daily","reason":"Backup harian otomatis"}' \
  --time-zone="UTC" \
  --attempt-deadline=540s \
  --project="$PROJECT_ID" 2>/dev/null || \
gcloud scheduler jobs update http hrp-backup-daily \
  --location="$REGION" \
  --schedule="55 16 * * *" \
  --uri="$SERVICE_URL/backup" \
  --http-method=POST \
  --headers="Content-Type=application/json,Authorization=Bearer $BACKUP_SECRET" \
  --message-body='{"backupType":"scheduled_daily","reason":"Backup harian otomatis"}' \
  --project="$PROJECT_ID"

# Backup Mingguan — Minggu 23:00 WIB (16:00 UTC)
gcloud scheduler jobs create http hrp-backup-weekly \
  --location="$REGION" \
  --schedule="0 16 * * 0" \
  --uri="$SERVICE_URL/backup" \
  --http-method=POST \
  --headers="Content-Type=application/json,Authorization=Bearer $BACKUP_SECRET" \
  --message-body='{"backupType":"scheduled_weekly","reason":"Backup mingguan otomatis"}' \
  --time-zone="UTC" \
  --attempt-deadline=540s \
  --project="$PROJECT_ID" 2>/dev/null || \
gcloud scheduler jobs update http hrp-backup-weekly \
  --location="$REGION" \
  --schedule="0 16 * * 0" \
  --uri="$SERVICE_URL/backup" \
  --http-method=POST \
  --headers="Content-Type=application/json,Authorization=Bearer $BACKUP_SECRET" \
  --message-body='{"backupType":"scheduled_weekly","reason":"Backup mingguan otomatis"}' \
  --project="$PROJECT_ID"

# Backup Bulanan — Tgl 1 jam 00:30 WIB (17:30 UTC hari sebelumnya)
gcloud scheduler jobs create http hrp-backup-monthly \
  --location="$REGION" \
  --schedule="30 17 28-31 * *" \
  --uri="$SERVICE_URL/backup" \
  --http-method=POST \
  --headers="Content-Type=application/json,Authorization=Bearer $BACKUP_SECRET" \
  --message-body='{"backupType":"scheduled_monthly","reason":"Backup bulanan otomatis"}' \
  --time-zone="UTC" \
  --attempt-deadline=540s \
  --project="$PROJECT_ID" 2>/dev/null || \
gcloud scheduler jobs update http hrp-backup-monthly \
  --location="$REGION" \
  --schedule="30 17 28-31 * *" \
  --uri="$SERVICE_URL/backup" \
  --http-method=POST \
  --headers="Content-Type=application/json,Authorization=Bearer $BACKUP_SECRET" \
  --message-body='{"backupType":"scheduled_monthly","reason":"Backup bulanan otomatis"}' \
  --project="$PROJECT_ID"

echo ""
echo "============================================================"
echo "✓ Deployment selesai!"
echo "  Cloud Run URL : $SERVICE_URL"
echo "  BACKUP_SECRET : $BACKUP_SECRET"
echo ""
echo "PENTING: Simpan BACKUP_SECRET di tempat aman."
echo "         Tambahkan ke system_settings/backup_export di Firestore:"
echo "         cloudRunServiceUrl: '$SERVICE_URL'"
echo "============================================================"
