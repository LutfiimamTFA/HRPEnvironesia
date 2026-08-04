# Setup Google Drive Upload via Google Apps Script

## Ringkasan

Upload logo Ecosystem Company akan menggunakan **Google Drive via Google Apps Script Web App** sebagai bridge, bukan Firebase Storage. Ini memungkinkan penyimpanan file di Google Drive folder terstruktur dengan kontrol akses yang lebih baik.

## Arsitektur

```
Frontend (EcosystemCompanyFormDialog.tsx)
  ↓ uploadFile(file, path, userId, {category: "ecosystem_logo"})
  ↓
API Route (/api/storage/google-drive-upload)
  ↓ POST (FormData) → convert to base64
  ↓
Google Apps Script Web App (/exec)
  ↓ doPost() → handle upload
  ↓
Google Drive
  └─ ecosystem_assets/
     └─ company_logos/
        └─ [file_id] Logo.jpg
```

## Tahap Setup

### 1. Buat Google Apps Script Project

1. Buka https://script.google.com
2. Click **+ Create new project**
3. Rename project ke: `HRP Environment Upload Bridge`
4. Di file `Code.gs`, replace seluruh kode dengan isi dari `GOOGLE_APPS_SCRIPT_CODE.gs` file di project root

### 2. Configure UPLOAD_SECRET di Code.gs

Edit line di Code.gs:
```javascript
const UPLOAD_SECRET = "ISI_DENGAN_SECRET_YANG_SAMA_DI_ENV";
```

Ganti dengan secret yang unik, contoh:
```javascript
const UPLOAD_SECRET = "hrp_env_upload_2024_abc123xyz";
```

**Pastikan secret ini SAMA dengan value di `.env.local`:**
```env
GOOGLE_DRIVE_UPLOAD_SECRET=hrp_env_upload_2024_abc123xyz
```

### 3. Deploy Google Apps Script sebagai Web App

1. Di Apps Script editor, click **Deploy** > **New Deployment**
2. Pilih tipe: **Web App**
3. Configure:
   - **Execute as**: [Your Google Account]
   - **Who has access**: **Anyone**
4. Click **Deploy**
5. **Copy URL Web App** yang keluar (format: `https://script.google.com/macros/s/[ID]/exec`)

Simpan URL ini, akan digunakan untuk `.env.local`.

### 4. Setup Environment Variables

Di `.env.local`, tambahkan:

```env
# Google Drive Apps Script Configuration
STORAGE_PROVIDER=googleDriveAppsScript
NEXT_PUBLIC_STORAGE_PROVIDER=googleDriveAppsScript
GOOGLE_DRIVE_APPS_SCRIPT_URL=https://script.google.com/macros/s/[ID]/exec
GOOGLE_DRIVE_UPLOAD_SECRET=hrp_env_upload_2024_abc123xyz
GOOGLE_DRIVE_ROOT_FOLDER_ID=[ROOT_FOLDER_ID_DI_GOOGLE_DRIVE]
```

Penjelasan:
- `GOOGLE_DRIVE_APPS_SCRIPT_URL`: Web app URL dari step 3
- `GOOGLE_DRIVE_UPLOAD_SECRET`: Secret yang sama dengan di Code.gs
- `GOOGLE_DRIVE_ROOT_FOLDER_ID`: Folder ID root di Google Drive (lihat tahap 5)

### 5. Setup Google Drive Root Folder

**PENTING**: Folder `ecosystem_assets/company_logos` akan **otomatis dibuat** oleh Google Apps Script saat upload pertama kali. **User tidak perlu membuat folder manual**.

1. Siapkan **Root Folder** di Google Drive yang akan menjadi container untuk semua uploads
   - Bisa folder baru atau folder yang sudah ada
   - Contoh folder name: "HRP Platform Uploads" atau "Environment Data"
2. Pastikan akun yang jalankan Google Apps Script punya **write access** ke folder ini
3. Buka folder tersebut di Google Drive > Copy folder ID dari URL:
   ```
   https://drive.google.com/drive/folders/[FOLDER_ID]?usp=sharing
   ```
4. Paste ID tersebut ke `.env.local` sebagai `GOOGLE_DRIVE_ROOT_FOLDER_ID`

**Catatan**: Saat upload logo pertama kali, Apps Script akan otomatis:
- ✅ Create folder `ecosystem_assets` di root
- ✅ Create subfolder `company_logos` di dalamnya
- ✅ Upload file ke folder tersebut
- ✅ Set file permissions

### 6. Verifikasi Permissions Google Apps Script

Google Apps Script perlu akses ke:
- ✅ Google Drive (untuk create/upload file)
- ✅ Current user's account (untuk run as user)

