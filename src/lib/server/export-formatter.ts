/**
 * export-formatter.ts
 * Transforms raw Firestore documents into human-readable rows for HRD reports.
 * Maps field names to Indonesian labels, normalizes values (booleans, dates,
 * enums, arrays) and defines per-collection column order.
 */
import 'server-only';

// ── Date ───────────────────────────────────────────────────────────────────────
export function formatDateHR(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  try {
    let d: Date;
    if (value instanceof Date) {
      d = value;
    } else if (typeof value === 'object' && '_seconds' in (value as Record<string, unknown>)) {
      d = new Date((value as { _seconds: number })._seconds * 1000);
    } else {
      d = new Date(String(value));
    }
    if (isNaN(d.getTime())) return '-';
    return d
      .toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Jakarta',
      })
      .replace(/\./g, ':')
      .replace(/\s+/g, ' ')
      .trim();
  } catch {
    return '-';
  }
}

// ── Enum maps ─────────────────────────────────────────────────────────────────
const ROLE_MAP: Record<string, string> = {
  'super-admin': 'Super Admin', 'super_admin': 'Super Admin', 'superadmin': 'Super Admin',
  'manager': 'Manager', 'hrd': 'HRD', 'karyawan': 'Karyawan',
  'karyawan-magang': 'Karyawan Magang', 'karyawan-training': 'Karyawan Training',
  'admin': 'Admin', 'kandidat': 'Kandidat', 'guest': 'Tamu',
};

const EMPLOYMENT_TYPE_MAP: Record<string, string> = {
  'karyawan': 'Karyawan Tetap', 'full-time': 'Full Time', 'fulltime': 'Full Time',
  'magang': 'Magang', 'training': 'Training', 'kontrak': 'Kontrak',
  'freelance': 'Freelance', 'part-time': 'Part Time', 'parttime': 'Part Time',
};

const STATUS_MAP: Record<string, string> = {
  'active': 'Aktif', 'inactive': 'Tidak Aktif', 'suspended': 'Ditangguhkan',
  'pending': 'Menunggu', 'approved': 'Disetujui', 'rejected': 'Ditolak',
  'cancelled': 'Dibatalkan', 'canceled': 'Dibatalkan', 'completed': 'Selesai',
  'done': 'Selesai', 'running': 'Berjalan', 'success': 'Berhasil',
  'failed': 'Gagal', 'partial_success': 'Sebagian Berhasil',
  'submitted': 'Diajukan', 'in_review': 'Sedang Direview', 'on_hold': 'Ditunda',
  'open': 'Terbuka', 'closed': 'Ditutup', 'draft': 'Draft',
  'published': 'Dipublikasikan', 'archived': 'Diarsipkan',
};

const GENDER_MAP: Record<string, string> = {
  'male': 'Laki-laki', 'female': 'Perempuan',
  'm': 'Laki-laki', 'f': 'Perempuan',
  'laki-laki': 'Laki-laki', 'perempuan': 'Perempuan',
};

const LEAVE_TYPE_MAP: Record<string, string> = {
  'annual': 'Cuti Tahunan', 'sick': 'Sakit', 'personal': 'Keperluan Pribadi',
  'maternity': 'Melahirkan', 'paternity': 'Cuti Ayah',
  'unpaid': 'Tanpa Gaji', 'other': 'Lainnya',
};

const ATTENDANCE_STATUS_MAP: Record<string, string> = {
  'present': 'Hadir', 'absent': 'Tidak Hadir', 'late': 'Terlambat',
  'half_day': 'Setengah Hari', 'on_leave': 'Cuti', 'sick': 'Sakit',
};

const INVITE_STATUS_MAP: Record<string, string> = {
  'pending': 'Menunggu', 'accepted': 'Diterima',
  'expired': 'Kedaluwarsa', 'cancelled': 'Dibatalkan',
};

const HOLIDAY_TYPE_MAP: Record<string, string> = {
  'national': 'Libur Nasional', 'company': 'Libur Perusahaan', 'substitute': 'Cuti Bersama',
};

