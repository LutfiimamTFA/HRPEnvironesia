# Fix: Ecosystem Company Logo Preview Modal

## Ringkasan

Modal Edit Ecosystem Company telah diperbaiki untuk:
- ✅ Tidak menampilkan broken image / logo rusak
- ✅ Handle fallback untuk URL Firebase Storage lama
- ✅ Tampilkan informasi sumber logo dengan jelas
- ✅ Improve UX dengan preview yang lebih baik
- ✅ Better error handling saat upload gagal
- ✅ Logo upload bersifat opsional (edit mode)

---

## File yang Dibuat/Diubah

### 1. **File Utility Baru: src/lib/ecosystem-logo-utils.ts**

Utility functions untuk logo handling:

```typescript
export function getLogoPreviewUrl(company)
→ Get safe logo URL dengan fallback logic
- Filter Firebase Storage lama (quota issues)
- Return Google Drive URL jika available
- Fallback ke local company logo

export function getLocalCompanyLogo(name)
→ Get local logo based on company name
- Support: GreenLab, Bikin, GreenSkill, LSP, Environesia
- Default: HRP logo

export function getLogoSourceText(source)
→ Display text untuk logo source
- "Sumber: Google Drive"
- "Sumber: Firebase lama (disarankan upload ulang)"
- "Sumber: Fallback lokal"

export function getLogoStatusText(source)
→ Status display text dan color
- Green: Logo tersimpan di Google Drive
- Amber: Logo lama dari Firebase (perlu update)
- Blue: Menggunakan fallback lokal
```

### 2. **File Updated: src/components/dashboard/super-admin/EcosystemCompanyFormDialog.tsx**

#### Imports Ditambah
```typescript
import {
  getLogoPreviewUrl,
  getLogoSourceText,
  getLogoStatusText,
  getShortUrlDisplay,
  getLocalCompanyLogo
} from '@/lib/ecosystem-logo-utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Check, Copy } from 'lucide-react';
```

#### State Ditambah
```typescript
const [isUploadingLogo, setIsUploadingLogo] = useState(false);
const [selectedFile, setSelectedFile] = useState<File | null>(null);
const [uploadError, setUploadError] = useState<string | null>(null);
const [logoSourceInfo, setLogoSourceInfo] = useState<{
  source: 'google_drive' | 'firebase_old' | 'local_fallback';
  url: string;
} | null>(null);
```

#### useEffect Updated
```typescript
// Initialize logo preview dengan safe URL
if (item) {
  const logoInfo = getLogoPreviewUrl(item);
  setImagePreview(logoInfo.url);
  setLogoSourceInfo({
    source: logoInfo.source,
    url: item.iconUrl || '',
  });
}
```

#### handleFileChange Updated
```typescript
- Show error dengan detail message
- Track selected file
- Clear upload error
- Better validation message
```

#### uploadIcon Function Updated
```typescript
// SEBELUM: return string URL
// SESUDAH: return object { url, driveFileId }

- Better error handling dengan try-catch
- Store upload error untuk display
- Show loading state (isUploadingLogo)
- Return Google Drive file ID jika available
```

#### onSubmit Function Updated
```typescript
// Logo upload sekarang opsional di edit mode
- Hanya wajib untuk Create mode
- Edit mode bisa skip upload, pakai logo lama
- Simpan driveFileId jika available
- Better error message & handling
```

#### Logo Form Field Redesign
**SEBELUM**: Simple img tag dengan broken image fallback

**SESUDAH**: Comprehensive logo section dengan:

1. **Preview Box**
   - Centered image container
   - Fallback image jika loading error
   - "No logo selected" message jika kosong

2. **Logo Info** (jika ada existing logo)
   - Status badge (blue box)
   - Logo source text (Google Drive / Firebase lama / Fallback)
   - Short URL display untuk reference

3. **Selected File Info** (jika user upload baru)
   - Amber warning box
   - Show selected filename
   - Indicate file belum di-upload ke server

4. **Upload Error Display**
   - Red alert box jika upload gagal
   - Show error message dari server

5. **Upload Button**
   - "Pilih Logo" text buat initial
   - "Ganti Logo" text setelah file dipilih
   - Disabled saat uploading

6. **Help Text**
   - File format info
   - Size limit info
   - Note untuk edit mode: "Opsional (gunakan logo lama jika tidak diubah)"

---

## Logo Preview URL Logic

```javascript
function getLogoPreviewUrl(company) {
  1. Cek iconUrl dari company
  2. Cek apakah Firebase Storage old (contains firebasestorage.googleapis.com)
     - JA: Return fallback local logo
     - TIDAK: Continue
  3. Cek apakah valid URL (Google Drive atau HTTP)
     - JA: Return URL dengan source: 'google_drive'
     - TIDAK: Continue
  4. Default: Return fallback local logo
}
```

---

## Logo Source Detection

| Source | URL Pattern | Status Color | Action |
|--------|-------------|--------------|--------|
| Google Drive | includes 'drive.google.com' | Green | No action needed |
| Firebase Old | includes 'firebasestorage.googleapis.com' | Amber | Recommend upload ulang |
| Local Fallback | N/A (display local logo) | Blue | Display local logo |