Saat first deploy, Google akan ask for permissions - **Approve** untuk melanjutkan.

## Testing Upload

### Test Manual di Frontend

1. Buka admin dashboard → Ecosystem Management
2. Click **Add/Edit Company**
3. Upload logo file (PNG, JPG, WEBP, max 1MB)
4. **Saat upload pertama kali**, system akan otomatis:
   - ✅ Create folder `ecosystem_assets` di root Google Drive
   - ✅ Create subfolder `company_logos` di dalamnya
   - ✅ Upload file ke folder tersebut
5. Tunggu upload selesai (biasanya 2-5 detik)
6. Check success message muncul

### Verify di Google Drive

1. Buka Google Drive
2. Buka Root Folder yang sudah di-config
3. Lihat folder structure:
   ```
   [Root Folder]/
   └── ecosystem_assets/
       └── company_logos/
           └── [Logo File].jpg
   ```
4. Verify file terbuat dengan nama yang benar

### Test di Apps Script Console

1. Buka Google Apps Script project
2. Click **Debug** > **testUpload()**
3. Check logs untuk verify UPLOAD_SECRET dan ROOT_FOLDER_ID configured

### Test Full Upload Flow

```bash
# 1. Restart dev server agar env variables ter-load
npm run dev

# 2. Test upload di admin dashboard
# Buka http://localhost:3001/admin/super-admin/ecosystem-management
# Upload logo pertama kali - folder akan otomatis dibuat
# Verify folder structure di Google Drive
```

## Troubleshooting

### Error: "Apps Script mengembalikan HTML, bukan JSON"

**Penyebab**: Web app URL tidak benar atau tidak ke-deploy sebagai Web App

**Solusi**:
1. Verifikasi URL berakhir dengan `/exec` (bukan `/dev`)
2. Re-deploy sebagai Web App (Deploy > New Deployment > Web App)
3. Copy URL /exec terbaru

### Error: "Secret upload tidak sesuai dengan Apps Script"

**Penyebab**: GOOGLE_DRIVE_UPLOAD_SECRET di `.env.local` tidak match dengan UPLOAD_SECRET di Code.gs

**Solusi**:
1. Pastikan secret sama di kedua tempat
2. Restart dev server
3. Test ulang

### Error: "rootFolderId diperlukan"

**Penyebab**: GOOGLE_DRIVE_ROOT_FOLDER_ID tidak di-set atau tidak benar

**Solusi**:
1. Verifikasi folder structure di Google Drive
2. Copy folder ID yang benar
3. Update `.env.local`
4. Restart dev server

### File upload tapi tidak masuk Google Drive

**Penyebab**: Permission issue di Google Drive atau Apps Script

**Solusi**:
1. Verifikasi folder `ecosystem_assets/company_logos` sudah exist
2. Check sharing settings folder (harus accessible oleh account yang run Apps Script)
3. Check Apps Script logs: **Execution log** tab untuk error detail

### "Gagal resolve folder destination"

**Penyebab**: Folder structure tidak sesuai atau permission issue

**Solusi**:
1. Check manual di Google Drive apakah folder structure sudah correct
2. Verifikasi Apps Script punya permission untuk create folder
3. Check execution logs untuk detail error

## Update Code.gs

Jika ada update ke Code.gs (e.g., add new category):

1. Update code di Google Apps Script editor
2. Click **Deploy** > **Manage Deployments**
3. Click ⋮ di deployment aktif > **Edit**
4. Buat new version atau update existing
5. Tidak perlu ubah URL `/exec` (tetap sama)

## Security Best Practices

1. ✅ **Secret di env, bukan di code** - GOOGLE_DRIVE_UPLOAD_SECRET harus di `.env.local`, tidak di commit
2. ✅ **Verify secret di Apps Script** - doPost() validate secret sebelum process
3. ✅ **File size limit** - Max 1MB untuk image, max 2MB untuk PDF
4. ✅ **Category validation** - Hanya upload ke folder category yang specific
5. ✅ **Audit logging** - Apps Script logs semua upload untuk debugging

## Next Steps

1. Deploy Google Apps Script Web App
2. Set GOOGLE_DRIVE_APPS_SCRIPT_URL di `.env.local`
3. Test upload di admin dashboard
4. Monitor Google Drive folder untuk uploaded files
5. Verify file permissions (public link accessible)

## Reference

- Google Apps Script: https://script.google.com
- Google Drive API: https://developers.google.com/drive/api/v3/about-auth
- Utilities.base64Decode: https://developers.google.com/apps-script/reference/utilities/utilities#base64Decode(String)

---

**File Generated**: 2024
**Version**: 1.0
