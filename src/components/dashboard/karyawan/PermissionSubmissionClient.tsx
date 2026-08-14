'use client';

import { useState, useMemo, useEffect, type ReactNode } from 'react';
import {
  useCollection,
  useFirestore,
  useMemoFirebase,
  deleteDocumentNonBlocking,
  useDoc,
} from '@/firebase';
import { collection, query, where, doc } from 'firebase/firestore';
import type { PermissionRequest, PermissionRequestStatus, EmployeeProfile, Brand } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { GoogleDatePicker } from '@/components/ui/google-date-picker';
import {
  Loader2,
  PlusCircle,
  Edit,
  Trash2,
  Clock,
  Eye,
  Paperclip,
  CheckCircle2,
  XCircle,
  Circle,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  ListChecks,
  Search,
  SortAsc,
  SortDesc,
  X,
} from 'lucide-react';
import {
  format,
  differenceInCalendarDays,
  isAfter,
  isBefore,
  startOfDay,
  endOfDay,
} from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { PermissionRequestForm } from './PermissionRequestForm';
import { PermissionStatusBadge, getHumanStatusLabel, permissionStatusDisplay } from './PermissionStatusBadge';
import { DeleteConfirmationDialog } from '../DeleteConfirmationDialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

// ─── Constants ────────────────────────────────────────────────────────────────

const FORM_TYPE_LABELS: Record<string, string> = {
  tidak_masuk: 'Tidak Masuk Kerja',
  datang_terlambat: 'Datang Terlambat',
  pulang_awal: 'Pulang Lebih Awal',
  keluar_kantor: 'Meninggalkan Kantor',
  sakit: 'Izin Sakit',
  duka: 'Izin Duka Cita',
  akademik: 'Izin Akademik',
  administrasi_resmi: 'Administrasi Resmi',
  lainnya: 'Izin Lainnya',
};

const REASON_LABELS: Record<string, string> = {
  sakit: 'Sakit',
  duka: 'Duka Cita',
  urusan_keluarga: 'Urusan Keluarga',
  administrasi_resmi: 'Administrasi Resmi',
  akademik: 'Akademik',
  transportasi: 'Transportasi / Kendaraan',
  keperluan_pribadi: 'Keperluan Pribadi',
  lainnya: 'Lainnya',
};

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'Semua Status' },
  { value: 'draft', label: 'Draf' },
  { value: 'pending_manager', label: 'Menunggu Atasan' },
  { value: 'revision_manager', label: 'Perlu Revisi' },
  { value: 'rejected_manager', label: 'Ditolak Atasan' },
  { value: 'approved_by_manager', label: 'Disetujui Atasan' },
  { value: 'pending_hrd', label: 'Menunggu HRD' },
  { value: 'revision_hrd', label: 'Perlu Revisi (HRD)' },
  { value: 'rejected_hrd', label: 'Ditolak HRD' },
  { value: 'approved', label: 'Disetujui' },
  { value: 'closed', label: 'Selesai' },
];

const FORM_TYPE_FILTER_OPTIONS = [
  { value: 'all', label: 'Semua Bentuk' },
  { value: 'tidak_masuk', label: 'Tidak Masuk Kerja' },
  { value: 'datang_terlambat', label: 'Datang Terlambat' },
  { value: 'pulang_awal', label: 'Pulang Lebih Awal' },
  { value: 'keluar_kantor', label: 'Meninggalkan Kantor' },
];

// Groups the granular Firestore statuses into the 3 buckets shown as tabs.
// Every value in PERMISSION_REQUEST_STATUSES must land in exactly one group.
const STATUS_GROUPS: Record<'menunggu' | 'selesai' | 'ditolak', PermissionRequestStatus[]> = {
  menunggu: ['draft', 'pending_manager', 'approved_by_manager', 'pending_hrd'],
  selesai: ['approved', 'closed', 'reported', 'returned', 'verified_manager'],
  ditolak: ['rejected_manager', 'revision_manager', 'rejected_hrd', 'revision_hrd'],
};

type TabValue = 'all' | 'menunggu' | 'selesai' | 'ditolak';

function getStatusGroup(status: string): 'menunggu' | 'selesai' | 'ditolak' {
  if (STATUS_GROUPS.selesai.includes(status as PermissionRequestStatus)) return 'selesai';
  if (STATUS_GROUPS.ditolak.includes(status as PermissionRequestStatus)) return 'ditolak';
  return 'menunggu';
}

const TAB_DEFS: { value: TabValue; label: string }[] = [
  { value: 'all', label: 'Semua' },
  { value: 'menunggu', label: 'Menunggu' },
  { value: 'selesai', label: 'Selesai' },
  { value: 'ditolak', label: 'Ditolak / Revisi' },
];

const EMPTY_STATE_COPY: Record<TabValue, { title: string; hint: string }> = {
  all: { title: 'Belum ada pengajuan izin.', hint: '' },
  menunggu: {
    title: 'Belum ada pengajuan yang menunggu persetujuan.',
    hint: 'Pengajuan yang sedang diproses akan muncul di sini.',
  },
  selesai: {
    title: 'Belum ada pengajuan yang selesai.',
    hint: 'Pengajuan yang sudah disetujui akan muncul di sini.',
  },
  ditolak: {
    title: 'Belum ada pengajuan yang ditolak atau perlu revisi.',
    hint: 'Pengajuan yang ditolak atau memerlukan revisi akan muncul di sini.',
  },
};

