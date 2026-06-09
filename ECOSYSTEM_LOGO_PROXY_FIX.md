# Fix: Ecosystem Company Logo Proxy untuk Konsistensi Display

## Ringkasan

Logo Ecosystem Company sekarang ditampilkan secara konsisten di Detail modal, Tabel Companies, dan Landing Page ecosystem section menggunakan **local API proxy** untuk Google Drive images, bukan direct Google Drive URLs.

---

## Masalah yang Diperbaiki

### Sebelumnya
- ❌ Logo langsung dari Google Drive `/view` URL
- ❌ Broken image di tabel dan landing page
- ❌ CORS issues lintas akun Google Drive
- ❌ Firebase Storage 402 quota errors
- ❌ Tidak konsisten di berbagai tempat

### Sekarang
- ✅ Logo via local API proxy `/api/storage/google-drive-image`
- ✅ Safe rendering dengan fallback lokal
- ✅ Konsisten di Detail, Tabel, Landing Page
- ✅ No CORS issues
- ✅ No quota errors

---

## File yang Dibuat/Diubah

### 1. **File Baru: src/lib/storage/google-drive-image.ts**

Helper functions untuk Google Drive image handling:

```typescript
export function extractGoogleDriveFileId(url?: string | null): string | null
→ Extract file ID dari berbagai format URL Drive

export function getCompanyLogoSrc(company: any): string
→ Get safe image src untuk company logo
→ Prioritas: driveFileId → extracted fileId → direct URL → fallback

export function getLocalCompanyLogo(name?: string): string
→ Get local fallback logo berdasarkan nama company

export function isDirectImageUrl(url?: string): boolean
→ Check jika URL adalah direct image URL (aman)

export function isGoogleDriveViewUrl(url?: string): boolean
→ Check jika URL adalah Google Drive /view URL (unsafe)
```

**Logic di getCompanyLogoSrc:**
```
1. Cek driveFileId / iconFileId / logoFileId
   ├─ JA: gunakan `/api/storage/google-drive-image?fileId=FILE_ID`
   └─ TIDAK: continue

2. Extract file ID dari iconUrl / logoUrl / driveViewUrl
   ├─ JA: gunakan `/api/storage/google-drive-image?fileId=FILE_ID`
   └─ TIDAK: continue

3. Cek jika URL adalah Firebase Storage old
   ├─ JA: gunakan fallback lokal
   └─ TIDAK: continue

4. Cek jika URL adalah direct image URL
   ├─ JA: gunakan URL langsung
   └─ TIDAK: continue

5. Default: gunakan fallback lokal
```

### 2. **File Baru: src/app/api/storage/google-drive-image/route.ts**

API proxy endpoint untuk Google Drive images:

```typescript
GET /api/storage/google-drive-image?fileId=FILE_ID

Flow:
1. Terima fileId dari query parameter
2. Call Apps Script dengan action=image, fileId, secret
3. Apps Script return base64-encoded image
4. Decode base64 menjadi image bytes
5. Return sebagai image response (Content-Type: image/png atau sesuai file)
6. Add cache headers (3600s / 1 jam)
```

**Error handling:**
- ✅ Missing fileId → 400 Bad Request
- ✅ Invalid secret → 401 Unauthorized
- ✅ File not found → 404 Not Found
- ✅ Server not configured → 500 Internal Server Error

### 3. **File Updated: GOOGLE_APPS_SCRIPT_CODE.gs**

Tambahan `doGet` handler untuk image action:

```javascript
function doGet(e) {
  var action = e.parameter.action;

  if (action === "image") {
    // Validate secret
    // Get file dari Drive
    // Encode ke base64
    // Return JSON dengan base64 + mimeType
  }

  // Default health check
  return jsonResponse({...});
}

function jsonResponse(data, statusCode)
→ Helper untuk return JSON response
```

### 4. **File Updated: src/components/dashboard/super-admin/EcosystemCompaniesClient.tsx**

