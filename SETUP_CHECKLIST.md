# Setup Checklist - Google Drive Upload untuk Ecosystem Company Logo

## Quick Summary
Upload logo Ecosystem Company sekarang menggunakan **Google Drive via Google Apps Script**, bukan Firebase Storage.

---

## ☐ Step 1: Review Code Changes

- [ ] Baca file `ECOSYSTEM_LOGO_UPLOAD_IMPLEMENTATION.md`
- [ ] Verify file yang diubah:
  - [ ] `src/lib/storage/storage-adapter.ts` - Added "ecosystem_logo" category
  - [ ] `src/app/api/storage/google-drive-upload/route.ts` - Added ecosystem_logo folder path

**Waktu**: ~5 menit

---

## ☐ Step 2: Prepare Google Drive Root Folder

**PENTING**: Folder `ecosystem_assets/company_logos` akan otomatis dibuat. Hanya perlu prepare root folder!

- [ ] Buka https://drive.google.com
- [ ] Siapkan **root folder** di Google Drive (bisa folder baru atau existing)
  - Contoh: "HRP Platform Uploads" atau folder apapun yang sudah ada
- [ ] Pastikan akun Anda punya **write access** ke folder ini
- [ ] Buka folder tersebut di browser
- [ ] **COPY folder ID dari URL**:
  ```
  https://drive.google.com/drive/folders/[COPY_THIS_ID]?usp=sharing
  ```
  - Contoh URL: `https://drive.google.com/drive/folders/1lPkjD2kw2k9No4kHCuUJ07zOmGwuQ70I?usp=sharing`
  - Copy: `1lPkjD2kw2k9No4kHCuUJ07zOmGwuQ70I`
- [ ] Simpan ID ini untuk Step 5

**Catatan**: Saat upload pertama kali, system otomatis akan:
- ✅ Create `ecosystem_assets` folder
- ✅ Create `company_logos` subfolder
- ✅ Upload file ke sana

**Waktu**: ~2 menit (hanya copy folder ID)

---

## ☐ Step 3: Setup Google Apps Script Project

- [ ] Buka https://script.google.com
- [ ] Click **+ Create new project**
- [ ] Rename project ke: `HRP Environment Upload Bridge`
- [ ] Di file `Code.gs`, **replace** seluruh kode dengan isi file: `GOOGLE_APPS_SCRIPT_CODE.gs`
- [ ] Find line dengan:
  ```javascript
  const UPLOAD_SECRET = "ISI_DENGAN_SECRET_YANG_SAMA_DI_ENV";
  ```
- [ ] **Ganti dengan secret unik**, contoh:
  ```javascript
  const UPLOAD_SECRET = "hrp_env_upload_2024_abc123xyz";
  ```
- [ ] **SIMPAN secret ini** untuk Step 5
- [ ] Click **Save** (Ctrl+S)

**Waktu**: ~5 menit

---

## ☐ Step 4: Deploy Google Apps Script as Web App

- [ ] Di Google Apps Script editor, click **Deploy** (atau **Deploy** button)
- [ ] Click **New Deployment**
- [ ] Select type: **Web App**
- [ ] Configure:
  - [ ] **Execute as**: [Your Google Account] ← IMPORTANT: account yang punya Google Drive
  - [ ] **Who has access**: **Anyone** ← IMPORTANT: harus "Anyone"
- [ ] Click **Deploy**
- [ ] **Copy Web App URL** yang muncul:
  ```
  https://script.google.com/macros/s/[SCRIPT_ID]/exec
  ```
- [ ] **SIMPAN URL ini** untuk Step 5
- [ ] Click **OK** untuk close dialog

**Catatan**: 
- Jangan gunakan `/dev` URL, harus `/exec`
- Jika terjadi permission prompt, **Approve** untuk melanjutkan

**Waktu**: ~3 menit

---

## ☐ Step 5: Update .env.local Configuration

- [ ] Buka file `.env.local` di root project
- [ ] Tambahkan konfigurasi berikut:
  ```env
  # Storage Provider
  STORAGE_PROVIDER=googleDriveAppsScript
  NEXT_PUBLIC_STORAGE_PROVIDER=googleDriveAppsScript
  
  # Google Apps Script Web App URL (dari Step 4)
  GOOGLE_DRIVE_APPS_SCRIPT_URL=https://script.google.com/macros/s/[SCRIPT_ID]/exec
  
  # Upload Secret (dari Step 3, harus SAMA dengan di Code.gs)
  GOOGLE_DRIVE_UPLOAD_SECRET=hrp_env_upload_2024_abc123xyz
  
  # Root Folder ID (dari Step 2)
  GOOGLE_DRIVE_ROOT_FOLDER_ID=1a2B3cD4eF5gH6iJ7kL8mN9oP0qR
  ```
- [ ] **VERIFIKASI**:
  - [ ] URL berakhir dengan `/exec` (bukan `/dev` atau `/u/0`)
  - [ ] Secret **SAMA PERSIS** dengan di Code.gs (case-sensitive!)
  - [ ] Folder ID tidak ada spasi
- [ ] **SAVE** file `.env.local`

**Waktu**: ~3 menit

---

## ☐ Step 6: Restart Development Server

- [ ] Stop dev server (`Ctrl+C`)
- [ ] Jalankan:
  ```bash
  npm run dev
  ```
- [ ] Wait sampai muncul: `✓ Ready in X.Xs`
- [ ] **Verify env loaded** dengan buka devtools console di browser dan check tidak ada error

**Waktu**: ~2 menit

---

## ☐ Step 7: Test Upload (Automatic Folder Creation)