const PAGE_SIZE = 10;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(s: PermissionRequest): string {
  const formType = s.formType || s.type;
  if (formType === 'keluar_kantor') {
    const mins = s.totalDurationMinutes || 0;
    if (mins < 60) return `${mins} menit`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}j ${m}m` : `${h} jam`;
  }
  const days = differenceInCalendarDays(s.endDate.toDate(), s.startDate.toDate()) + 1;
  return days === 1 ? '1 hari' : `${days} hari`;
}

function resolveAttachmentSrc(url: string): string {
  if (!url) return url;
  if (url.startsWith('/api/')) return url;
  const m =
    url.match(/[?&]fileId=([^&]+)/) ||
    url.match(/\/d\/([a-zA-Z0-9-_]+)/) ||
    url.match(/id=([a-zA-Z0-9-_]+)/);
  if (m) return `/api/storage/google-drive-preview?fileId=${m[1]}`;
  return url;
}

type StepState = 'done' | 'active' | 'revision' | 'rejected' | 'pending';

function getWaitingFor(s: PermissionRequest): string | null {
  switch (s.status) {
    case 'pending_manager':
    case 'revision_manager':
      return s.managerName
        ? `Menunggu persetujuan ${s.managerName}`
        : 'Menunggu persetujuan atasan';
    case 'approved_by_manager':
    case 'pending_hrd':
    case 'revision_hrd':
      return 'Menunggu validasi HRD';
    default:
      return null;
  }
}

function getNodeState(nodeIndex: number, status: string): StepState {
  if (nodeIndex === 0) return 'done';
  if (nodeIndex === 1) {
    if (status === 'rejected_manager') return 'rejected';
    if (status === 'revision_manager') return 'revision';
    if (status === 'pending_manager') return 'active';
    if (
      ['approved_by_manager', 'pending_hrd', 'revision_hrd', 'rejected_hrd',
        'approved', 'closed', 'reported', 'returned', 'verified_manager'].includes(status)
    ) return 'done';
    return 'pending';
  }
  if (nodeIndex === 2) {
    if (status === 'rejected_hrd') return 'rejected';
    if (status === 'revision_hrd') return 'revision';
    if (['pending_hrd', 'approved_by_manager'].includes(status)) return 'active';
    if (['approved', 'closed', 'reported', 'returned', 'verified_manager'].includes(status)) return 'done';
    return 'pending';
  }
  return 'pending';
}

function getFormReasonLabels(s: PermissionRequest) {
  const formLabel = FORM_TYPE_LABELS[s.formType || s.type] || s.formType || s.type || '—';
  const reasonLabel = REASON_LABELS[s.reasonType || ''] || '';
  return { formLabel, reasonLabel };
}

// Who the request is currently waiting on, for the modal's quick-status strip.
function getProcessedBy(s: PermissionRequest): string | null {
  if (['pending_manager', 'revision_manager'].includes(s.status)) {
    return s.managerName || s.waitingForName || 'Atasan';
  }
  if (['approved_by_manager', 'pending_hrd', 'revision_hrd'].includes(s.status)) {
    return s.approvalFlow?.hrdName || 'HRD';
  }
  return null;
}

function getNextStepMessage(status: string): string {
  switch (status) {
    case 'draft':
      return 'Pengajuan belum dikirim. Lengkapi dan kirim pengajuan untuk memulai proses persetujuan.';
    case 'pending_manager':
    case 'revision_manager':
      return 'Setelah disetujui atasan, pengajuan akan diteruskan ke HRD untuk validasi akhir.';
    case 'approved_by_manager':
    case 'pending_hrd':
    case 'revision_hrd':
      return 'Menunggu validasi akhir dari HRD.';
    case 'rejected_manager':
    case 'rejected_hrd':
      return 'Pengajuan ditolak. Anda dapat membuat pengajuan baru jika masih diperlukan.';
    case 'approved':
    case 'closed':
    case 'reported':
    case 'returned':
    case 'verified_manager':
      return 'Pengajuan telah selesai diproses.';
    default:
      return '';
  }
}

// Best-effort display name/type for an attachment URL — no filename/size metadata
// is stored in Firestore, so these are derived safely from the URL itself.
function getAttachmentMeta(url: string, idx: number) {
  const isImg = /\.(jpg|jpeg|png|gif|webp)/i.test(url) || url.includes('image');
  let name = `Lampiran ${idx + 1}`;
  try {
    const path = decodeURIComponent(url.split('?')[0] || '');
    const last = path.split('/').filter(Boolean).pop();
    if (last && last.length > 0 && last.length < 60) name = last;
  } catch {
    // keep the fallback name
  }
  const extMatch = name.match(/\.([a-zA-Z0-9]+)$/);
  const ext = extMatch ? extMatch[1].toUpperCase() : (isImg ? 'GAMBAR' : 'FILE');
  return { name, ext, isImg };
}

const STEP_STATE_CONFIG: Record<StepState, {
  label: string;
  icon: typeof CheckCircle2;
  dot: string;
  iconColor: string;
  card: string;
  text: string;
}> = {
  done: {
    label: 'Selesai',
    icon: CheckCircle2,
    dot: 'bg-green-100 dark:bg-green-900/40',
    iconColor: 'text-green-600 dark:text-green-400',
    card: 'border-green-200/70 bg-green-50/50 dark:border-green-800/40 dark:bg-green-900/10',
    text: 'text-green-700 dark:text-green-400',
  },
  active: {
    label: 'Menunggu Persetujuan',
    icon: Clock,
    dot: 'bg-amber-100 dark:bg-amber-900/40',
    iconColor: 'text-amber-600 dark:text-amber-400',
    card: 'border-amber-300/70 bg-amber-50/60 dark:border-amber-800/40 dark:bg-amber-900/15 ring-1 ring-amber-400/20',
    text: 'text-amber-700 dark:text-amber-400',
  },
  revision: {
    label: 'Perlu Revisi',
    icon: Edit,
    dot: 'bg-orange-100 dark:bg-orange-900/40',
    iconColor: 'text-orange-600 dark:text-orange-400',
    card: 'border-orange-300/70 bg-orange-50/60 dark:border-orange-800/40 dark:bg-orange-900/15',
    text: 'text-orange-700 dark:text-orange-400',
  },
  rejected: {
    label: 'Ditolak',
    icon: XCircle,
    dot: 'bg-red-100 dark:bg-red-900/40',
    iconColor: 'text-red-600 dark:text-red-400',
    card: 'border-red-300/70 bg-red-50/60 dark:border-red-800/40 dark:bg-red-900/15',
    text: 'text-red-700 dark:text-red-400',
  },
  pending: {
    label: 'Belum Diproses',
    icon: Circle,
    dot: 'bg-muted',
    iconColor: 'text-muted-foreground/50',
    card: 'border-border bg-muted/20',
    text: 'text-muted-foreground',
  },
};

// ─── Summary card ─────────────────────────────────────────────────────────────

type SummaryTone = 'indigo' | 'amber' | 'emerald' | 'rose';

const SUMMARY_TONE_CLASSES: Record<SummaryTone, { bg: string; icon: string }> = {
  indigo: { bg: 'bg-indigo-50 dark:bg-indigo-950/30', icon: 'text-indigo-600 dark:text-indigo-400' },
  amber: { bg: 'bg-amber-50 dark:bg-amber-950/30', icon: 'text-amber-600 dark:text-amber-400' },
  emerald: { bg: 'bg-emerald-50 dark:bg-emerald-950/30', icon: 'text-emerald-600 dark:text-emerald-400' },
  rose: { bg: 'bg-rose-50 dark:bg-rose-950/30', icon: 'text-rose-600 dark:text-rose-400' },
};

function SummaryCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof ListChecks;
  label: string;
  value: number;
  tone: SummaryTone;
}) {
  const toneClasses = SUMMARY_TONE_CLASSES[tone];
  return (
    <Card className="border-slate-100 dark:border-slate-800 shadow-sm">
      <CardContent className="flex items-center gap-3 p-4">
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', toneClasses.bg)}>
          <Icon className={cn('h-5 w-5', toneClasses.icon)} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
          <p className="mt-0.5 text-xl font-black text-slate-900 dark:text-white">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── ApprovalProgress (mini, for table cell) ──────────────────────────────────

function ApprovalProgress({
  status,
  managerName,
}: {
  status: string;
  managerName?: string | null;
}) {
  const steps = ['Staff', managerName ? managerName.split(' ')[0] : 'Atasan', 'HRD'];
  return (
    <div className="flex items-center gap-0.5">
      {steps.map((label, i) => {
        const state = getNodeState(i, status);
        return (
          <div key={i} className="flex items-center gap-0.5">
            <span
              className={cn(
                'px-1.5 py-px rounded text-[9px] font-semibold whitespace-nowrap leading-4',
                state === 'done' && 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
                state === 'active' && 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 ring-1 ring-amber-400/30',
                state === 'revision' && 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
                state === 'rejected' && 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                state === 'pending' && 'bg-muted text-muted-foreground',
              )}
            >
              {label}
            </span>
            {i < steps.length - 1 && (
              <ArrowRight className="h-2 w-2 text-muted-foreground/40 flex-shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── TimelinePanel ────────────────────────────────────────────────────────────

function TimelinePanel({ timeline }: { timeline?: PermissionRequest['timeline'] }) {
  if (!timeline?.length) {
    return (
      <p className="text-sm text-muted-foreground italic py-2">
        Belum ada catatan aktivitas.
      </p>
    );
  }
  return (
    <ol className="space-y-4">
      {timeline.map((item, i) => {
        const isLast = i === timeline.length - 1;
        const firstWord = item.by?.split(' ')[0]?.toLowerCase() ?? '';
        const eventAlreadyIncludeBy =
          firstWord.length > 2 && item.event.toLowerCase().includes(firstWord);
        return (
          <li key={i} className="flex gap-3">
            <div className="flex flex-col items-center flex-shrink-0 w-3.5">
              <div
                className={cn(
                  'h-2.5 w-2.5 rounded-full mt-1 flex-shrink-0',
                  isLast ? 'bg-primary' : 'bg-muted-foreground/40',
                )}
              />
              {!isLast && (
                <div className="w-px flex-1 bg-border/60 mt-1 min-h-[18px]" />
              )}
            </div>
            <div className="pb-3 flex-1 min-w-0">
              <p className="text-sm text-foreground leading-snug">
                {item.by && !eventAlreadyIncludeBy && (
                  <span className="font-semibold">{item.by} — </span>
                )}
                {item.event}
              </p>
              {item.note && (
                <p className="text-sm text-muted-foreground mt-1 italic">"{item.note}"</p>
              )}
              {item.at && (
                <p className="text-xs text-muted-foreground/60 mt-0.5">
                  {format(item.at.toDate(), "dd MMM yyyy, HH:mm", { locale: idLocale })}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ─── ApprovalStepper (vertical, for the modal's Alur Persetujuan section) ─────

function ApprovalStepper({ s }: { s: PermissionRequest }) {
  const steps: { role: string; name: string; state: StepState; at?: PermissionRequest['createdAt'] | null }[] = [
    { role: 'Pengaju', name: s.fullName || s.applicantName || 'Staff', state: 'done', at: s.createdAt },
    { role: 'Atasan', name: s.managerName || 'Belum ditentukan', state: getNodeState(1, s.status), at: s.managerDecisionAt },
    { role: 'HRD', name: s.approvalFlow?.hrdName || 'HRD', state: getNodeState(2, s.status), at: s.hrdDecisionAt },
  ];
  return (
    <ol>
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        const cfg = STEP_STATE_CONFIG[step.state];
        const Icon = cfg.icon;
        return (
          <li key={i} className="flex gap-3">
            <div className="flex flex-col items-center flex-shrink-0">
              <div className={cn('h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0', cfg.dot)}>
                <Icon className={cn('h-4 w-4', cfg.iconColor, step.state === 'active' && 'animate-pulse')} />
              </div>
              {!isLast && <div className="w-px flex-1 bg-border/60 my-1 min-h-[20px]" />}
            </div>
            <div className={cn('flex-1 min-w-0 rounded-lg border p-3 mb-3', cfg.card)}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {step.role}
                </p>
                <span className={cn('text-[11px] font-semibold', cfg.text)}>{cfg.label}</span>
              </div>
              <p className="text-sm font-semibold text-foreground mt-1 truncate">{step.name}</p>
              {step.at?.toDate && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  {format(step.at.toDate(), 'dd MMMM yyyy, HH:mm', { locale: idLocale })}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ─── StatusSummaryStrip (quick-glance row under the modal header) ────────────

function StatusSummaryStrip({ s }: { s: PermissionRequest }) {
  const statusLabel = permissionStatusDisplay[s.status]?.label || s.status.replace(/_/g, ' ');
  const processedBy = getProcessedBy(s);
  const nextStep = getNextStepMessage(s.status);

  return (
    <div className="rounded-xl border border-border/60 bg-muted/30 p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
          Status Saat Ini
        </p>
        <p className="text-sm font-semibold text-foreground">{statusLabel}</p>
      </div>
      {processedBy && (
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            Sedang Diproses Oleh
          </p>
          <p className="text-sm font-semibold text-foreground truncate">{processedBy}</p>
        </div>
      )}
      {nextStep && (
        <div className={cn('min-w-0', !processedBy && 'sm:col-span-2')}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            Langkah Berikutnya
          </p>
          <p className="text-sm text-foreground leading-relaxed">{nextStep}</p>
        </div>
      )}
    </div>
  );
}

// ─── DetailPanel (modal body content) ─────────────────────────────────────────

function DetailPanel({ s }: { s: PermissionRequest }) {
  const { formLabel, reasonLabel } = getFormReasonLabels(s);
  const attachments = (s.attachments || []).filter(Boolean);
  const decisionNote =
    s.managerNotes ||
    s.hrdNotes ||
    s.managerReviewNote ||
    s.hrdReviewNote ||
    (s.approvalFlow as any)?.decisionNotes ||
    null;

  const df: Record<string, any> = s.dynamicFields || {};
  const extras: { label: string; value: string }[] = [];
  const push = (label: string, v: string | null | undefined) => {
    if (v) extras.push({ label, value: v });
  };
  push('Keluhan', df.sicknessDescription || s.sicknessDescription);
  push('Hubungan Keluarga', df.familyRelation || s.familyRelation);
  push('Nama Keluarga', df.familyName || s.familyName);
  push('Kegiatan', df.academicActivityName || s.academicActivityName);
  push('Institusi', df.academicInstitution || s.academicInstitution);
  push('Jenis Urusan', df.officialAffairType || s.officialAffairType);
  push('Judul Izin', s.otherTitle || df.otherTitle);

  const startDt = s.startDate.toDate();
  const endDt = s.endDate.toDate();
  const multiDay = differenceInCalendarDays(endDt, startDt) > 0;
  const formType = s.formType || s.type;

  const createdMs = s.createdAt?.toMillis?.() ?? 0;
  const updatedMs = s.updatedAt?.toMillis?.() ?? 0;
  const showUpdatedAt = updatedMs > 0 && Math.abs(updatedMs - createdMs) > 60_000;

  // A. Informasi Pengajuan — only include rows with a meaningful value
  const infoRows: { label: string; value: string }[] = [
    { label: 'Jenis Izin', value: formLabel },
    ...(reasonLabel ? [{ label: 'Bentuk / Kategori', value: reasonLabel }] : []),
    {
      label: 'Tanggal',
      value: multiDay
        ? `${format(startDt, 'dd MMM yyyy', { locale: idLocale })} — ${format(endDt, 'dd MMM yyyy', { locale: idLocale })}`
        : format(startDt, 'dd MMMM yyyy', { locale: idLocale }),
    },
    ...(formType === 'keluar_kantor'
      ? [
          { label: 'Jam Keluar', value: format(startDt, 'HH:mm') },
          { label: 'Jam Kembali', value: format(endDt, 'HH:mm') },
        ]
      : []),
    { label: 'Durasi', value: formatDuration(s) },
    {
      label: formType === 'keluar_kantor' ? 'Keperluan' : 'Keterangan',
      value: s.reason || s.detailedReason || 'Tidak ada keterangan tambahan.',
    },
    ...(s.destination ? [{ label: 'Tujuan', value: s.destination }] : []),
    ...(s.location ? [{ label: 'Lokasi', value: s.location }] : []),
    { label: 'Diajukan oleh', value: s.fullName || s.applicantName || '—' },
    ...(s.createdAt?.toDate
      ? [{ label: 'Dibuat pada', value: format(s.createdAt.toDate(), 'dd MMMM yyyy, HH:mm', { locale: idLocale }) }]
      : []),
    ...(showUpdatedAt && s.updatedAt?.toDate
      ? [{ label: 'Terakhir diperbarui', value: format(s.updatedAt.toDate(), 'dd MMMM yyyy, HH:mm', { locale: idLocale }) }]
      : []),
  ];

  const SectionHeading = ({ children }: { children: ReactNode }) => (
    <p className="text-sm font-bold text-foreground mb-3.5">
      {children}
    </p>
  );

  const SectionBox = ({ children }: { children: ReactNode }) => (
    <section className="rounded-xl border border-border/60 bg-card/50 p-4 sm:p-5">
      {children}
    </section>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* ── Kiri: Informasi Pengajuan + Lampiran ── */}
      <div className="space-y-6">
        {/* A. Informasi Pengajuan */}
        <SectionBox>
          <SectionHeading>Informasi Pengajuan</SectionHeading>
          <div className="space-y-3">
            {infoRows.map(({ label, value }) => (
              <div key={label} className="grid grid-cols-[130px_1fr] gap-3">
                <span className="text-sm text-muted-foreground shrink-0">{label}</span>
                <span className="text-sm font-medium text-foreground whitespace-pre-wrap leading-relaxed">
                  {value}
                </span>
              </div>
            ))}
            {extras.length > 0 && (
              <div className="pt-3 mt-1 border-t border-border/50 space-y-3">
                {extras.map(({ label, value }) => (
                  <div key={label} className="grid grid-cols-[130px_1fr] gap-3">
                    <span className="text-sm text-muted-foreground shrink-0">{label}</span>
                    <span className="text-sm font-medium text-foreground">{value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {decisionNote && (() => {
            const isRejected = s.status === 'rejected_manager' || s.status === 'rejected_hrd';
            const isRevision = s.status === 'revision_manager' || s.status === 'revision_hrd';
            const decidedByHrd =
              s.status === 'rejected_hrd' ||
              s.status === 'revision_hrd' ||
              (['approved', 'closed'].includes(s.status) && !!s.hrdDecisionAt);
            const actorName = decidedByHrd ? (s.approvalFlow?.hrdName || 'HRD') : (s.managerName || 'Atasan');
            const decisionAt = decidedByHrd ? s.hrdDecisionAt : s.managerDecisionAt;
            const heading = isRejected ? 'Alasan Penolakan' : isRevision ? 'Catatan' : 'Catatan Persetujuan';
            const actionLabel = isRejected ? 'Ditolak oleh' : isRevision ? 'Dikembalikan oleh' : 'Disetujui oleh';
            const tone = isRejected
              ? { border: 'border-red-200/60 dark:border-red-800/40', bg: 'bg-red-50/60 dark:bg-red-900/15', text: 'text-red-700 dark:text-red-400' }
              : isRevision
                ? { border: 'border-orange-200/60 dark:border-orange-800/40', bg: 'bg-orange-50/60 dark:bg-orange-900/15', text: 'text-orange-700 dark:text-orange-400' }
                : { border: 'border-emerald-200/60 dark:border-emerald-800/40', bg: 'bg-emerald-50/60 dark:bg-emerald-900/15', text: 'text-emerald-700 dark:text-emerald-400' };
            return (
              <div className={cn('mt-4 rounded-lg border p-3.5', tone.border, tone.bg)}>
                <p className={cn('text-sm font-semibold', tone.text)}>
                  {actionLabel} {actorName}
                </p>
                {decisionAt?.toDate && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {format(decisionAt.toDate(), 'dd MMMM yyyy, HH:mm', { locale: idLocale })}
                  </p>
                )}
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mt-3 mb-1">
                  {heading}
                </p>
                <p className="text-sm text-foreground leading-relaxed">{decisionNote}</p>
              </div>
            );
          })()}
        </SectionBox>

        {/* B. Lampiran */}
        <SectionBox>
          <SectionHeading>Lampiran</SectionHeading>
          {attachments.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-7 text-center">
              <Paperclip className="h-5 w-5 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Tidak ada lampiran</p>
            </div>
          ) : (
            <div className="space-y-2">
              {attachments.map((url, idx) => {
                const src = resolveAttachmentSrc(url);
                const { name, ext, isImg } = getAttachmentMeta(url, idx);
                return (
                  <div
                    key={idx}
                    className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5"
                  >
                    {isImg ? (
                      <img
                        src={src}
                        alt={name}
                        className="h-11 w-11 rounded-md object-cover border flex-shrink-0"
                      />
                    ) : (
                      <div className="h-11 w-11 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{name}</p>
                      <p className="text-[11px] text-muted-foreground">{ext}</p>
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <Button size="sm" variant="outline" asChild>
                        <a href={src} target="_blank" rel="noopener noreferrer">
                          Lihat
                        </a>
                      </Button>
                      <Button size="sm" variant="outline" className="px-2" asChild>
                        <a href={src} download title="Unduh lampiran">
                          <Download className="h-3.5 w-3.5" />
                        </a>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionBox>
      </div>

      {/* ── Kanan: Alur Persetujuan + Timeline ── */}
      <div className="space-y-6">
        {/* C. Alur Persetujuan */}
        <SectionBox>
          <SectionHeading>Alur Persetujuan</SectionHeading>
          <ApprovalStepper s={s} />
        </SectionBox>

        {/* D. Timeline / Riwayat Status */}
        <SectionBox>
          <SectionHeading>Timeline / Riwayat Status</SectionHeading>
          <TimelinePanel timeline={s.timeline} />
        </SectionBox>
      </div>
    </div>
  );
}

// ─── Detail Dialog (modal) ─────────────────────────────────────────────────────

function PermissionDetailDialog({
  request,
  onOpenChange,
  onEdit,
  onCancel,
}: {
  request: PermissionRequest | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (r: PermissionRequest) => void;
  onCancel: (r: PermissionRequest) => void;
}) {
  const { formLabel, reasonLabel } = request ? getFormReasonLabels(request) : { formLabel: '', reasonLabel: '' };
  const waitingFor = request ? getWaitingFor(request) : null;
  const canRevise = Boolean(request?.status?.startsWith('revision'));
  const canCancel = request?.status === 'draft';

  return (
    <Dialog open={Boolean(request)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] max-h-[calc(100vh-40px)] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0 border-b bg-background px-6 py-5 text-left">
          <DialogTitle>Detail Pengajuan Izin</DialogTitle>
          <DialogDescription className="sr-only">
            Rincian lengkap pengajuan izin, alur persetujuan, dan riwayat status.
          </DialogDescription>
          {request && (
            <div className="pt-2">
              <p className="text-2xl font-bold text-foreground leading-snug">{formLabel}</p>
              {reasonLabel && (
                <p className="text-base text-muted-foreground mt-0.5">{reasonLabel}</p>
              )}
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <PermissionStatusBadge
                  status={request.status}
                  className="text-sm px-2.5 py-1"
                />
                {waitingFor && (
                  <span className="text-sm text-muted-foreground">{waitingFor}</span>
                )}
              </div>
              {request.id && (
                <p className="text-[11px] text-muted-foreground/60 mt-2 font-mono">
                  ID Pengajuan: {request.id}
                </p>
              )}
            </div>
          )}
        </DialogHeader>

        {request && (
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-6">
            <StatusSummaryStrip s={request} />
            <DetailPanel s={request} />
          </div>
        )}

        <DialogFooter className="shrink-0 border-t bg-background px-6 py-4 gap-2">
          {request && canRevise && (
            <Button variant="outline" className="gap-1.5" onClick={() => onEdit(request)}>
              <Edit className="h-3.5 w-3.5" /> Perbaiki Pengajuan
            </Button>
          )}
          {request && canCancel && (
            <Button
              variant="outline"
              className="gap-1.5 text-destructive hover:text-destructive border-destructive/30 hover:border-destructive/60"
              onClick={() => onCancel(request)}
            >
              <Trash2 className="h-3.5 w-3.5" /> Batalkan Pengajuan
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function PermissionSubmissionClient() {
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<PermissionRequest | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [detailRequest, setDetailRequest] = useState<PermissionRequest | null>(null);

  // Tab + filter state
  const [activeTab, setActiveTab] = useState<TabValue>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterFormType, setFilterFormType] = useState('all');
  const [filterDateFrom, setFilterDateFrom] = useState<Date | null>(null);
  const [filterDateTo, setFilterDateTo] = useState<Date | null>(null);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [currentPage, setCurrentPage] = useState(1);

  const submissionsQuery = useMemoFirebase(
    () => {
      if (!userProfile?.uid) return null;
      return query(
        collection(firestore, 'permission_requests'),
        where('uid', '==', userProfile.uid),
      );
    },
    [userProfile?.uid, firestore],
  );

  const { data: submissions, isLoading, mutate } = useCollection<PermissionRequest>(submissionsQuery);

  const { data: employeeProfile } = useDoc<EmployeeProfile>(
    useMemoFirebase(
      () => (userProfile ? doc(firestore, 'employee_profiles', userProfile.uid) : null),
      [userProfile, firestore],
    ),
  );

  const { data: brands } = useCollection<Brand>(
    useMemoFirebase(() => collection(firestore, 'brands'), [firestore]),
  );

  const sortedSubmissions = useMemo(() => {
    if (!submissions) return [];
    const toMs = (t: any): number =>
      typeof t?.toMillis === 'function' ? t.toMillis() : (t?.seconds ?? 0) * 1000;
    return [...submissions].sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
  }, [submissions]);

  // Counts for the summary cards and the tab badges — always computed from the
  // user's full, unfiltered set so they reflect true totals.
  const statusCounts = useMemo(() => {
    const counts = { all: sortedSubmissions.length, menunggu: 0, selesai: 0, ditolak: 0 };
    for (const s of sortedSubmissions) counts[getStatusGroup(s.status)]++;
    return counts;
  }, [sortedSubmissions]);

  const hasActiveFilters = Boolean(
    searchQuery ||
      filterStatus !== 'all' ||
      filterFormType !== 'all' ||
      filterDateFrom ||
      filterDateTo ||
      sortOrder !== 'newest',
  );

  const filteredSubmissions = useMemo(() => {
    let items = sortedSubmissions;

    if (activeTab !== 'all') {
      items = items.filter(s => getStatusGroup(s.status) === activeTab);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(s => {
        const formLabel = FORM_TYPE_LABELS[s.formType || s.type] || '';
        const reasonLabel = REASON_LABELS[s.reasonType || ''] || '';
        const humanStatus = getHumanStatusLabel(s.status, s);
        const reason = (s.reason || s.detailedReason || '').toLowerCase();
        const manager = (s.managerName || s.waitingForName || '').toLowerCase();
        const other = (s.otherTitle || '').toLowerCase();
        return (
          formLabel.toLowerCase().includes(q) ||
          reasonLabel.toLowerCase().includes(q) ||
          humanStatus.toLowerCase().includes(q) ||
          reason.includes(q) ||
          manager.includes(q) ||
          other.includes(q)
        );
      });
    }

    if (filterStatus !== 'all') {
      items = items.filter(s => s.status === filterStatus);
    }

    if (filterFormType !== 'all') {
      items = items.filter(s => (s.formType || s.type) === filterFormType);
    }

    if (filterDateFrom) {
      const from = startOfDay(filterDateFrom);
      items = items.filter(s => !isBefore(s.startDate.toDate(), from));
    }

    if (filterDateTo) {
      const to = endOfDay(filterDateTo);
      items = items.filter(s => !isAfter(s.startDate.toDate(), to));
    }

    return sortOrder === 'oldest' ? [...items].reverse() : items;
  }, [sortedSubmissions, activeTab, searchQuery, filterStatus, filterFormType, filterDateFrom, filterDateTo, sortOrder]);

  // Reset to page 1 whenever the visible result set could change shape.
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchQuery, filterStatus, filterFormType, filterDateFrom, filterDateTo, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(filteredSubmissions.length / PAGE_SIZE));
  const paginatedSubmissions = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredSubmissions.slice(start, start + PAGE_SIZE);
  }, [filteredSubmissions, currentPage]);

  const pageNumbers = useMemo(() => {
    const maxButtons = 5;
    let start = Math.max(1, currentPage - Math.floor(maxButtons / 2));
    const end = Math.min(totalPages, start + maxButtons - 1);
    start = Math.max(1, end - maxButtons + 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }, [currentPage, totalPages]);

  const clearFilters = () => {
    setSearchQuery('');
    setFilterStatus('all');
    setFilterFormType('all');
    setFilterDateFrom(null);
    setFilterDateTo(null);
    setSortOrder('newest');
  };

  const handleCreate = () => {
    setSelectedRequest(null);
    setIsFormOpen(true);
  };

  const handleEdit = (request: PermissionRequest) => {
    setSelectedRequest(request);
    setIsFormOpen(true);
  };

  const handleCancelRequest = (request: PermissionRequest) => {
    setSelectedRequest(request);
    setIsDeleteDialogOpen(true);
  };

  const confirmCancel = async () => {
    if (!selectedRequest) return;
    try {
      await deleteDocumentNonBlocking(
        doc(firestore, 'permission_requests', selectedRequest.id!),
      );
      toast({ title: 'Pengajuan Dibatalkan' });
      mutate();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Gagal Membatalkan', description: e.message });
    } finally {
      setIsDeleteDialogOpen(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const emptyCopy = EMPTY_STATE_COPY[activeTab];

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">Pengajuan Izin</h1>
            <p className="text-sm text-muted-foreground">Buat dan lacak status pengajuan izin Anda.</p>
          </div>
          <Button onClick={handleCreate} className="gap-2">
            <PlusCircle className="h-4 w-4" />
            Buat Pengajuan
          </Button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryCard icon={ListChecks} label="Total Pengajuan" value={statusCounts.all} tone="indigo" />
          <SummaryCard icon={Clock} label="Menunggu Persetujuan" value={statusCounts.menunggu} tone="amber" />
          <SummaryCard icon={CheckCircle2} label="Disetujui / Selesai" value={statusCounts.selesai} tone="emerald" />
          <SummaryCard icon={XCircle} label="Ditolak / Revisi" value={statusCounts.ditolak} tone="rose" />
        </div>

        <Card>
          <CardHeader className="pb-3 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle>Riwayat Pengajuan</CardTitle>
              {sortedSubmissions.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {filteredSubmissions.length} dari {sortedSubmissions.length} pengajuan
                </span>
              )}
            </div>

            {/* Tabs */}
            <div className="overflow-x-auto">
              <Tabs value={activeTab} onValueChange={v => setActiveTab(v as TabValue)}>
                <TabsList>
                  {TAB_DEFS.map(tab => (
                    <TabsTrigger key={tab.value} value={tab.value} className="text-xs sm:text-sm">
                      {tab.label} ({statusCounts[tab.value]})
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Filter bar */}
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Cari jenis, alasan, status, atasan..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-8 h-9 text-sm"
                />
              </div>

              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[170px] h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_FILTER_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterFormType} onValueChange={setFilterFormType}>
                <SelectTrigger className="w-[170px] h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORM_TYPE_FILTER_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <GoogleDatePicker
                value={filterDateFrom}
                onChange={setFilterDateFrom}
                placeholder="Dari tanggal"
                className="w-[160px] h-9 text-sm"
              />
              <GoogleDatePicker
                value={filterDateTo}
                onChange={setFilterDateTo}
                placeholder="Sampai tanggal"
                className="w-[160px] h-9 text-sm"
              />

              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 px-3 text-sm"
                onClick={() =>
                  setSortOrder(prev => (prev === 'newest' ? 'oldest' : 'newest'))
                }
              >
                {sortOrder === 'newest' ? (
                  <>
                    <SortDesc className="h-3.5 w-3.5" /> Terbaru
                  </>
                ) : (
                  <>
                    <SortAsc className="h-3.5 w-3.5" /> Terlama
                  </>
                )}
              </Button>

              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 gap-1.5 px-3 text-sm text-muted-foreground"
                  onClick={clearFilters}
                >
                  <X className="h-3.5 w-3.5" /> Reset Filter
                </Button>
              )}
            </div>

            {/* Table */}
            <div className="rounded-lg border overflow-x-auto">
              <Table className="min-w-[980px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">Izin</TableHead>
                    <TableHead className="w-[155px]">Periode</TableHead>
                    <TableHead className="w-[180px]">Keterangan</TableHead>
                    <TableHead className="w-[110px]">Lampiran</TableHead>
                    <TableHead className="w-[170px]">Status</TableHead>
                    <TableHead className="w-[175px]">Alur</TableHead>
                    <TableHead className="w-[95px]">Diajukan</TableHead>
                    <TableHead className="w-[130px] text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedSubmissions.length > 0 ? (
                    paginatedSubmissions.map(s => {
                      const id = s.id!;
                      const { formLabel, reasonLabel } = getFormReasonLabels(s);
                      const attachments = (s.attachments || []).filter(Boolean);
                      const hasAttachment = attachments.length > 0;
                      const reasonText = s.reason || s.detailedReason || '';
                      const formType = s.formType || s.type;
                      const startDt = s.startDate.toDate();
                      const endDt = s.endDate.toDate();
                      const sameDay = differenceInCalendarDays(endDt, startDt) === 0;
                      const showManagerSecondary =
                        ['pending_manager', 'revision_manager'].includes(s.status) &&
                        (s.managerName || s.waitingForName);

                      return (
                        <TableRow key={id} className="transition-colors">
                          {/* 1. Izin */}
                          <TableCell>
                            <div className="min-w-0">
                              <p className="font-medium text-sm leading-snug">{formLabel}</p>
                              {reasonLabel && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {reasonLabel}
                                </p>
                              )}
                              {s.otherTitle && (
                                <p className="text-xs text-muted-foreground mt-0.5 italic truncate max-w-[160px]">
                                  {s.otherTitle}
                                </p>
                              )}
                            </div>
                          </TableCell>

                          {/* 2. Periode */}
                          <TableCell>
                            <div className="text-sm leading-snug">
                              {formType === 'keluar_kantor' ? (
                                <>
                                  <p>{format(startDt, 'dd MMM yyyy', { locale: idLocale })}</p>
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {format(startDt, 'HH:mm')} — {format(endDt, 'HH:mm')}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {formatDuration(s)}
                                  </p>
                                </>
                              ) : sameDay ? (
                                <>
                                  <p>{format(startDt, 'dd MMM yyyy', { locale: idLocale })}</p>
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {formatDuration(s)}
                                  </p>
                                </>
                              ) : (
                                <>
                                  <p>
                                    {format(startDt, 'dd MMM', { locale: idLocale })} —{' '}
                                    {format(endDt, 'dd MMM yyyy', { locale: idLocale })}
                                  </p>
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {formatDuration(s)}
                                  </p>
                                </>
                              )}
                            </div>
                          </TableCell>

                          {/* 3. Keterangan */}
                          <TableCell>
                            <p className="text-sm text-foreground/75 line-clamp-2 leading-relaxed">
                              {reasonText || (
                                <span className="italic text-muted-foreground text-xs">Tidak ada keterangan.</span>
                              )}
                            </p>
                          </TableCell>

                          {/* 4. Lampiran */}
                          <TableCell>
                            {hasAttachment ? (
                              <div className="flex flex-col gap-1">
                                <Badge className="border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px] gap-1 w-fit">
                                  <Paperclip className="h-2.5 w-2.5" />
                                  Ada
                                </Badge>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-[10px] text-primary w-fit"
                                  onClick={() => {
                                    window.open(resolveAttachmentSrc(attachments[0]), '_blank');
                                  }}
                                >
                                  Lihat
                                </Button>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground/50">Tidak ada</span>
                            )}
                          </TableCell>

                          {/* 5. Status */}
                          <TableCell>
                            <div className="space-y-0.5">
                              <PermissionStatusBadge status={s.status} />
                              {showManagerSecondary && (
                                <p className="text-[11px] text-muted-foreground truncate max-w-[150px]">
                                  {s.managerName || s.waitingForName}
                                </p>
                              )}
                            </div>
                          </TableCell>

                          {/* 6. Alur */}
                          <TableCell>
                            <ApprovalProgress
                              status={s.status}
                              managerName={s.managerName || s.waitingForName}
                            />
                          </TableCell>

                          {/* 7. Diajukan */}
                          <TableCell>
                            <div className="text-xs text-muted-foreground leading-snug">
                              {s.createdAt?.toDate ? (
                                <>
                                  <p>
                                    {format(s.createdAt.toDate(), 'dd MMM yyyy', {
                                      locale: idLocale,
                                    })}
                                  </p>
                                  <p className="opacity-60">
                                    {format(s.createdAt.toDate(), 'HH:mm')}
                                  </p>
                                </>
                              ) : (
                                'Baru saja'
                              )}
                            </div>
                          </TableCell>

                          {/* 8. Aksi */}
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1.5 text-xs w-full justify-center"
                              onClick={() => setDetailRequest(s)}
                            >
                              <Eye className="h-3.5 w-3.5" /> Lihat Detail
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={8} className="h-36 text-center">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <FileText className="h-8 w-8 opacity-25" />
                          {sortedSubmissions.length === 0 ? (
                            <>
                              <p className="text-sm font-medium">{EMPTY_STATE_COPY.all.title}</p>
                              <Button size="sm" onClick={handleCreate} className="gap-1.5 mt-1">
                                <PlusCircle className="h-3.5 w-3.5" /> Buat Pengajuan
                              </Button>
                            </>
                          ) : hasActiveFilters ? (
                            <>
                              <p className="text-sm font-medium">Tidak ada pengajuan yang sesuai filter.</p>
                              <Button
                                variant="link"
                                size="sm"
                                onClick={clearFilters}
                                className="text-xs h-auto p-0"
                              >
                                Bersihkan filter
                              </Button>
                            </>
                          ) : (
                            <>
                              <p className="text-sm font-medium">{emptyCopy.title}</p>
                              {emptyCopy.hint && (
                                <p className="text-xs max-w-xs">{emptyCopy.hint}</p>
                              )}
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {filteredSubmissions.length > PAGE_SIZE && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
                <p className="text-xs text-muted-foreground">
                  Menampilkan {(currentPage - 1) * PAGE_SIZE + 1}-
                  {Math.min(currentPage * PAGE_SIZE, filteredSubmissions.length)} dari{' '}
                  {filteredSubmissions.length} pengajuan
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  {pageNumbers.map(p => (
                    <Button
                      key={p}
                      variant={p === currentPage ? 'default' : 'outline'}
                      size="sm"
                      className="h-8 w-8 p-0 text-xs"
                      onClick={() => setCurrentPage(p)}
                    >
                      {p}
                    </Button>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <PermissionDetailDialog
        request={detailRequest}
        onOpenChange={open => !open && setDetailRequest(null)}
        onEdit={r => {
          setDetailRequest(null);
          handleEdit(r);
        }}
        onCancel={r => {
          setDetailRequest(null);
          handleCancelRequest(r);
        }}
      />

      <PermissionRequestForm
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        submission={selectedRequest}
        employeeProfile={employeeProfile || null}
        brands={brands || []}
        onSuccess={mutate}
      />

      <DeleteConfirmationDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        onConfirm={confirmCancel}
        itemName="pengajuan izin ini"
        itemType=""
      />
    </>
  );
}