const BACKUP_TYPE_MAP: Record<string, string> = {
  'manual': 'Manual', 'scheduled_daily': 'Harian',
  'scheduled_weekly': 'Mingguan', 'scheduled_monthly': 'Bulanan',
};

const DELIVERY_MAP: Record<string, string> = {
  'google_drive': 'Google Drive', 'local_download': 'Unduh ke Laptop',
};

const SESSION_ACTION_MAP: Record<string, string> = {
  'login': 'Masuk', 'logout': 'Keluar',
  'force_logout': 'Paksa Keluar', 'token_refresh': 'Perbarui Token',
};

// ── Generic normalizers ───────────────────────────────────────────────────────
export function normBool(value: unknown): string {
  if (value === true || value === 'true' || value === 1) return 'Ya';
  if (value === false || value === 'false' || value === 0) return 'Tidak';
  return '-';
}

export function normStatus(value: unknown): string {
  const s = String(value ?? '').toLowerCase();
  return STATUS_MAP[s] ?? (value != null && value !== '' ? String(value) : '-');
}

function normArray(value: unknown): string {
  if (!Array.isArray(value)) return value != null && value !== '' ? String(value) : '-';
  const items = value.filter(v => v != null && v !== '');
  if (items.length === 0) return '-';
  return items
    .map(v => {
      if (typeof v === 'object') return JSON.stringify(v);
      return String(v);
    })
    .join(', ');
}

function normMap(map: Record<string, string>) {
  return (value: unknown) => map[String(value ?? '').toLowerCase()] ?? (value != null && value !== '' ? String(value) : '-');
}

// Catch-all normalizer used for generic/unknown fields
function normValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';

  // Date-like ISO strings
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return formatDateHR(value);
  }

  // Firestore Timestamp serialized as {_seconds, _nanoseconds}
  if (typeof value === 'object' && value !== null && '_seconds' in (value as Record<string, unknown>)) {
    return formatDateHR(value);
  }

  // Arrays
  if (Array.isArray(value)) return normArray(value);

  // Objects → compact JSON
  if (typeof value === 'object') return JSON.stringify(value);

  // Booleans
  if (typeof value === 'boolean') return normBool(value);

  // Known enum fields
  if (key === 'role') return normMap(ROLE_MAP)(value);
  if (key === 'employmentType') return normMap(EMPLOYMENT_TYPE_MAP)(value);
  if (key === 'gender') return normMap(GENDER_MAP)(value);
  if (key === 'status' || key.endsWith('Status')) return normStatus(value);

  return String(value);
}

// ── Column definitions ────────────────────────────────────────────────────────
interface ColDef {
  key: string;
  label: string;
  norm?: (value: unknown) => string;
}

function col(key: string, label: string, norm?: (v: unknown) => string): ColDef {
  return { key, label, norm };
}