- [ ] Buka admin dashboard: `http://localhost:3001/admin/super-admin/ecosystem-management`
- [ ] Click **Add New Company** atau **Edit** existing company
- [ ] **Upload logo file** (format: PNG, JPG, atau WEBP, max 1 MB)
- [ ] System akan otomatis:
  - ✅ Create folder structure di Google Drive (ecosystem_assets/company_logos)
  - ✅ Upload file ke folder
  - ✅ Set file permissions
- [ ] Watch DevTools **Network tab**:
  - [ ] Request ke `/api/storage/google-drive-upload` → should be **200 OK**
  - [ ] Response harus punya `success: true` dan `fileId`
  - [ ] Response harus punya `driveFolderPath: "ecosystem_assets/company_logos"`
- [ ] Click **Save** untuk save company
- [ ] **Expected result**:
  - [ ] Firestore → `ecosystem_companies/{docId}` → `iconUrl` ada Google Drive link
  - [ ] Google Drive root folder sekarang punya:
    ```
    ecosystem_assets/
    └── company_logos/
        └── [Logo File].jpg
    ```

**Waktu**: ~5 menit

---

## ☐ Step 8: Verify Folder Structure & Permissions

- [ ] Buka Google Drive: https://drive.google.com
- [ ] Buka **Root Folder** yang di-config
- [ ] Verify folder structure otomatis terbuat:
  - [ ] Folder `ecosystem_assets` exist
  - [ ] Subfolder `company_logos` exist di dalamnya
  - [ ] Logo file ada di `company_logos` folder
- [ ] Click logo file → **Share** button
- [ ] Verify: **"Anyone with the link"** dapat **Viewer** access
- [ ] Copy file sharing link → test buka di browser:
  - [ ] Should show image preview
  - [ ] Atau bisa download
  - [ ] Link harus accessible (test di incognito window)

**Waktu**: ~3 menit

---

## ☐ Step 9: Troubleshooting Checks

Jika upload gagal, check:

### Error: "Apps Script mengembalikan HTML, bukan JSON"
- [ ] Verify URL di `.env.local` berakhir dengan `/exec`
- [ ] Verify di Google Apps Script URL bar match dengan `.env.local`
- [ ] Re-deploy sebagai Web App (Step 4)

### Error: "Secret upload tidak sesuai"
- [ ] Verify secret di `.env.local` **SAMA PERSIS** dengan di Code.gs (case-sensitive)
- [ ] Restart dev server (`npm run dev`)
- [ ] Test ulang

### Error: "rootFolderId diperlukan" atau "Gagal resolve folder"
- [ ] Verify folder ID di `.env.local` correct dan tidak ada spasi
- [ ] Verify folder structure exist di Google Drive:
  - [ ] `ecosystem_assets` folder exist
  - [ ] `company_logos` subfolder exist di dalamnya
- [ ] Restart dev server

### File upload tapi tidak ada di Google Drive
- [ ] Check Google Drive folder permissions
- [ ] Check Apps Script logs: open script > click **Execution log**
- [ ] Verify account yang run Apps Script (Step 4) punya access ke Google Drive folder

### Dev Server Error: "Missing environment variable"
- [ ] Verify `.env.local` punya semua variables
- [ ] Verify no typo di variable names
- [ ] Stop dev server dan restart (`Ctrl+C` then `npm run dev`)

**Waktu**: ~10 menit (kalau ada issue)

---

## ☐ Step 10: Documentation & Handoff

- [ ] Read `GOOGLE_APPS_SCRIPT_SETUP.md` untuk understand arsitektur
- [ ] Save `GOOGLE_APPS_SCRIPT_CODE.gs` untuk future reference
- [ ] Share checklist ini dengan team members yang perlu setup di local

**Waktu**: ~5 menit

---

## Summary Waktu Total Setup

| Step | Waktu | Status |
|------|-------|--------|
| 1. Review Code | 5 min | ☐ |
| 2. Prepare Google Drive Root Folder | 2 min | ☐ |
| 3. Setup Google Apps Script | 5 min | ☐ |
| 4. Deploy as Web App | 3 min | ☐ |
| 5. Update .env.local | 3 min | ☐ |
| 6. Restart Dev Server | 2 min | ☐ |
| 7. Test Upload (Auto Folder Creation) | 5 min | ☐ |
| 8. Verify Folder Structure | 3 min | ☐ |
| 9. Troubleshooting | 10 min* | ☐ |
| 10. Documentation | 5 min | ☐ |
| **TOTAL** | **~43 min** | |

*kalau ada issue

**Catatan**: Folder `ecosystem_assets/company_logos` dibuat otomatis saat upload pertama kali. Tidak perlu membuat manual!

---

## Quick Reference

### Files Created
- `GOOGLE_APPS_SCRIPT_CODE.gs` - Source code untuk Google Apps Script
- `GOOGLE_APPS_SCRIPT_SETUP.md` - Detailed setup guide
- `ECOSYSTEM_LOGO_UPLOAD_IMPLEMENTATION.md` - Architecture & technical docs
- `.env.example.google-apps-script` - Contoh environment variables

### Files Modified
- `src/lib/storage/storage-adapter.ts` - Added "ecosystem_logo" category
- `src/app/api/storage/google-drive-upload/route.ts` - Added folder path mapping

### Key URLs
- Google Drive: https://drive.google.com
- Google Apps Script: https://script.google.com
- Admin Dashboard: http://localhost:3001/admin/super-admin/ecosystem-management

---

## Still Have Questions?

Lihat dokumentasi lengkap di:
- `ECOSYSTEM_LOGO_UPLOAD_IMPLEMENTATION.md` - Technical details
- `GOOGLE_APPS_SCRIPT_SETUP.md` - Setup guide & troubleshooting

---

**Created**: 2024
**Version**: 1.0