Update tabel Companies untuk gunakan proxy:

```typescript
// Import helper
import { getCompanyLogoSrc, getLocalCompanyLogo } from '@/lib/storage/google-drive-image';

// Render logo
<img
  src={getCompanyLogoSrc(item)}
  alt={`${item.name} logo`}
  className="h-10 w-auto object-contain"
  onError={(e) => {
    e.currentTarget.src = getLocalCompanyLogo(item.name);
  }}
/>
```

**Perubahan:**
- ❌ Sebelum: `<Image src={item.iconUrl} .../>`
- ✅ Sesudah: `<img src={getCompanyLogoSrc(item)} .../>` dengan fallback

### 5. **File Updated: src/components/dashboard/super-admin/EcosystemCompanyDetailDialog.tsx**

Update modal Detail untuk gunakan proxy:

```typescript
// Import helper
import { getCompanyLogoSrc } from '@/lib/storage/google-drive-image';

// Render logo preview
<img
  src={getCompanyLogoSrc(item)}
  alt={`${item.name} logo`}
  onError={(e) => {
    e.currentTarget.src = getLocalCompanyLogo(item.name);
  }}
/>
```

### 6. **File Updated: src/components/careers/CareersPageClient.tsx**

Update landing page ecosystem section untuk gunakan proxy:

```typescript
// Import helper
import { getCompanyLogoSrc, getLocalCompanyLogo } from '@/lib/storage/google-drive-image';

// Render logo di ecosystem cards
<img
  src={getCompanyLogoSrc(company)}
  alt={company.name}
  className="w-full h-full object-contain filter grayscale ..."
  onError={(e) => {
    e.currentTarget.src = getLocalCompanyLogo(company.name);
  }}
/>
```

**Perubahan:**
- ❌ Sebelum: `<Image src={company.iconUrl} fill .../>`
- ✅ Sesudah: `<img src={getCompanyLogoSrc(company)} .../>` dengan fallback

---

## Image URL Priority

```
1. driveFileId / iconFileId / logoFileId (dari Firestore)
   ↓
   /api/storage/google-drive-image?fileId=FILE_ID

2. Extract file ID dari existing URLs
   ├─ iconUrl
   ├─ logoUrl
   └─ driveViewUrl
   ↓
   /api/storage/google-drive-image?fileId=FILE_ID

3. Check Firebase Storage old URL
   ├─ Contains: firebasestorage.googleapis.com
   ├─ Fallback: Local company logo
   └─ Example: /images/greenlab-logo.png

4. Direct image URL
   ├─ NOT contains: drive.google.com/file/d/
   ├─ Can be: https://..., http://..., /...
   └─ Use as-is

5. Default Fallback
   ├─ Local logo berdasarkan company name
   └─ Default: /images/hrp-logo.svg
```

---

## API Flow Diagram

```
Frontend (Detail/Tabel/Landing)
  ↓
getCompanyLogoSrc(company)
  ├─ Extract file ID (dari driveFileId atau URL)
  └─ Return: /api/storage/google-drive-image?fileId=FILE_ID
  ↓
GET /api/storage/google-drive-image?fileId=FILE_ID
  ├─ Validate fileId
  ├─ Call Apps Script: action=image&fileId=FILE_ID&secret=...
  └─ Decode base64 response
  ↓
Google Apps Script doGet(action="image")
  ├─ Validate secret
  ├─ Get file dari Drive: DriveApp.getFileById(fileId)
  ├─ Encode ke base64: Utilities.base64Encode(blob.getBytes())
  └─ Return JSON: { success: true, base64: "...", mimeType: "image/png" }
  ↓
Frontend <img>
  ├─ Render image dari /api/storage/google-drive-image
  ├─ On load error: fallback ke local logo
  └─ Display success
```

---

## Firestore Company Fields

Recommended fields untuk store di Firestore:

```typescript
{
  id: string;
  name: string;
  websiteUrl: string;
  iconUrl: string;              // Google Drive /view URL (legacy)
  logoUrl?: string;             // Alternative field
  driveFileId?: string;         // RECOMMENDED: Google Drive file ID
  iconFileId?: string;          // Alternative field name
  logoFileId?: string;          // Alternative field name
  driveViewUrl?: string;        // Alternative field (full /view URL)
  isActive: boolean;
  sortOrder: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Priority saat upload:**
```
Upload logo berhasil
  ↓
Save ke Firestore:
  ├─ driveFileId: result.fileId ← PRIMARY
  ├─ iconUrl: result.webViewLink ← SECONDARY
  ├─ driveViewUrl: result.webViewLink
  └─ logoUrl: result.downloadUrl (fallback)
```

---

## Benefits dari Perubahan

### Security
✅ Tidak expose Google Drive account
✅ API key tidak di-client
✅ Secret di-protect server-side
✅ Safe untuk lintas akun

### Performance
✅ Cached di client (1 jam)
✅ Tidak perlu redirect Google Drive
✅ Direct image response
✅ Smaller payload (compressed)

### Reliability
✅ No CORS issues
✅ No quota errors
✅ Safe fallback lokal
✅ Graceful degradation

### Consistency
✅ Same logo source di semua tempat
✅ Same fallback logic
✅ Same error handling
✅ Same caching behavior

---

## Testing Checklist

- [ ] Upload logo ecosystem company
  - [ ] Verify driveFileId tersimpan di Firestore
  - [ ] Verify iconUrl tersimpan di Firestore

- [ ] Check tabel Companies
  - [ ] Logo muncul normal (via proxy)
  - [ ] Tidak ada broken image
  - [ ] Fallback works jika file ID salah

- [ ] Check modal Detail
  - [ ] Logo preview muncul
  - [ ] Logo source info terlihat
  - [ ] Copy URL buttons work

- [ ] Check landing page ecosystem section
  - [ ] Logo muncul di setiap card
  - [ ] Tidak ada broken image
  - [ ] Hover effect tetap work
  - [ ] Responsive di mobile & desktop

- [ ] Test API proxy
  - [ ] Call `/api/storage/google-drive-image?fileId=TEST_ID`
  - [ ] Verify image response (image/png)
  - [ ] Verify cache headers present
  - [ ] Test error case (invalid fileId → 404)

- [ ] Test fallback scenarios
  - [ ] Image not found → show local logo
  - [ ] Firebase old URL → show local logo
  - [ ] Missing fileId → show local logo
  - [ ] Company name mapping → correct local logo

- [ ] Test different browsers
  - [ ] Chrome/Edge: image caching work
  - [ ] Firefox: image caching work
  - [ ] Safari: image caching work
  - [ ] Mobile Safari: image work

---

## Maintenance Notes

### If Apps Script needs update:
```
1. Update GOOGLE_APPS_SCRIPT_CODE.gs
2. Re-deploy Web App (no URL change)
3. No frontend changes needed
```

### If need to add more company logos:
```
1. Add image to public/images/
2. Update getLocalCompanyLogo() in google-drive-image.ts
3. Example: if (lower.includes("newcompany")) return "/images/newcompany-logo.png";
```

### If need to change proxy caching:
```
1. Edit /api/storage/google-drive-image/route.ts
2. Change: 'Cache-Control': 'public, max-age=3600'
   3600 = 1 hour, adjust as needed
```

---

## Backwards Compatibility

✅ **Existing iconUrl preserved** - tetap tersimpan, tidak dihapus
✅ **New driveFileId added** - optional field, tidak breaking
✅ **Graceful fallback** - jika driveFileId kosong, extract dari URL
✅ **No data migration** - work with existing data structure

---

**Date**: 2024
**Version**: 1.0
**Status**: Ready for Deployment