const COLS: Record<string, ColDef[]> = {
  users: [
    col('fullName',          'Nama Lengkap'),
    col('email',             'Email'),
    col('phone',             'No. Telepon'),
    col('role',              'Hak Akses / Peran',        normMap(ROLE_MAP)),
    col('isActive',          'Status Akun',              v => v === true || v === 'true' ? 'Aktif' : v === false || v === 'false' ? 'Tidak Aktif' : '-'),
    col('employmentType',    'Status Karyawan',          normMap(EMPLOYMENT_TYPE_MAP)),
    col('employmentStage',   'Tahap Karyawan'),
    col('brandName',         'Brand / Perusahaan'),
    col('divisionName',      'Divisi'),
    col('positionTitle',     'Jabatan'),
    col('isProfileComplete', 'Profil Lengkap',           normBool),
    col('gender',            'Jenis Kelamin',            normMap(GENDER_MAP)),
    col('birthDate',         'Tanggal Lahir',            formatDateHR),
    col('joinDate',          'Tanggal Bergabung',        formatDateHR),
    col('createdAt',         'Tanggal Terdaftar',        formatDateHR),
    col('updatedAt',         'Terakhir Diperbarui',      formatDateHR),
  ],

  employee_profiles: [
    col('fullName',                   'Nama Lengkap'),
    col('email',                      'Email'),
    col('phone',                      'No. Telepon'),
    col('gender',                     'Jenis Kelamin',                normMap(GENDER_MAP)),
    col('birthDate',                  'Tanggal Lahir',                formatDateHR),
    col('birthPlace',                 'Tempat Lahir'),
    col('address',                    'Alamat'),
    col('city',                       'Kota'),
    col('province',                   'Provinsi'),
    col('postalCode',                 'Kode Pos'),
    col('religion',                   'Agama'),
    col('maritalStatus',              'Status Pernikahan'),
    col('education',                  'Pendidikan Terakhir'),
    col('nik',                        'NIK'),
    col('npwp',                       'NPWP'),
    col('bpjsKesehatan',              'BPJS Kesehatan'),
    col('bpjsKetenagakerjaan',        'BPJS Ketenagakerjaan'),
    col('bankName',                   'Bank'),
    col('bankAccountNumber',          'No. Rekening'),
    col('bankAccountName',            'Nama Rekening'),
    col('emergencyContactName',       'Kontak Darurat'),
    col('emergencyContactPhone',      'Telepon Darurat'),
    col('emergencyContactRelation',   'Hubungan Darurat'),
    col('isComplete',                 'Profil Lengkap',               normBool),
    col('createdAt',                  'Tanggal Dibuat',               formatDateHR),
    col('updatedAt',                  'Terakhir Diperbarui',          formatDateHR),
  ],

  employee_invites: [
    col('fullName',       'Nama Lengkap'),
    col('email',          'Email'),
    col('role',           'Hak Akses',            normMap(ROLE_MAP)),
    col('employmentType', 'Status Karyawan',       normMap(EMPLOYMENT_TYPE_MAP)),
    col('brandName',      'Brand / Perusahaan'),
    col('divisionName',   'Divisi'),
    col('positionTitle',  'Jabatan'),
    col('status',         'Status Undangan',       normMap(INVITE_STATUS_MAP)),
    col('inviteCode',     'Kode Undangan'),
    col('invitedAt',      'Tanggal Undangan',      formatDateHR),
    col('acceptedAt',     'Tanggal Diterima',      formatDateHR),
    col('expiresAt',      'Kedaluwarsa',           formatDateHR),
    col('invitedByName',  'Diundang Oleh'),
    col('note',           'Catatan'),
    col('createdAt',      'Tanggal Dibuat',        formatDateHR),
  ],

  brands: [
    col('name',        'Nama Brand'),
    col('code',        'Kode'),
    col('description', 'Deskripsi'),
    col('isActive',    'Aktif', normBool),
    col('createdAt',   'Dibuat', formatDateHR),
    col('updatedAt',   'Diperbarui', formatDateHR),
  ],

  divisions: [
    col('name',        'Nama Divisi'),
    col('code',        'Kode'),
    col('description', 'Deskripsi'),
    col('brandName',   'Brand'),
    col('managerName', 'Manager'),
    col('isActive',    'Aktif', normBool),
    col('createdAt',   'Dibuat', formatDateHR),
    col('updatedAt',   'Diperbarui', formatDateHR),
  ],

  departments: [
    col('name',        'Nama Departemen'),
    col('code',        'Kode'),
    col('description', 'Deskripsi'),
    col('divisionName','Divisi'),
    col('headName',    'Kepala Departemen'),
    col('isActive',    'Aktif', normBool),
    col('createdAt',   'Dibuat', formatDateHR),
  ],

  positions: [
    col('title',       'Nama Jabatan'),
    col('code',        'Kode'),
    col('level',       'Level'),
    col('description', 'Deskripsi'),
    col('isActive',    'Aktif', normBool),
    col('createdAt',   'Dibuat', formatDateHR),
  ],

  attendance_records: [
    col('employeeName',  'Nama Karyawan'),
    col('employeeEmail', 'Email Karyawan'),
    col('date',          'Tanggal',        formatDateHR),
    col('checkIn',       'Jam Masuk',      formatDateHR),
    col('checkOut',      'Jam Keluar',     formatDateHR),
    col('status',        'Status',         normMap(ATTENDANCE_STATUS_MAP)),
    col('workHours',     'Jam Kerja'),
    col('overtimeHours', 'Jam Lembur'),
    col('location',      'Lokasi'),
    col('note',          'Catatan'),
    col('createdAt',     'Tanggal Input',  formatDateHR),
  ],

  attendance_sessions: [
    col('title',         'Nama Sesi'),
    col('date',          'Tanggal',        formatDateHR),
    col('startTime',     'Jam Mulai'),
    col('endTime',       'Jam Selesai'),
    col('status',        'Status',         normStatus),
    col('location',      'Lokasi'),
    col('totalPresent',  'Total Hadir'),
    col('totalAbsent',   'Total Tidak Hadir'),
    col('createdAt',     'Dibuat',         formatDateHR),
  ],

  permission_requests: [
    col('employeeName',    'Nama Karyawan'),
    col('employeeEmail',   'Email Karyawan'),
    col('permissionType',  'Jenis Izin'),
    col('date',            'Tanggal',            formatDateHR),
    col('startTime',       'Jam Mulai'),
    col('endTime',         'Jam Selesai'),
    col('reason',          'Alasan'),
    col('status',          'Status',             normStatus),
    col('approvedByName',  'Disetujui Oleh'),
    col('createdAt',       'Tanggal Pengajuan',  formatDateHR),
  ],

  leave_requests: [
    col('employeeName',    'Nama Karyawan'),
    col('employeeEmail',   'Email Karyawan'),
    col('leaveType',       'Jenis Cuti',         normMap(LEAVE_TYPE_MAP)),
    col('startDate',       'Tanggal Mulai',      formatDateHR),
    col('endDate',         'Tanggal Selesai',    formatDateHR),
    col('totalDays',       'Total Hari'),
    col('reason',          'Alasan'),
    col('status',          'Status',             normStatus),
    col('approvedByName',  'Disetujui Oleh'),
    col('approvedAt',      'Tanggal Persetujuan',formatDateHR),
    col('rejectionReason', 'Alasan Penolakan'),
    col('createdAt',       'Tanggal Pengajuan',  formatDateHR),
  ],

  leave_balances: [
    col('employeeName',   'Nama Karyawan'),
    col('employeeEmail',  'Email Karyawan'),
    col('year',           'Tahun'),
    col('leaveType',      'Jenis Cuti'),
    col('totalAllowance', 'Jatah Cuti'),
    col('used',           'Terpakai'),
    col('remaining',      'Sisa'),
    col('carryOver',      'Saldo Bawaan'),
    col('updatedAt',      'Terakhir Diperbarui', formatDateHR),
  ],

  company_holidays: [
    col('name',        'Nama Hari Libur'),
    col('date',        'Tanggal',                        formatDateHR),
    col('type',        'Jenis',                          normMap(HOLIDAY_TYPE_MAP)),
    col('description', 'Keterangan'),
    col('isRecurring', 'Berulang Setiap Tahun',          normBool),
  ],

  overtime_submissions: [
    col('employeeName',   'Nama Karyawan'),
    col('employeeEmail',  'Email Karyawan'),
    col('date',           'Tanggal',            formatDateHR),
    col('startTime',      'Jam Mulai'),
    col('endTime',        'Jam Selesai'),
    col('duration',       'Durasi (jam)'),
    col('reason',         'Alasan'),
    col('status',         'Status',             normStatus),
    col('approvedByName', 'Disetujui Oleh'),
    col('approvedAt',     'Tanggal Persetujuan',formatDateHR),
    col('createdAt',      'Tanggal Pengajuan',  formatDateHR),
  ],

  overtime_payroll_recaps: [
    col('employeeName',        'Nama Karyawan'),
    col('employeeEmail',       'Email Karyawan'),
    col('period',              'Periode'),
    col('totalOvertimeHours',  'Total Jam Lembur'),
    col('totalOvertimePay',    'Total Bayar Lembur'),
    col('status',              'Status',        normStatus),
    col('createdAt',           'Tanggal Rekap', formatDateHR),
  ],

  payroll_periods: [
    col('name',           'Nama Periode'),
    col('startDate',      'Tanggal Mulai',    formatDateHR),
    col('endDate',        'Tanggal Selesai',  formatDateHR),
    col('status',         'Status',           normStatus),
    col('totalEmployees', 'Total Karyawan'),
    col('createdAt',      'Dibuat',           formatDateHR),
  ],

  payroll_reports: [
    col('employeeName',  'Nama Karyawan'),
    col('employeeEmail', 'Email Karyawan'),
    col('period',        'Periode'),
    col('basicSalary',   'Gaji Pokok'),
    col('overtimePay',   'Uang Lembur'),
    col('allowances',    'Tunjangan'),
    col('deductions',    'Potongan'),
    col('netSalary',     'Gaji Bersih'),
    col('status',        'Status',   normStatus),
    col('createdAt',     'Dibuat',   formatDateHR),
  ],

  approval_requests: [
    col('requestType',     'Jenis Persetujuan'),
    col('requesterName',   'Diajukan Oleh'),
    col('requesterEmail',  'Email Pengaju'),
    col('approverName',    'Approver'),
    col('status',          'Status',             normStatus),
    col('description',     'Deskripsi'),
    col('submittedAt',     'Tanggal Pengajuan',  formatDateHR),
    col('decidedAt',       'Tanggal Keputusan',  formatDateHR),
    col('comments',        'Komentar'),
    col('createdAt',       'Dibuat',             formatDateHR),
  ],

  business_trips: [
    col('employeeName',  'Nama Karyawan'),
    col('employeeEmail', 'Email Karyawan'),
    col('destination',   'Tujuan'),
    col('purpose',       'Keperluan'),
    col('startDate',     'Tanggal Berangkat',   formatDateHR),
    col('endDate',       'Tanggal Kembali',     formatDateHR),
    col('duration',      'Durasi (hari)'),
    col('status',        'Status',              normStatus),
    col('totalBudget',   'Anggaran'),
    col('createdAt',     'Tanggal Pengajuan',   formatDateHR),
  ],

  business_trip_reports: [
    col('employeeName', 'Nama Karyawan'),
    col('title',        'Judul Laporan'),
    col('summary',      'Ringkasan'),
    col('result',       'Hasil'),
    col('status',       'Status', normStatus),
    col('submittedAt',  'Tanggal Laporan', formatDateHR),
    col('createdAt',    'Dibuat', formatDateHR),
  ],

  travel_orders: [
    col('orderNumber',   'No. Surat Dinas'),
    col('employeeName',  'Nama Karyawan'),
    col('destination',   'Tujuan'),
    col('purpose',       'Keperluan'),
    col('startDate',     'Tanggal Berangkat', formatDateHR),
    col('endDate',       'Tanggal Kembali',   formatDateHR),
    col('status',        'Status',            normStatus),
    col('createdAt',     'Dibuat',            formatDateHR),
  ],

  travel_tracking: [
    col('employeeName', 'Nama Karyawan'),
    col('date',         'Tanggal',    formatDateHR),
    col('location',     'Lokasi'),
    col('latitude',     'Latitude'),
    col('longitude',    'Longitude'),
    col('note',         'Catatan'),
    col('createdAt',    'Waktu',      formatDateHR),
  ],

  job_postings: [
    col('title',          'Judul Lowongan'),
    col('department',     'Departemen'),
    col('division',       'Divisi'),
    col('location',       'Lokasi'),
    col('employmentType', 'Tipe Pekerjaan',  normMap(EMPLOYMENT_TYPE_MAP)),
    col('status',         'Status',          normStatus),
    col('salaryMin',      'Gaji Minimum'),
    col('salaryMax',      'Gaji Maksimum'),
    col('openDate',       'Tanggal Buka',    formatDateHR),
    col('closeDate',      'Tanggal Tutup',   formatDateHR),
    col('totalApplicants','Total Pelamar'),
    col('createdAt',      'Dibuat',          formatDateHR),
  ],

  applications: [
    col('candidateName',  'Nama Pelamar'),
    col('candidateEmail', 'Email Pelamar'),
    col('jobTitle',       'Posisi Dilamar'),
    col('source',         'Sumber Lamaran'),
    col('status',         'Status',              normStatus),
    col('stage',          'Tahap'),
    col('appliedAt',      'Tanggal Melamar',     formatDateHR),
    col('updatedAt',      'Terakhir Diperbarui', formatDateHR),
  ],

  candidates: [
    col('fullName',        'Nama Lengkap'),
    col('email',           'Email'),
    col('phone',           'No. Telepon'),
    col('gender',          'Jenis Kelamin',     normMap(GENDER_MAP)),
    col('birthDate',       'Tanggal Lahir',     formatDateHR),
    col('education',       'Pendidikan Terakhir'),
    col('major',           'Jurusan'),
    col('university',      'Universitas'),
    col('graduationYear',  'Tahun Lulus'),
    col('experience',      'Pengalaman (tahun)'),
    col('currentPosition', 'Posisi Saat Ini'),
    col('currentCompany',  'Perusahaan Saat Ini'),
    col('expectedSalary',  'Ekspektasi Gaji'),
    col('skills',          'Keahlian',          normArray),
    col('status',          'Status',            normStatus),
    col('createdAt',       'Tanggal Daftar',    formatDateHR),
  ],

  candidate_documents: [
    col('candidateName', 'Nama Kandidat'),
    col('fileName',      'Nama File'),
    col('fileType',      'Tipe File'),
    col('category',      'Kategori'),
    col('status',        'Status', normStatus),
    col('uploadedAt',    'Waktu Upload', formatDateHR),
    col('createdAt',     'Dibuat', formatDateHR),
  ],

  assessments: [
    col('candidateName', 'Nama Kandidat'),
    col('assessmentType','Jenis Assessment'),
    col('score',         'Nilai'),
    col('maxScore',      'Nilai Maksimal'),
    col('status',        'Status',     normStatus),
    col('scheduledAt',   'Jadwal',     formatDateHR),
    col('completedAt',   'Selesai',    formatDateHR),
    col('notes',         'Catatan'),
    col('createdAt',     'Dibuat',     formatDateHR),
  ],

  interviews: [
    col('candidateName',   'Nama Kandidat'),
    col('interviewerName', 'Pewawancara'),
    col('jobTitle',        'Posisi'),
    col('type',            'Tipe Wawancara'),
    col('scheduledAt',     'Jadwal',       formatDateHR),
    col('location',        'Lokasi / Link'),
    col('status',          'Status',       normStatus),
    col('result',          'Hasil',        normMap({ 'pass': 'Lulus', 'fail': 'Tidak Lulus', 'hold': 'Ditunda' })),
    col('notes',           'Catatan'),
    col('createdAt',       'Dibuat',       formatDateHR),
  ],

  offerings: [
    col('candidateName',  'Nama Kandidat'),
    col('jobTitle',       'Posisi'),
    col('offeredSalary',  'Gaji Ditawarkan'),
    col('status',         'Status',              normStatus),
    col('offerDate',      'Tanggal Penawaran',   formatDateHR),
    col('responseDate',   'Tanggal Respons',     formatDateHR),
    col('startDate',      'Tanggal Mulai Kerja', formatDateHR),
    col('notes',          'Catatan'),
    col('createdAt',      'Dibuat',              formatDateHR),
  ],

  audit_logs: [
    col('actorName',   'Pelaku'),
    col('actorEmail',  'Email Pelaku'),
    col('actorRole',   'Peran',      normMap(ROLE_MAP)),
    col('action',      'Aksi'),
    col('category',    'Kategori'),
    col('targetType',  'Tipe Target'),
    col('targetName',  'Target'),
    col('reason',      'Keterangan'),
    col('ipAddress',   'IP Address'),
    col('createdAt',   'Waktu',      formatDateHR),
  ],

  session_logs: [
    col('userName',    'Nama Pengguna'),
    col('userEmail',   'Email'),
    col('action',      'Aksi',         normMap(SESSION_ACTION_MAP)),
    col('device',      'Perangkat'),
    col('browser',     'Browser'),
    col('ipAddress',   'IP Address'),
    col('createdAt',   'Waktu',        formatDateHR),
  ],

  export_logs: [
    col('exportedByName',  'Diekspor Oleh'),
    col('exportedByEmail', 'Email'),
    col('collectionName',  'Data yang Diekspor'),
    col('format',          'Format',   v => String(v ?? '-').toUpperCase()),
    col('totalDocuments',  'Total Dokumen'),
    col('delivery',        'Tujuan',   normMap(DELIVERY_MAP)),
    col('status',          'Status',   normStatus),
    col('fileName',        'Nama File'),
    col('createdAt',       'Waktu Export', formatDateHR),
  ],

  backup_logs: [
    col('requestedByName',  'Dijalankan Oleh'),
    col('requestedByEmail', 'Email'),
    col('backupType',       'Jenis Backup',  normMap(BACKUP_TYPE_MAP)),
    col('status',           'Status',        normStatus),
    col('formats',          'Format',        v => Array.isArray(v) ? v.map(f => String(f).toUpperCase()).join(', ') : '-'),
    col('totalCollections', 'Total Koleksi'),
    col('totalDocuments',   'Total Dokumen'),
    col('totalFiles',       'Total File'),
    col('durationSeconds',  'Durasi (detik)'),
    col('reason',           'Alasan'),
    col('errors',           'Error',         normArray),
    col('createdAt',        'Waktu Backup',  formatDateHR),
  ],
};

