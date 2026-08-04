#!/bin/bash
# ============================================================
# Setup Firebase Function Secrets untuk HRP Backup
# Jalankan SEKALI sebelum deploy pertama kali.
# ============================================================

set -euo pipefail

PROJECT_ID="hrp-environesia-production"

echo "==> Setting up Firebase secrets untuk project: $PROJECT_ID"

# BACKUP_CRON_SECRET — dari .env
echo -n "hrp_backup_2026_R4nd0m_S3cret_aman_banget" | \
  firebase functions:secrets:set BACKUP_CRON_SECRET --project="$PROJECT_ID"

# FIREBASE_CLIENT_EMAIL — dari .env.local
echo -n "firebase-adminsdk-fbsvc@studio-9262077557-bc9c9.iam.gserviceaccount.com" | \
  firebase functions:secrets:set FIREBASE_CLIENT_EMAIL --project="$PROJECT_ID"

# GOOGLE_DRIVE_BACKUP_FOLDER_ID — dari .env
echo -n "16bMATK_p7d0bd82JgUySQe6bhtJKPXgx" | \
  firebase functions:secrets:set GOOGLE_DRIVE_BACKUP_FOLDER_ID --project="$PROJECT_ID"

# FIREBASE_PRIVATE_KEY — paste manual karena multiline
echo ""
echo "==> Untuk FIREBASE_PRIVATE_KEY, jalankan:"
echo "    firebase functions:secrets:set FIREBASE_PRIVATE_KEY --project=$PROJECT_ID"
echo "    Lalu paste isi private key (termasuk BEGIN/END) dan tekan Ctrl+D"
echo ""
echo "==> Setelah semua secrets tersimpan, deploy dengan:"
echo "    cd functions && npm run build && firebase deploy --only functions --project=$PROJECT_ID"
echo ""
echo "==> URL function setelah deploy:"
echo "    https://asia-southeast2-$PROJECT_ID.cloudfunctions.net/runBackupFn"
