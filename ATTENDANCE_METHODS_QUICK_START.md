# Quick Start: Attendance Methods Integration

## Quick Summary

Setup Metode Absensi sebagai Master Data di HRP sudah **100% selesai**. HRD dapat mengatur metode absensi per karyawan di halaman detail employee, dan Web Absen bisa membaca field ini untuk validasi.

## Lokasi File

### File Baru
- `src/lib/attendance-methods.ts` - Constants dan utility functions
- `src/components/dashboard/hrd/AttendanceMethodEditDialog.tsx` - Dialog component

### File Dimodifikasi
- `src/lib/types.ts` - Tambah field attendance di EmployeeProfile
- `src/app/admin/hrd/employee-data/karyawan/[id]/page.tsx` - Tambah tab "Kehadiran & Absensi"
- `src/firestore.rules` - Tambah rules untuk attendance_sites

## Cara Menggunakan

### Sebagai HRD: Atur Metode Absensi
1. Buka halaman detail karyawan: `/admin/hrd/employee-data/karyawan/{id}`
2. Di sidebar, klik "Kehadiran & Absensi"
3. Klik button "Atur Metode Absensi"
4. Dialog terbuka - isi form:
   - Metode: pilih dari dropdown
   - Wajib Absen: toggle switch
   - Mode Lokasi: pilih dari dropdown
   - Site Tertentu: muncul hanya jika mode = "specific_site"
   - Catatan: opsional
5. Klik "Simpan"

### Sebagai Web Absen Developer: Baca Setting

```typescript
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/firebase/config';

// Read attendance settings
const employeeRef = doc(db, 'employee_profiles', userId);
const snapshot = await getDoc(employeeRef);
const data = snapshot.data();

const method = data?.attendanceMethod; // "fingerprint" | "web_photo" | "hybrid" | "exempt"
const required = data?.attendanceRequired;
const locationMode = data?.attendanceLocationMode; // "office_site" | "free_gps" | "specific_site"
const siteIds = data?.attendanceSiteIds;
const note = data?.attendancePolicyNote;

// Logic based on method
if (method === 'exempt' || !required) {
  // Skip attendance
} else if (method === 'fingerprint') {
  // Require fingerprint
} else if (method === 'web_photo') {
  // Require photo upload
} else if (method === 'hybrid') {
  // Allow both
}
```

## Field Reference

### `employee_profiles` Fields

| Field | Type | Description |
|---|---|---|
| `attendanceMethod` | string | "fingerprint" \| "web_photo" \| "hybrid" \| "exempt" |
| `attendanceRequired` | boolean | Apakah wajib absen |
| `attendanceLocationMode` | string | "office_site" \| "free_gps" \| "specific_site" |
| `attendanceSiteIds` | string[] | Array of attendance_sites document IDs |
| `attendancePolicyNote` | string | Optional HRD note |
| `attendanceUpdatedAt` | Timestamp | Last update time |
| `attendanceUpdatedBy` | string | User UID yang update |
| `attendanceUpdatedByName` | string | User name yang update |

## Constants

```typescript
import {
  ATTENDANCE_METHODS,
  ATTENDANCE_METHOD_LABELS,
  ATTENDANCE_LOCATION_MODES,
  ATTENDANCE_LOCATION_MODE_LABELS,
} from '@/lib/attendance-methods';

// ATTENDANCE_METHODS
{
  FINGERPRINT: "fingerprint",
  WEB_PHOTO: "web_photo",
  HYBRID: "hybrid",
  EXEMPT: "exempt",
}

// ATTENDANCE_METHOD_LABELS (untuk display)
{
  fingerprint: "Fingerprint",
  web_photo: "Web Absen Foto",
  hybrid: "Hybrid",
  exempt: "Tidak Wajib Absen",
}

// ATTENDANCE_LOCATION_MODES
{
  OFFICE_SITE: "office_site",
  FREE_GPS: "free_gps",
  SPECIFIC_SITE: "specific_site",
}

// ATTENDANCE_LOCATION_MODE_LABELS
{
  office_site: "Kantor / Site Terdaftar",
  free_gps: "Bebas GPS",
  specific_site: "Site Tertentu",
}
```