// ── Human-readable collection names ──────────────────────────────────────────
export const COLLECTION_DISPLAY_NAMES: Record<string, string> = {
  users:                    'Data Karyawan',
  employee_profiles:        'Profil Karyawan',
  employee_invites:         'Undangan Karyawan',
  brands:                   'Data Brand',
  divisions:                'Data Divisi',
  departments:              'Data Departemen',
  positions:                'Data Jabatan',
  attendance_records:       'Rekap Absensi',
  attendance_sessions:      'Sesi Absensi',
  attendance_settings:      'Pengaturan Absensi',
  attendance_corrections:   'Koreksi Absensi',
  permission_requests:      'Pengajuan Izin',
  leave_requests:           'Pengajuan Cuti',
  leave_balances:           'Saldo Cuti',
  company_holidays:         'Hari Libur',
  overtime_submissions:     'Pengajuan Lembur',
  overtime_payroll_recaps:  'Rekap Lembur Payroll',
  payroll_periods:          'Periode Payroll',
  payroll_reports:          'Laporan Payroll',
  payroll_snapshots:        'Snapshot Payroll',
  approval_requests:        'Approval',
  business_trips:           'Perjalanan Dinas',
  business_trip_reports:    'Laporan Dinas',
  travel_orders:            'Surat Perintah Dinas',
  travel_tracking:          'Tracking Dinas',
  job_postings:             'Lowongan Kerja',
  applications:             'Lamaran Kandidat',
  candidates:               'Data Kandidat',
  candidate_documents:      'Dokumen Kandidat',
  assessments:              'Assessment',
  interviews:               'Wawancara',
  offerings:                'Penawaran Kerja',
  audit_logs:               'Audit Log',
  session_logs:             'Log Sesi',
  export_logs:              'Riwayat Export',
  backup_logs:              'Riwayat Backup',
  system_settings:          'Pengaturan Sistem',
  menu_visibility:          'Visibilitas Menu',
  access_roles:             'Hak Akses',
  drive_files:              'File Drive',
  uploaded_documents:       'Dokumen Upload',
  attachments:              'Lampiran',
};