---

## Upload Workflow

### Create Mode
```
1. User wajib pilih logo
2. Upload ke Google Drive via Apps Script
3. Simpan iconUrl + driveFileId
4. Show success message
```

### Edit Mode
```
1. User bisa skip upload (optional)
2. Gunakan logo existing jika tidak diubah
3. Jika user upload baru:
   - Upload ke Google Drive
   - Update iconUrl + driveFileId
   - Show "logo updated" message
4. Jika user skip:
   - Keep existing logo
   - Show "company updated" message
```

---

## Error Handling

### File Validation Error
```
User upload file yang invalid
↓
validateStorageFile() return error
↓
Show upload error di red alert
↓
Toast notification dengan detail
```

### Upload Error dari Apps Script
```
File upload ke Google Drive gagal
↓
uploadFile() throw error
↓
Error message di setUploadError
↓
Show di red alert box
↓
Toast notification
```

### Image Load Error (Preview)
```
Preview img failed to load (404, CORS, etc)
↓
<img onError> trigger
↓
Replace src dengan local fallback logo
↓
User lihat local logo preview
```

---

## Benefits dari Perubahan

### UX Improvements
✅ **No Broken Images** - Fallback ke local logo jika URL gagal
✅ **Clear Info** - Tahu logo berasal dari mana (Google Drive / Firebase lama / Local)
✅ **File Feedback** - Show selected filename sebelum upload
✅ **Error Visibility** - Lihat error message jika upload gagal
✅ **Optional Upload** - Edit mode tidak perlu upload ulang jika tidak ada perubahan

### Developer Benefits
✅ **Reusable Utils** - Utility functions untuk dipakai di tempat lain
✅ **Better Separation** - Logo logic terpisah dari component logic
✅ **Type Safety** - TypeScript union types untuk source detection
✅ **Maintainability** - Mudah add support company logo lain

---

## Testing Checklist

- [ ] Open Edit modal untuk existing company dengan Google Drive logo
  - [ ] Preview muncul dengan benar
  - [ ] Status: "Logo tersimpan di Google Drive" (green box)
  - [ ] Source: "Sumber: Google Drive"

- [ ] Open Edit modal untuk company dengan Firebase old logo
  - [ ] Show local fallback logo (tidak rusak)
  - [ ] Status: "Logo lama dari Firebase (perlu update)" (amber box)
  - [ ] Source: "Sumber: Firebase lama (disarankan upload ulang)"

- [ ] Open Edit modal untuk company dengan no logo
  - [ ] Show "No logo selected" message
  - [ ] Status: Fallback lokal (blue box)
  - [ ] User dapat upload logo pertama kali

- [ ] Test upload logo baru di edit mode
  - [ ] Select file → show filename di amber box
  - [ ] Click "Ganti Logo" → upload berhasil
  - [ ] Preview update dengan logo baru
  - [ ] Status change ke "Logo tersimpan di Google Drive"

- [ ] Test upload gagal scenario
  - [ ] Trigger error dari Apps Script
  - [ ] Show error message di red alert
  - [ ] User dapat retry upload

- [ ] Test image load error
  - [ ] Manual URL yang 404
  - [ ] Fallback ke local logo (tidak broken img)

- [ ] Test create mode
  - [ ] Logo wajib diupload (tidak bisa save tanpa logo)
  - [ ] Show validation error jika skip upload

- [ ] Test local fallback for each company
  - [ ] GreenLab → show greenlab-logo.png
  - [ ] Bikin → show bikin-logo.png
  - [ ] GreenSkill → show greenskill-logo.png
  - [ ] LSP → show lsp-logo.png
  - [ ] Environesia → show hrp-logo.svg

---

## Migration Notes

### Backward Compatibility
✅ **Existing data preserved** - Old Firebase URLs tetap di Firestore
✅ **No database changes** - Structure data tetap sama
✅ **Graceful fallback** - Old URLs akan fallback ke local logo

### Gradual Migration
```
Phase 1: Deploy fix
- Old Firebase logos fallback ke local
- New uploads ke Google Drive

Phase 2: Upload ulang (optional)
- Admin dapat upload ulang old logos
- Move dari Firebase ke Google Drive

Phase 3: Cleanup (future)
- Remove old Firebase URLs jika semua sudah migrate
```

---

## Local Logo Images Required

Pastikan file berikut ada di `public/images/`:
- [ ] `greenlab-logo.png` - GreenLab logo
- [ ] `bikin-logo.png` - Bikin logo
- [ ] `greenskill-logo.png` - GreenSkill logo
- [ ] `lsp-logo.png` - LSP logo
- [ ] `hrp-logo.svg` - Default HRP logo (should exist)

Jika ada logo yang missing, semua akan fallback ke `hrp-logo.svg`.

---

## Future Improvements

- [ ] Add image optimization sebelum upload
- [ ] Add logo crop/resize tool
- [ ] Add batch logo upload
- [ ] Add logo URL validation sebelum save
- [ ] Add logo analytics (most used logos, etc)

---

**Date**: 2024
**Version**: 1.0
**Status**: Ready for Testing
