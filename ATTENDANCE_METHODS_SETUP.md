# Setup Metode Absensi sebagai Master Data di HRP

## Ringkasan Implementasi

Implementasi lengkap fitur "Metode Absensi" sebagai master data di HRP telah selesai. Fitur ini memungkinkan HRD untuk mengatur metode absensi per karyawan di sistem master HRP, dan Web Absen dapat membaca setting ini dari employee_profiles collection.

## Struktur Data Firestore

### Field Baru di `employee_profiles` Collection

Setiap document dalam collection `employee_profiles` (keyed by `userId`) sekarang memiliki field tambahan:

```typescript
{
  // Existing fields...
  
  // NEW: Attendance Settings
  attendanceMethod: string,           // "fingerprint" | "web_photo" | "hybrid" | "exempt"
  attendanceRequired: boolean,        // true | false
  attendanceLocationMode: string,     // "office_site" | "free_gps" | "specific_site"
  attendanceSiteIds: string[],       // Array of site IDs, empty if not applicable
  attendancePolicyNote: string,      // Optional text note dari HRD, max 200 chars
  
  // Audit Trail
  attendanceUpdatedAt: Timestamp,    // Kapan setting terakhir diubah
  attendanceUpdatedBy: string,       // UID user yang mengubah
  attendanceUpdatedByName: string,   // Nama user yang mengubah
}
```

### Collection Baru: `attendance_sites`

Collection `attendance_sites` digunakan untuk master data lokasi absensi:

```typescript
{
  id: string,           // Document ID
  name: string,         // Nama lokasi (e.g., "Kantor Pusat", "Cabang Jakarta")
  brandId: string,      // Brand yang menggunakan site ini
  isActive: boolean,    // Apakah site aktif
  // Additional fields from existing AttendanceSite type:
  office: { lat: number, lng: number },
  radiusM: number,
  timezone: string,
  workDays: string[],
  shift: { startTime: string, endTime: string, graceLateMinutes: number },
}
```

## File yang Telah Dibuat/Dimodifikasi

### 1. CREATE: `src/lib/attendance-methods.ts` ✅

File baru yang berisi:
- Constants untuk attendance methods dan location modes
- Helper functions untuk default values
- Type definitions untuk AttendanceSettings

**Fungsi Penting:**
- `getDefaultAttendanceSettings()` - Menentukan default attendance berdasarkan employment type
- `getDefaultSiteIds()` - Menentukan default site berdasarkan brand
- `getAttendanceMethodLabel()` - Mendapatkan label untuk display
- `getLocationModeLabel()` - Mendapatkan label untuk mode lokasi

**Default Logic:**
```
IF employmentType IN ["magang", "training"] THEN:
  method = "web_photo"
  required = true
  locationMode = "office_site"
  
ELSE IF employmentType IN ["karyawan", "kontrak", "bulanan", "tahunan", "staff"] THEN:
  method = "fingerprint"
  required = true
  locationMode = "office_site"
  
ELSE:
  method = "exempt"
  required = false
  locationMode = "office_site"
```

### 2. CREATE: `src/components/dashboard/hrd/AttendanceMethodEditDialog.tsx` ✅

Component dialog untuk edit metode absensi karyawan.

**Features:**
- Title: "Atur Metode Absensi - [Nama Karyawan]"
- 5 Form Fields:
  1. **Metode Absensi** (Dropdown)
     - Fingerprint
     - Web Absen Foto
     - Hybrid
     - Tidak Wajib Absen
  
  2. **Wajib Absen** (Toggle Switch)
     - Otomatis disabled jika method = exempt
  
  3. **Mode Lokasi Absensi** (Dropdown)
     - Kantor / Site Terdaftar
     - Bebas GPS
     - Site Tertentu
  
  4. **Site Tertentu** (Multi-select checkbox, conditional)
     - Hanya muncul jika mode = "specific_site"
     - Pilihan dari attendance_sites collection
  
  5. **Catatan Absensi HRD** (Textarea)
     - Optional
     - Max 200 characters
     - Help text berguna untuk docstring

**Actions:**
- Save: Update employee_profiles + audit trail fields + toast success
- Cancel: Close dialog

### 3. MODIFY: `src/lib/types.ts` ✅