// ── Fields to always skip in generic mode ─────────────────────────────────────
const ALWAYS_SKIP = new Set([
  '_id', '_path', 'uid', 'userId', 'brandId', 'brandIds', 'assignedBrandIds',
  'divisionId', 'divisionIds', 'assignedDivisions', 'positionId', 'positionIds',
  'departmentId', 'inviteBatchId', 'createdBy', 'updatedBy', 'requestedByUid',
  'approvedByUid', 'interviewerUid', 'managerId', 'headId', 'jobPostingId',
  'applicationId', 'candidateId', 'assessmentId', 'interviewId', 'offeringId',
  'backupId', 'exportId', 'sessionId', 'accessToken', 'refreshToken',
  'driveConnectedByUid', 'authorizedByUid', 'updatedByUid', 'exportedByUid',
  'fcmToken', 'pushToken', 'deviceToken',
]);

// Generic label map for fallback
const GENERIC_LABELS: Record<string, string> = {
  fullName: 'Nama Lengkap', name: 'Nama', email: 'Email', phone: 'No. Telepon',
  role: 'Hak Akses', title: 'Judul', description: 'Deskripsi', status: 'Status',
  isActive: 'Status Aktif', isComplete: 'Lengkap', isProfileComplete: 'Profil Lengkap',
  employmentType: 'Status Karyawan', employmentStage: 'Tahap Karyawan',
  brandName: 'Brand', divisionName: 'Divisi', positionTitle: 'Jabatan',
  departmentName: 'Departemen', managerName: 'Manager', headName: 'Pimpinan',
  gender: 'Jenis Kelamin', birthDate: 'Tanggal Lahir', address: 'Alamat',
  city: 'Kota', province: 'Provinsi', education: 'Pendidikan',
  createdAt: 'Tanggal Dibuat', updatedAt: 'Terakhir Diperbarui',
  startDate: 'Tanggal Mulai', endDate: 'Tanggal Selesai',
  reason: 'Alasan', note: 'Catatan', notes: 'Catatan',
  type: 'Jenis', category: 'Kategori', code: 'Kode',
  score: 'Nilai', result: 'Hasil', location: 'Lokasi', date: 'Tanggal',
  duration: 'Durasi', period: 'Periode', year: 'Tahun',
  skills: 'Keahlian', tags: 'Tag', formats: 'Format',
};