## Helper Functions

```typescript
import {
  getDefaultAttendanceSettings,
  getAttendanceMethodLabel,
  getLocationModeLabel,
} from '@/lib/attendance-methods';

// Get default settings based on employment type
const defaults = getDefaultAttendanceSettings('magang', 'BRAND_ID', sites);
// Returns: { method: "web_photo", required: true, locationMode: "office_site", ... }

// Get display label
const label = getAttendanceMethodLabel('fingerprint');
// Returns: "Fingerprint"

const modeLabel = getLocationModeLabel('office_site');
// Returns: "Kantor / Site Terdaftar"
```

## Default Values Logic

```
IF employmentType IN ["magang", "training"]:
  → method: "web_photo"
  
ELSE IF employmentType IN ["karyawan", "kontrak", "bulanan", "tahunan", "staff"]:
  → method: "fingerprint"
  
ELSE:
  → method: "exempt"
```

All defaults: `required: true`, `locationMode: "office_site"`, `siteIds: [active sites for brand]`

## Permissions

- **HRD & Super-Admin**: Bisa read & write attendance settings
- **Employee**: Bisa read tapi tidak bisa write
- **Web Absen**: Bisa read untuk validasi
- **Manager**: Bisa read untuk monitoring (via isInternal rule)

## Firestore Rules

```firestore
// Employee profiles - HRD/Super-Admin bisa update semua field
match /employee_profiles/{uid} {
  allow get: if isOwner(uid) || isInternal();
  allow create: if isOwner(uid) || isHrd() || isSuperAdmin();
  allow update: if (isOwner(uid) && isUpdatingOwnAllowedFields()) || isHrd() || isSuperAdmin();
  allow list: if isHrd() || isSuperAdmin();
}

// Attendance sites - internal bisa read, HRD/Super-Admin bisa write
match /attendance_sites/{siteId} {
  allow read: if isInternal();
  allow create, update, delete: if isHrd() || isSuperAdmin();
}
```

## Testing

Quick test checklist:
```
[ ] Open employee detail page
[ ] Click "Kehadiran & Absensi" tab - muncul?
[ ] Click "Atur Metode Absensi" - dialog muncul?
[ ] Coba isi form - semua field berfungsi?
[ ] Klik "Simpan" - toast success?
[ ] Refresh page - data persist?
[ ] Try different attendance methods - conditional fields work?
[ ] Try Web Absen read - bisa query field ini?
```

## Troubleshooting

| Issue | Solution |
|---|---|
| Dialog tidak muncul | Check user role = "hrd" atau "super-admin" |
| Data tidak save | Check Firestore rules, check user permissions |
| Default values belum ada | Manual setup via UI, atau update via Cloud Function |
| Specific sites tidak muncul | Pastikan ada attendance_sites dengan isActive=true |
| Dark mode UI jelek | Check Tailwind dark: classes |

## API Endpoint untuk Web Absen

Tidak perlu endpoint custom - langsung query Firestore:
```javascript
const userDoc = await firestore.collection('employee_profiles').doc(userId).get();
const attendanceSettings = {
  method: userDoc.data()?.attendanceMethod,
  required: userDoc.data()?.attendanceRequired,
  locationMode: userDoc.data()?.attendanceLocationMode,
  siteIds: userDoc.data()?.attendanceSiteIds,
};
```

## Next Steps

1. Deploy code
2. Set default values untuk existing employees
3. Test di staging
4. Integrate dengan Web Absen
5. QA & production rollout

---

**Questions?** Check `ATTENDANCE_METHODS_SETUP.md` untuk dokumentasi lengkap.