Penambahan field attendance ke tipe `EmployeeProfile`:
- `attendanceMethod?: string`
- `attendanceRequired?: boolean`
- `attendanceLocationMode?: string`
- `attendanceSiteIds?: string[]`
- `attendancePolicyNote?: string`
- `attendanceUpdatedAt?: Timestamp | null`
- `attendanceUpdatedBy?: string | null`
- `attendanceUpdatedByName?: string | null`

### 4. MODIFY: `src/app/admin/hrd/employee-data/karyawan/[id]/page.tsx` ✅

Penambahan:

**Imports:**
- `AttendanceMethodEditDialog` component
- `Clock` icon dari lucide-react
- Attendance types dan constants dari lib/attendance-methods.ts
- `AttendanceSite` type

**State Management:**
- `attendanceDialogOpen` - State untuk dialog visibility
- `sites` - State untuk attendance sites data
- Fetch `attendance_sites` collection dengan useCollection hook

**Handler Function:**
- `handleSaveAttendanceSettings()` - Save attendance settings ke Firestore

**Sidebar Menu:**
- Tambah item: `{ id: "kehadiran", label: "Kehadiran & Absensi", icon: Clock }`

**TabsContent: "kehadiran"**
- Menampilkan informasi attendance settings dalam card yang rapi
- Badge status dengan warna teal (active) atau slate (belum diatur)
- Grid display untuk:
  - Metode Absensi
  - Wajib Absen (Ya/Tidak)
  - Mode Lokasi
  - Jumlah Site (jika applicable)
  - Catatan Absensi HRD (jika ada)
- Audit trail: "Diatur oleh [nama] pada [tanggal jam]"
- Button "Atur Metode Absensi" (hanya untuk HRD/Super-Admin)
- Empty state dengan instruksi jika belum ada setting

**Dialog Integration:**
- `<AttendanceMethodEditDialog>` component di akhir return statement
- Props: open, onOpenChange, employee, sites, onSave

### 5. MODIFY: `src/firestore.rules` ✅

Penambahan rules untuk attendance_sites collection:
```firestore
match /attendance_sites/{siteId} {
  allow read: if isInternal();
  allow create, update, delete: if isHrd() || isSuperAdmin();
}
```

**Note:** Employee_profiles rules sudah memungkinkan HRD/Super-Admin update tanpa pembatasan.

## Flow Implementasi

### 1. Saat Create Employee Baru
- Backend/Cloud Function harus memanggil `getDefaultAttendanceSettings(employmentType, brandId, sites)`
- Set default values ke employee_profiles document
- OR: Manual setup via UI jika employee sudah ada

### 2. HRD Mengatur Metode Absensi
1. Buka halaman detail karyawan di HRP
2. Tab "Kehadiran & Absensi"
3. Klik "Atur Metode Absensi"
4. Dialog terbuka dengan form
5. Isi/ubah setting sesuai kebutuhan
6. Klik "Simpan"
7. Firestore updated + Toast success
8. Dialog close, UI refresh menampilkan setting terbaru

### 3. Web Absen Membaca Setting
- Query employee_profiles.{userId}
- Baca field: attendanceMethod, attendanceRequired, attendanceLocationMode, attendanceSiteIds
- Gunakan untuk validasi dan routing logic

## Testing Checklist

- [ ] Deploy code ke development environment
- [ ] Create employee baru, cek apakah default values terisi
- [ ] Buka employee detail page → tab "Kehadiran & Absensi"
- [ ] Klik "Atur Metode Absensi" → dialog terbuka
- [ ] Ubah settings (method, required, locationMode, sites, note)
- [ ] Klik "Simpan" → success toast
- [ ] Refresh page → data ter-persist dan ter-display
- [ ] Test di light mode dan dark mode
- [ ] Test conditional display (site field hanya muncul jika mode=specific_site)
- [ ] Test toggle switch (required disable otomatis saat method=exempt)
- [ ] Verify Firestore rules allow HRD update
- [ ] Test Web Absen bisa baca field ini

## Konfigurasi Default Values

Default values diatur otomatis berdasarkan `employmentType`:

| Employment Type | Method | Required | Location Mode |
|---|---|---|---|
| magang | web_photo | true | office_site |
| training | web_photo | true | office_site |
| karyawan | fingerprint | true | office_site |
| kontrak | fingerprint | true | office_site |
| bulanan | fingerprint | true | office_site |
| tahunan | fingerprint | true | office_site |
| staff | fingerprint | true | office_site |
| Other | exempt | false | office_site |

Untuk "specific_site" mode, default diisi dengan site-site aktif dari brand karyawan.

## API Integration dengan Web Absen

Web Absen dapat query employee_profiles untuk:

```javascript
// Pseudocode
const employeeProfile = await firestore
  .collection('employee_profiles')
  .doc(userId)
  .get();

const attendanceMethod = employeeProfile.data().attendanceMethod; // "fingerprint" | "web_photo" | "hybrid" | "exempt"
const attendanceRequired = employeeProfile.data().attendanceRequired; // true | false
const locationMode = employeeProfile.data().attendanceLocationMode;
const siteIds = employeeProfile.data().attendanceSiteIds;

// Use for validation & routing
if (attendanceMethod === 'exempt' || !attendanceRequired) {
  // Skip attendance requirement
} else if (attendanceMethod === 'fingerprint') {
  // Require fingerprint device scan
} else if (attendanceMethod === 'web_photo') {
  // Show photo capture form
} else if (attendanceMethod === 'hybrid') {
  // Allow both fingerprint and web_photo
}
```

## UI/UX Notes

### Styling
- Card: `bg-white dark:bg-slate-950/40 border-slate-200 dark:border-slate-800`
- Badge Active: Teal color scheme (matches HRP theme)
- Badge Inactive: Slate color scheme
- All components support dark mode

### Icons
- Clock icon untuk attendance section
- Warna accent: Teal (emerald-600 equivalent untuk attendance)

### Permissions
- Hanya HRD dan Super-Admin yang bisa edit
- Employee bisa view tapi tidak bisa edit
- Button otomatis hide jika user bukan HRD/Super-Admin

## Future Enhancements

1. **Employee Directory Table Filter**
   - Tambah kolom "Metode Absensi" di karyawan list
   - Dropdown filter untuk attendance method
   - Status badge dengan color code

2. **Attendance Dashboard**
   - Monitoring absensi berdasarkan attendance method
   - KPI per attendance method
   - Sync status untuk fingerprint

3. **Bulk Update**
   - Set attendance method untuk multiple employees sekaligus
   - Template berdasarkan department/division

4. **Attendance Sync**
   - Cloud Function untuk sync fingerprint data
   - Integration dengan fingerprint device

5. **Reporting**
   - Report attendance by method type
   - Compliance checking per method

## Deployment Checklist

- [ ] Deploy TypeScript files (lib/attendance-methods.ts)
- [ ] Deploy React components (AttendanceMethodEditDialog.tsx)
- [ ] Update employee detail page (/karyawan/[id]/page.tsx)
- [ ] Update Firestore rules
- [ ] Update TypeScript definitions (types.ts)
- [ ] Test in development
- [ ] Create database migration untuk set default values existing employees
- [ ] QA approval
- [ ] Deploy to production
- [ ] Notify Web Absen team untuk integrate

## Troubleshooting

### Dialog tidak muncul?
- Cek apakah `attendanceDialogOpen` state ter-manage dengan benar
- Cek browser console untuk error

### Data tidak ter-save?
- Cek Firestore rules apakah allow HRD update
- Cek user role apakah "hrd" atau "super-admin"
- Cek Firestore database apakah ada security issues

### Default values tidak ter-apply?
- Implementasi di creation form atau backend Cloud Function
- Gunakan `getDefaultAttendanceSettings()` dari lib/attendance-methods.ts

### Conditional fields tidak muncul?
- Cek logic di AttendanceMethodEditDialog
- Verify watchLocationMode state management

## Maintenance

### Regular Checks
- Monitor Firestore usage untuk attendance_sites collection
- Verify audit trail fields ter-update correctly
- Keep default values logic updated saat ada perubahan employment type

### Documentation Updates
- Update ini seharusnya di-add ke HRP docs/wiki
- Create user guide untuk HRD
- Create API docs untuk Web Absen integration

---

**Status:** ✅ IMPLEMENTASI SELESAI

**Tanggal:** 2026-06-05
**Implemented By:** Claude Code