// ── Get nested value ──────────────────────────────────────────────────────────
function getVal(doc: Record<string, unknown>, key: string): unknown {
  if (key in doc) return doc[key];
  const parts = key.split('.');
  let cur: unknown = doc;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

// ── Detect metadata/empty rows ────────────────────────────────────────────────
function isMetadataRow(row: Record<string, unknown>): boolean {
  return '_status' in row;
}

// ── Main formatter ────────────────────────────────────────────────────────────
export function formatRows(
  rows: Record<string, unknown>[],
  collectionName: string,
): Record<string, string>[] {
  const cols = COLS[collectionName];

  return rows.map(row => {
    // Pass metadata rows through with minimal formatting
    if (isMetadataRow(row)) {
      return {
        'Status': String(row['_status'] === 'not_found' ? 'Koleksi tidak ditemukan' : 'Data kosong'),
        'Koleksi': String(row['collectionName'] ?? collectionName),
        'Waktu Export': formatDateHR(row['exportedAt']),
      };
    }

    if (cols) {
      // Defined columns: ordered, labeled, normalized
      const out: Record<string, string> = {};
      for (const c of cols) {
        const raw = getVal(row, c.key);
        const val = c.norm ? (raw != null ? c.norm(raw) : '-') : normValue(c.key, raw);
        out[c.label] = !val || val === 'undefined' || val === 'null' ? '-' : val;
      }
      return out;
    }

    // Generic fallback: skip internal fields, use mapped labels
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      if (ALWAYS_SKIP.has(key) || key.startsWith('_')) continue;
      const label = GENERIC_LABELS[key] ?? key;
      const val = normValue(key, value);
      out[label] = !val || val === 'undefined' || val === 'null' ? '-' : val;
    }
    return out;
  });
}
