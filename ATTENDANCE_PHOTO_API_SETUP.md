# Attendance Photo API Setup - Google Apps Script Update

## Overview
HRP sekarang menggunakan API proxy lokal untuk menampilkan foto bukti absensi. Sistem ini memanggil Google Apps Script untuk membaca file dari Google Drive, lalu menampilkan foto langsung di modal HRP tanpa membuka tab baru.

## Flow

```
HRP Modal/Tabel
    ↓
Request: /api/attendance-photo?fileId=DRIVE_FILE_ID
    ↓
HRP API Route (api/attendance-photo/route.ts)
    ↓
Call Apps Script: ?action=image&fileId=...&secret=...
    ↓
Apps Script doGet(e)
    ↓
DriveApp.getFileById(fileId)
    ↓
Return base64 image
    ↓
HRP API convert base64 → Buffer → Return image/jpeg
    ↓
Browser render foto
```

## Required Changes to Google Apps Script

### 1. Add Image Handler to doGet()

Update your Google Apps Script `doGet(e)` function to handle `action=image` requests:

```javascript
function doGet(e) {
  try {
    var action = e.parameter.action;

    // === TAMBAH CODE INI: Handle image requests ===
    if (action === "image") {
      var secret = e.parameter.secret;
      var fileId = e.parameter.fileId;

      if (secret !== UPLOAD_SECRET) {
        return jsonResponse({
          success: false,
          error: "Unauthorized image request"
        });
      }

      if (!fileId) {
        return jsonResponse({
          success: false,
          error: "Missing fileId"
        });
      }

      try {
        var file = DriveApp.getFileById(fileId);
        var blob = file.getBlob();
        var base64 = Utilities.base64Encode(blob.getBytes());
        
        return ContentService
          .createTextOutput(base64)
          .setMimeType(ContentService.MimeType.TEXT);
      } catch (err) {
        return jsonResponse({
          success: false,
          error: "File not found or cannot read: " + err.toString()
        });
      }
    }
    // === END: Handle image requests ===

    // ... rest of existing doGet code ...
    return jsonResponse({
      success: true,
      message: "Apps Script endpoint aktif"
    });

  } catch (err) {
    return jsonResponse({
      success: false,
      error: err && err.message ? err.message : String(err)
    });
  }
}
```

### 2. Deployment

Setelah update code:

1. **Save** code di Google Apps Script editor
2. **Deploy** > Select new deployment
3. **Type**: "New deployment"
4. **Kind**: "Web app"
5. **Execute as**: Your Google account
6. **Who has access**: "Anyone"
7. **Deploy** dan copy new deployment URL

### 3. Update HRP .env.local

Pastikan `.env.local` HRP sudah punya:

```env
GOOGLE_DRIVE_APPS_SCRIPT_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
GOOGLE_DRIVE_UPLOAD_SECRET=hrp-drive-upload-2026-egs-rahasia
```

## How It Works

### HRP API Route: `/api/attendance-photo`

- **File**: `src/app/api/attendance-photo/route.ts`
- **Method**: `GET`
- **Query Params**: `fileId` (Google Drive file ID)

**Process:**
1. Receive `fileId` dari query parameter
2. Call Apps Script dengan: `?action=image&fileId=...&secret=...`
3. Apps Script return base64-encoded image
4. HRP convert base64 → Buffer
5. Return Response dengan:
   - `Content-Type: image/jpeg`
   - `Cache-Control: private, max-age=300` (cache 5 menit)
   - Binary image data

### Modal/Tabel Usage

**Image URL format:**
```
/api/attendance-photo?fileId={driveFileId}
```

**Example:**
```html
<img
  src="/api/attendance-photo?fileId=1abcDEF2345..."
  alt="Bukti selfie absensi"
/>
```

## Error Handling

### Scenarios:

1. **Missing fileId** → API return 400 "Missing fileId parameter"
2. **Invalid fileId** → Apps Script return error, API return 400
3. **File not readable** → Apps Script return error, API return 400
4. **Network error** → API return 500 "Failed to fetch image"
5. **Apps Script not configured** → API return 500 "Google Drive Apps Script not configured"

### User Facing:

- If photo load fails: "Foto tidak bisa dimuat" dengan "Muat Ulang Foto" button
- User dapat retry load
- Clear message menunjukkan masalah di server HRP, bukan Google Drive

## Caching

- **Cache Duration**: 5 minutes (`max-age=300`)
- **Cache Type**: `private` (browser cache saja, tidak shared)
- **Cache Invalidation**: Otomatis setelah 5 menit atau manual browser refresh

## Benefits

✅ **No Google Drive tab needed** - Foto langsung embed di modal  
✅ **No permission prompts** - API handle auth via secret key  
✅ **Reliable** - Server-side download fallback  
✅ **Cached** - Reduce API calls setelah load pertama  
✅ **Secure** - Secret key protect API access  
✅ **Better UX** - Single page experience  

## Testing

### 1. Manual Test di Browser

```
GET /api/attendance-photo?fileId=1abcDEF2345...
```

Should return image/jpeg with proper headers.

### 2. Test di Modal

1. Open Monitoring Absensi HRP
2. Click tombol detail untuk karyawan dengan foto
3. Modal terbuka, foto harus tampil langsung
4. Hover foto untuk lihat overlay
5. Click "Muat Ulang Foto" untuk retry jika gagal

### 3. Test di Tabel

1. Tabel thumbnail foto harus tampil
2. Klik thumbnail → Modal terbuka dengan foto besar

## Troubleshooting

### "Foto tidak bisa dimuat" error di modal

**Check 1: Apps Script updated?**
- Buka Google Apps Script
- Verifikasi `if (action === "image")` block ada di `doGet()`
- Verify deployment baru sudah di-deploy

**Check 2: Environment variables?**
```
console.log(process.env.GOOGLE_DRIVE_APPS_SCRIPT_URL)
console.log(process.env.GOOGLE_DRIVE_UPLOAD_SECRET)
```
Kedua harus ada dan valid.

**Check 3: Browser developer tools**
- Open Network tab
- Click foto → Check GET `/api/attendance-photo?fileId=...`
- Status 200 = OK
- Status 400/500 = Check API error message
- Status network error = Check CORS atau Apps Script down

**Check 4: Apps Script logs**
- Google Apps Script > Executions
- Lihat error logs dari recent executions
- Check apakah `DriveApp.getFileById(fileId)` work

### fileId not found

Verify fileId format:
- Harus match pattern: `[a-zA-Z0-9-_]{20,}`
- Kalo dari `driveViewUrl`, extract dengan: `/file/d/([^/]+)/view`
- Di database, check `evidence.driveFileId` ada dan valid

## Migration Notes

- Old Google Drive direct URLs akan fallback ke direct image URLs jika available
- API hanya handle `driveFileId` yang diekstrak dari Google Drive
- Database dapat mix antara `driveFileId` dan direct URLs - keduanya supported

## Future Improvements

- [ ] Add image caching ke Redis jika banyak request
- [ ] Add image size optimization di API
- [ ] Add CDN untuk serve images faster
- [ ] Monitor API response time
