'use client';

import { Dialog, DialogContent, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn, getInitials } from '@/lib/utils';
import {
  Copy, X, AlertCircle, RotateCw, ShieldAlert, CheckCircle2,
  FileText, LogIn, LogOut, MapPin, Navigation, Clock, ZoomIn,
  Image as ImageIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useToast } from '@/hooks/use-toast';
import { getAttendanceImageUrl, getConditionProofImageSrc } from '@/lib/google-drive-image';
import { resolveCoordinates, type LocationValidation } from '@/lib/attendance-helpers';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Textarea } from '@/components/ui/textarea';

interface AttendanceDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMarkInvalid?: () => void;
  onReview?: (status: 'approved' | 'rejected' | 'revision_requested' | 'valid_auto' | 'needs_review' | 'acknowledged', note: string) => void;
  record: {
    id: string;
    name: string;
    employeeNumber: string;
    brandName: string;
    divisionName: string;
    attendanceMethod: string;
    tapIn: string;
    tapOut: string;
    status: string;
    address: string;
    addressIn?: string;
    addressOut?: string;
    photoUrl?: string | null;
    lateMinutes?: number | null;
    /**
     * The result of AttendanceMonitoringClient's calculateAttendanceLateStatus
     * — the modal must read these, never derive lateness itself from
     * lateMinutes/tapIn again (that's exactly how the table and the modal
     * used to drift apart). null calculatedLateMinutes means "unknown"
     * (scheduleMissing) and must render as such, never silently as "Normal".
     */
    calculatedLateMinutes?: number | null;
    calculatedAttendanceStatus?: 'Terlambat' | 'Normal' | null;
    calculatedIsLate?: boolean;
    attendanceSiteId?: string | null;
    attendanceSiteName?: string | null;
    scheduledStartTime?: string | null;
    scheduledEndTime?: string | null;
    lateToleranceMinutesUsed?: number;
    latestCheckInWithoutReview?: string | null;
    scheduleMissing?: boolean;
    /** No attendance_sites doc matched this employee's brand at all — needs Super Admin to fix the site's brandIds, distinct from a normal non-working day. */
    siteMissing?: boolean;
    /** Site matched fine, but this weekday isn't in its workSchedules — a normal "not a working day" state. */
    dayInactive?: boolean;
    earlyLeaveMinutes?: number | null;
    /** Minutes between tap-in and tap-out — null while the employee is still working. */
    workDurationMinutes?: number | null;
    specialCondition?: string | null;
    locationValidation?: LocationValidation | null;
    locationValidationOut?: LocationValidation | null;
    hrdReviewStatus?: string | null;
    hrdReviewNote?: string | null;
    hrdReviewedByName?: string | null;
    hrdReviewedAt?: any;
    rawEvent?: any; // For accessing original event data with driveFileId, etc
    rawEventIn?: any;
    rawEventOut?: any;
    /** The matching attendance_condition_reports docs — check-in and check-out are independent and must render as two separate cards, never merged/fell-back into each other. */
    conditionReport?: any | null;
    rawConditionReport?: any | null;
    rawConditionReportIn?: any | null;
    rawConditionReportOut?: any | null;
  } | null;
}

// This is a note trail for HRD's awareness, never an approval gate — absensi
// counts the moment there's a tap-in regardless of this value. Wording is
// deliberately non-approval (no "menunggu approval"/"belum disetujui").
const HRD_REVIEW_LABEL: Record<string, string> = {
  valid_auto: 'Aman',
  needs_review: 'Perlu Catatan HRD',
  approved: 'Sudah Dicek HRD',
  rejected: 'Catatan Diabaikan',
  revision_requested: 'Diminta Klarifikasi',
  acknowledged: 'Terima Kasih',
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'Sedang Bekerja':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    case 'Selesai':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    case 'Belum Tap In':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
    case 'Terlambat':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
    case 'Cuti Tahunan':
      return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300';
    default:
      return 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300';
  }
};

type Tone = 'default' | 'green' | 'red' | 'yellow' | 'gray';

const TONE_PILL_CLASS: Record<Exclude<Tone, 'default'>, string> = {
  green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  red: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  yellow: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  gray: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

const TONE_TEXT_CLASS: Record<Tone, string> = {
  default: 'text-slate-800 dark:text-white',
  green: 'text-emerald-700 dark:text-emerald-400',
  red: 'text-red-700 dark:text-red-400',
  yellow: 'text-amber-700 dark:text-amber-400',
  gray: 'text-slate-500 dark:text-slate-400',
};

function formatDurationMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h <= 0) return `${m} menit`;
  if (m <= 0) return `${h} jam`;
  return `${h} jam ${m} menit`;
}

function getCoordsFromEvent(event: any): { lat: number; lng: number } | null {
  if (!event) return null;
  if (typeof event.location?.lat === 'number' && typeof event.location?.lng === 'number') {
    return { lat: event.location.lat, lng: event.location.lng };
  }
  const resolved = resolveCoordinates(event);
  return resolved ? { lat: resolved.latitude, lng: resolved.longitude } : null;
}

function getLocationSummary(validation?: LocationValidation | null): { label: string; tone: Tone } {
  if (!validation) return { label: 'Tidak ada data', tone: 'gray' };
  if (validation.isValidAuto) return { label: validation.badges[0] ?? 'Sesuai', tone: 'green' };
  return { label: validation.badges[0] ?? 'Perlu Review', tone: 'yellow' };
}

/** True only when the report explicitly declares a non-image mimeType — unknown/missing mimeType still tries to render as a photo (Drive/Storage URLs often carry no mimeType at all). */
function isExplicitlyNonImage(report: any): boolean {
  const mimeType: string | undefined = report?.mimeType || report?.attachments?.[0]?.mimeType;
  return !!mimeType && !mimeType.startsWith('image/');
}

function formatConditionReportTime(report: any): string | null {
  const ts = report?.reportedAt || report?.createdAt;
  if (!ts?.toDate) return null;
  try {
    return ts.toDate().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';
  } catch {
    return null;
  }
}

const CONDITION_CARD_VARIANTS = {
  check_in: {
    label: 'Kondisi Saat Masuk',
    shortLabel: 'Masuk',
    badge: 'MASUK',
    icon: LogIn,
    cardClass: 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/10',
    headingClass: 'text-blue-700 dark:text-blue-300',
    badgeClass: 'bg-blue-600 text-white',
  },
  check_out: {
    label: 'Kondisi Saat Pulang',
    shortLabel: 'Pulang',
    badge: 'PULANG',
    icon: LogOut,
    cardClass: 'border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/10',
    headingClass: 'text-orange-700 dark:text-orange-300',
    badgeClass: 'bg-orange-600 text-white',
  },
} as const;

/**
 * Fullscreen photo viewer, rendered via a body-level portal so its `fixed`
 * positioning is relative to the viewport — not to DialogContent, which has
 * its own CSS transform (for centering) and would otherwise become the
 * containing block for a nested `fixed` element.
 *
 * ESC is the only way out (deliberately no close button and no
 * click-to-close — a stray click landing on the photo/caption while
 * inspecting it should not dismiss the preview). Escape is handled entirely
 * by the parent via Radix's `onEscapeKeyDown` on DialogContent (see
 * AttendanceDetailModal below), not by a listener in here — Radix's own
 * DismissableLayer reacts to Escape regardless of this portal's existence
 * (it isn't a registered Radix layer), so without that upstream
 * `preventDefault()` the underlying Detail modal would close at the same
 * time as the lightbox. `onPointerDownOutside` on DialogContent (also below)
 * still needs to stay guarded while this is open, purely so an incidental
 * click landing on this portal doesn't get treated by Radix as "clicked
 * outside the Dialog" and close the Detail modal underneath.
 */
function Lightbox({ src, caption }: { src: string; caption: string }) {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/[0.86] p-4 sm:p-10"
      role="dialog"
      aria-modal="true"
      aria-label={caption}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={caption}
        className="max-h-[80vh] max-w-[92vw] w-auto select-none rounded-lg object-contain shadow-2xl"
      />
      <p className="mt-4 text-sm font-medium text-white/90">{caption}</p>
      <p className="mt-1 text-xs text-white/50">Tekan ESC untuk kembali ke detail absensi</p>
    </div>,
    document.body,
  );
}

/** Any evidence photo (Tap In / Tap Out / kondisi khusus) — click to open in Lightbox, with a hover hint so HRD knows it's clickable. */
function ClickableImage({
  src, alt, onOpen, onError, className,
}: {
  src: string;
  alt: string;
  onOpen: () => void;
  onError?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onOpen(); }}
      className={cn('group relative block w-full cursor-zoom-in overflow-hidden rounded-[12px]', className)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onError={onError}
        className="h-full w-full rounded-[10px] object-contain"
      />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all duration-150 group-hover:bg-black/40 group-hover:opacity-100">
        <span className="flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-xs font-medium text-white">
          <ZoomIn className="h-3.5 w-3.5" /> Klik untuk memperbesar
        </span>
      </div>
    </button>
  );
}

/** Tap-in and tap-out photos are recorded and shown separately — each has its own load/reload state. */
function PhotoCard({ label, rawEvent, onOpenLightbox }: { label: string; rawEvent?: any; onOpenLightbox: (src: string, caption: string) => void }) {
  const [imageError, setImageError] = useState(false);
  const [reloadCount, setReloadCount] = useState(0);

  const imageUrl = rawEvent ? getAttendanceImageUrl(rawEvent) : null;
  const hasPhoto = imageUrl && imageUrl !== '-';
  const isPhotoExpired = rawEvent?.photoExpired === true;
  const hasPhotoData =
    rawEvent &&
    !isPhotoExpired &&
    (rawEvent.photoUrl ||
      rawEvent.photoFileId ||
      rawEvent.fileId ||
      rawEvent.evidence?.driveFileId ||
      rawEvent.evidence?.fileId ||
      rawEvent.evidence?.selfieUrl ||
      rawEvent.evidence?.directUrl ||
      rawEvent.photo?.fileId);

  const frameClass = 'h-[260px] sm:h-[300px] border border-slate-200 bg-[#f8fafc] p-2 dark:border-slate-700 dark:bg-slate-800';

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div className="px-4 pb-2 pt-3.5">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-white">{label}</h3>
      </div>
      <div className="px-3 pb-3.5">
        {hasPhoto ? (
          !imageError ? (
            <ClickableImage
              src={imageUrl}
              alt={label}
              onOpen={() => onOpenLightbox(imageUrl, label)}
              onError={() => setImageError(true)}
              className={frameClass}
              key={`photo-${reloadCount}`}
            />
          ) : (
            <div className={cn('flex flex-col items-center justify-center gap-3 rounded-[12px] p-4 text-center', frameClass)}>
              <AlertCircle className="h-8 w-8 text-slate-400" />
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300">Foto tidak bisa dimuat</p>
              <Button variant="outline" size="sm" onClick={() => { setImageError(false); setReloadCount((p) => p + 1); }} className="h-7 gap-1.5 text-xs">
                <RotateCw className="h-3.5 w-3.5" /> Muat Ulang
              </Button>
            </div>
          )
        ) : (
          <div className={cn('flex flex-col items-center justify-center gap-1.5 rounded-[12px] border-dashed p-4 text-center', frameClass)}>
            <Badge variant="outline" className="mb-1 text-xs">
              {isPhotoExpired ? 'Foto dihapus' : hasPhotoData ? 'Gagal memuat foto' : rawEvent ? 'Foto Tidak Ada' : 'Belum Tap Out'}
            </Badge>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {isPhotoExpired
                ? 'Foto dihapus otomatis setelah 7 hari.'
                : hasPhotoData
                  ? 'Data foto ada tapi tidak bisa dimuat.'
                  : rawEvent
                    ? 'Bukti foto tidak tersimpan untuk event ini.'
                    : 'Karyawan belum melakukan tap out.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Kondisi-khusus photo evidence, sourced strictly from the condition-report
 * doc — never from rawEventIn/rawEventOut — so it can never silently fall
 * back to showing the Tap In / Tap Out photo.
 */
function ConditionPhotoTile({ type, report, onOpenLightbox }: { type: 'check_in' | 'check_out'; report: any; onOpenLightbox: (src: string, caption: string) => void }) {
  const [failed, setFailed] = useState(false);
  const imageSrc = getConditionProofImageSrc(report);
  const nonImageFile = isExplicitlyNonImage(report);
  if (!imageSrc || nonImageFile) return null;

  const variant = CONDITION_CARD_VARIANTS[type];
  const caption = `Bukti Kondisi Khusus (${variant.shortLabel})`;
  const frameClass = 'h-[220px] border border-slate-200 bg-[#f8fafc] p-2 dark:border-slate-700 dark:bg-slate-800';

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div className="px-4 pb-2 pt-3.5">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-white">{caption}</h3>
      </div>
      <div className="px-3 pb-3.5">
        {!failed ? (
          <ClickableImage
            src={imageSrc}
            alt={caption}
            onOpen={() => onOpenLightbox(imageSrc, caption)}
            onError={() => setFailed(true)}
            className={frameClass}
          />
        ) : (
          <div className={cn('flex flex-col items-center justify-center gap-2 rounded-[12px] p-4 text-center', frameClass)}>
            <AlertCircle className="h-6 w-6 text-slate-400" />
            <p className="text-xs text-slate-500 dark:text-slate-400">Foto tidak bisa dimuat.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Renders exactly one condition report's text (check-in OR check-out) — the
 * caller decides which side to render and passes only that report; this
 * component never falls back to the other side, so a missing check-out
 * report simply renders nothing instead of quietly showing check-in twice.
 * The photo itself is shown separately in the photo column (ConditionPhotoTile)
 * — this card only notes whether one exists.
 */
function ConditionReportCard({ type, report }: { type: 'check_in' | 'check_out'; report: any }) {
  const variant = CONDITION_CARD_VARIANTS[type];
  const Icon = variant.icon;

  const imageSrc = getConditionProofImageSrc(report);
  const nonImageFile = isExplicitlyNonImage(report);
  const reportedTime = formatConditionReportTime(report);
  const categoryLabel = report?.categoryLabel || report?.conditionTypeLabel || report?.category || report?.conditionCategory || null;
  const note = report?.note || report?.conditionNote || report?.reasonLabel || null;
  const reportLocation = report?.address || report?.location?.address || null;
  const reviewStatus = report?.reviewStatus || null;

  return (
    <Card className={variant.cardClass}>
      <CardContent className="p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${variant.headingClass}`}>
            <Icon className="h-3.5 w-3.5" /> {variant.label}
          </h3>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${variant.badgeClass}`}>{variant.badge}</span>
        </div>

        {reportedTime && (
          <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">Dilaporkan {reportedTime}</p>
        )}
        {categoryLabel && (
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{categoryLabel}</p>
        )}
        {note && (
          <p className="mt-0.5 text-sm text-slate-700 dark:text-slate-300">Catatan: {note}</p>
        )}
        {reportLocation && (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Lokasi: {reportLocation}</p>
        )}
        {reviewStatus && (
          <Badge variant="outline" className="mt-1.5 text-[10px]">{reviewStatus}</Badge>
        )}

        {imageSrc && !nonImageFile ? (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <ImageIcon className="h-3.5 w-3.5" /> Foto bukti tersedia — lihat di bagian Foto &amp; Bukti.
          </p>
        ) : imageSrc && nonImageFile ? (
          <a
            href={imageSrc}
            target="_blank"
            rel="noreferrer"
            className="mt-3 flex w-fit items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <FileText className="h-3.5 w-3.5" />
            {report?.attachments?.[0]?.fileName || 'Buka File'}
          </a>
        ) : (
          <p className="mt-2 text-xs italic text-slate-500 dark:text-slate-400">
            Tidak ada bukti foto kondisi yang diunggah.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function StatTile({ label, value, tone = 'default', icon: Icon }: { label: string; value: React.ReactNode; tone?: Tone; icon?: any }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900">
      <p className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {Icon && <Icon className="h-3 w-3" />} {label}
      </p>
      <p className={cn('text-sm font-bold', TONE_TEXT_CLASS[tone])}>{value}</p>
    </div>
  );
}

function LocationCard({
  title, address, validation, rawEvent, onCopy,
}: {
  title: string;
  address?: string | null;
  validation?: LocationValidation | null;
  rawEvent?: any;
  onCopy: (text: string) => void;
}) {
  const coords = getCoordsFromEvent(rawEvent);
  const hasAddress = !!address && address !== '-';
  const summary = getLocationSummary(validation);
  const extraBadges = validation?.badges?.slice(1) ?? [];

  return (
    <div className="rounded-lg border border-slate-100 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <div className="min-w-0">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</h4>
            <p className="mt-0.5 break-words text-sm leading-relaxed text-slate-800 dark:text-slate-100">
              {hasAddress ? address : '—'}
            </p>
          </div>
        </div>
        <span className={cn('shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold', TONE_PILL_CLASS[summary.tone === 'default' ? 'gray' : summary.tone])}>
          {summary.label}
        </span>
      </div>

      {validation && (validation.distanceM !== null || validation.radiusM !== null) && (
        <p className="ml-6 mt-2 text-xs text-slate-500 dark:text-slate-400">
          {validation.radiusM !== null && `Radius kantor: ${validation.radiusM} m`}
          {validation.radiusM !== null && validation.distanceM !== null && ' • '}
          {validation.distanceM !== null && `Jarak aktual: ${validation.distanceM} m`}
        </p>
      )}

      {extraBadges.length > 0 && (
        <div className="ml-6 mt-1.5 flex flex-wrap gap-1">
          {extraBadges.map((b) => <Badge key={b} variant="outline" className="text-[10px]">{b}</Badge>)}
        </div>
      )}

      <div className="ml-6 mt-3 flex flex-wrap items-center gap-2">
        {hasAddress && (
          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => onCopy(address!)}>
            <Copy className="h-3 w-3" /> Copy
          </Button>
        )}
        {coords && (
          <a href={`https://www.google.com/maps?q=${coords.lat},${coords.lng}`} target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
              <Navigation className="h-3 w-3" /> Buka Maps
            </Button>
          </a>
        )}
      </div>
    </div>
  );
}

export function AttendanceDetailModal({ isOpen, onClose, onMarkInvalid, onReview, record }: AttendanceDetailModalProps) {
  const { toast } = useToast();
  const [reviewNote, setReviewNote] = useState('');
  const [lightbox, setLightbox] = useState<{ src: string; caption: string } | null>(null);

  // This component stays mounted across opens/closes (the parent always
  // renders <AttendanceDetailModal record={selectedRecord} ... /> and just
  // flips `record` to null), so useState here does NOT reset on its own —
  // without this, closing the modal with the lightbox open left it open in
  // local state, and reopening the modal for a different record made the
  // stale photo preview pop back up immediately.
  useEffect(() => {
    if (!isOpen) {
      setLightbox(null);
      setReviewNote('');
    }
  }, [isOpen]);

  // Lock page scroll while the lightbox is open — the Detail modal itself
  // already gets this from Radix, but the lightbox is a separate body-level
  // portal outside Radix's scroll-lock scope.
  useEffect(() => {
    if (!lightbox) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = original; };
  }, [lightbox]);

  if (!record) return null;

  const openLightbox = (src: string, caption: string) => setLightbox({ src, caption });

  const handleCopy = (text: string) => {
    if (!text || text === '-') return;
    navigator.clipboard.writeText(text);
    toast({ title: 'Alamat disalin', description: 'Alamat sudah disalin ke clipboard' });
  };

  const firstName = record.name?.trim().split(/\s+/)[0] || 'Karyawan';

  // Lateness is read from calculateAttendanceLateStatus's result
  // (record.calculated*), computed once in AttendanceMonitoringClient —
  // never recomputed here from record.lateMinutes/tapIn. record.lateMinutes
  // is kept only as a fallback for any older caller that hasn't been
  // updated to pass the calculated* fields yet.
  const hasCalculatedLateResult = record.calculatedLateMinutes !== undefined;
  const lateMinutesForDisplay = hasCalculatedLateResult ? record.calculatedLateMinutes : (record.lateMinutes ?? null);
  const isLate = hasCalculatedLateResult ? !!record.calculatedIsLate : (record.lateMinutes ?? 0) > 0;
  const isEarlyLeave = (record.earlyLeaveMinutes ?? 0) > 0;
  // siteMissing (no attendance_sites doc matches this brand at all) and
  // dayInactive (site found, but this weekday isn't a working day for it)
  // are kept as two separate labels — collapsing them back into one generic
  // "Jadwal Belum Diatur" is exactly what hid a real site misconfiguration
  // behind what looked like a routine non-working-day state.
  const statusLabel = record.siteMissing
    ? 'Site Belum Diatur'
    : record.dayInactive
      ? 'Hari Nonaktif'
      : isLate ? 'Terlambat' : isEarlyLeave ? 'Pulang Awal' : 'Normal';
  const statusTone: Tone = (record.siteMissing || record.dayInactive) ? 'yellow' : (isLate || isEarlyLeave ? 'red' : 'green');

  const hasTapOut = !!record.tapOut && record.tapOut !== '-';
  const totalJamLabel = record.workDurationMinutes != null
    ? formatDurationMinutes(record.workDurationMinutes)
    : hasTapOut ? '—' : 'Berjalan';

  const locationSummary = getLocationSummary(record.locationValidation);

  if (typeof window !== 'undefined') {
    // eslint-disable-next-line no-console
    console.log('[ATTENDANCE_LATE_CALC_DEBUG]', {
      employeeName: record.name,
      source: 'AttendanceDetailModal',
      tapInTime: record.tapIn,
      matchedSiteName: record.attendanceSiteName ?? null,
      scheduledStartTime: record.scheduledStartTime ?? null,
      lateToleranceMinutes: record.lateToleranceMinutesUsed ?? null,
      latestCheckInWithoutReview: record.latestCheckInWithoutReview ?? null,
      calculatedLateMinutes: record.calculatedLateMinutes ?? null,
      calculatedStatus: record.calculatedAttendanceStatus ?? null,
      siteMissing: !!record.siteMissing,
      dayInactive: !!record.dayInactive,
      storedLateMinutes: record.lateMinutes ?? null,
      storedStatus: record.status,
    });
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="flex h-full max-h-full w-full max-w-full flex-col gap-0 overflow-hidden rounded-none border-slate-200 bg-white p-0 dark:border-slate-800 dark:bg-slate-950 sm:h-[88vh] sm:max-h-[90vh] sm:w-[90vw] sm:max-w-[1200px] sm:rounded-2xl"
        // The lightbox is a separate body-level portal (see Lightbox above),
        // so from Radix's point of view a click or Escape while it's open
        // looks identical to "dismiss this Dialog". Both callbacks below are
        // Radix's documented escape hatch for exactly this situation — while
        // the lightbox is open we preventDefault() so the Detail modal stays
        // open, and let the lightbox's own handlers close just the preview.
        onEscapeKeyDown={(e) => {
          if (lightbox) {
            e.preventDefault();
            setLightbox(null);
          }
        }}
        onPointerDownOutside={(e) => {
          if (lightbox) e.preventDefault();
        }}
      >
        {/* Accessibility Title (Hidden) */}
        <DialogTitle>
          <VisuallyHidden>Detail Absensi {record.name}</VisuallyHidden>
        </DialogTitle>

        {/* Header — sticky */}
        <div className="relative shrink-0 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 sm:px-7 sm:py-5">
          <div className="flex items-start justify-between gap-3 pr-9">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar className="h-11 w-11 shrink-0 sm:h-12 sm:w-12">
                <AvatarFallback className="bg-blue-100 text-sm font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                  {getInitials(record.name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <h2 className="truncate text-base font-bold text-slate-900 dark:text-white sm:text-lg">{record.name}</h2>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">{record.employeeNumber}</p>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">{record.brandName} · {record.divisionName}</p>
              </div>
            </div>
            <Badge className={cn('shrink-0 whitespace-nowrap px-2.5 py-1 text-xs', record.rawEvent?.isInvalid ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' : getStatusColor(record.status))}>
              {record.rawEvent?.isInvalid ? 'Tidak Valid' : record.status}
            </Badge>
          </div>
          <DialogClose asChild>
            <Button variant="ghost" size="icon" className="absolute right-4 top-4 h-8 w-8 rounded-full sm:right-5 sm:top-5" aria-label="Tutup">
              <X className="h-4 w-4" />
            </Button>
          </DialogClose>
        </div>

        {/* Body — the only scrollable region */}
        <div className="flex-1 overflow-y-auto px-5 py-5 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-track]:bg-transparent dark:[&::-webkit-scrollbar-thumb]:bg-slate-700 sm:px-7 sm:py-6">
          <div className="grid grid-cols-1 gap-5 sm:gap-6 lg:grid-cols-[1fr_1.15fr]">

            {/* Kolom kiri — foto & bukti */}
            <div className="space-y-4">
              <PhotoCard label="Foto Tap In" rawEvent={record.rawEventIn} onOpenLightbox={openLightbox} />
              <PhotoCard label="Foto Tap Out" rawEvent={record.rawEventOut} onOpenLightbox={openLightbox} />
              {record.rawConditionReportIn && (
                <ConditionPhotoTile type="check_in" report={record.rawConditionReportIn} onOpenLightbox={openLightbox} />
              )}
              {record.rawConditionReportOut && (
                <ConditionPhotoTile type="check_out" report={record.rawConditionReportOut} onOpenLightbox={openLightbox} />
              )}
            </div>

            {/* Kolom kanan — ringkasan, lokasi, kondisi, catatan */}
            <div className="space-y-4">
              {/* Ringkasan Kehadiran */}
              <Card className="border-slate-200 dark:border-slate-800">
                <CardContent className="p-4 sm:p-5">
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Ringkasan Kehadiran</h3>
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                    <StatTile label="Masuk" value={record.tapIn || '—'} icon={LogIn} />
                    <StatTile label="Pulang" value={record.tapOut || '—'} icon={LogOut} />
                    <StatTile label="Total Jam" value={totalJamLabel} icon={Clock} />
                    <StatTile label="Status" value={statusLabel} tone={statusTone} />
                    <StatTile
                      label="Keterlambatan"
                      value={record.siteMissing ? 'Site belum diatur' : record.dayInactive ? '—' : `${lateMinutesForDisplay ?? 0} menit`}
                      tone={(record.siteMissing || record.dayInactive) ? 'yellow' : (isLate ? 'red' : 'green')}
                    />
                    <StatTile label="Validasi Lokasi" value={locationSummary.label} tone={locationSummary.tone} />
                  </div>
                </CardContent>
              </Card>

              {/* Lokasi */}
              <Card className="border-slate-200 dark:border-slate-800">
                <CardContent className="space-y-3 p-4 sm:p-5">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Lokasi</h3>
                  <LocationCard
                    title="Lokasi Tap In"
                    address={record.addressIn || record.address}
                    validation={record.locationValidation}
                    rawEvent={record.rawEventIn}
                    onCopy={handleCopy}
                  />
                  {hasTapOut && (
                    <LocationCard
                      title="Lokasi Tap Out"
                      address={record.addressOut}
                      validation={record.locationValidationOut}
                      rawEvent={record.rawEventOut}
                      onCopy={handleCopy}
                    />
                  )}
                </CardContent>
              </Card>

              {/* Kondisi Saat Masuk / Kondisi Saat Pulang — two fully independent
                  reports (attendance_condition_reports), each rendered only if it
                  actually exists. Never merged into one generic "Laporan Kondisi
                  Khusus" card, and a missing side never falls back to the other. */}
              {record.rawConditionReportIn && (
                <ConditionReportCard type="check_in" report={record.rawConditionReportIn} />
              )}
              {record.rawConditionReportOut && (
                <ConditionReportCard type="check_out" report={record.rawConditionReportOut} />
              )}

              {/* Keputusan HRD (jika sudah direview) */}
              {record.hrdReviewStatus && (
                <Card className="border-slate-200 dark:border-slate-800">
                  <CardContent className="p-4 sm:p-5">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Catatan HRD Sebelumnya</h3>
                    <Badge className="mb-2">{HRD_REVIEW_LABEL[record.hrdReviewStatus] ?? record.hrdReviewStatus}</Badge>
                    {record.hrdReviewNote && (
                      <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{record.hrdReviewNote}</p>
                    )}
                    {record.hrdReviewedByName && (
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">oleh {record.hrdReviewedByName}</p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Data Identitas */}
              <Card className="border-slate-200 dark:border-slate-800">
                <CardContent className="p-4 sm:p-5">
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Data Identitas</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="mb-0.5 text-xs font-medium text-slate-600 dark:text-slate-400">Brand</p>
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{record.brandName}</p>
                    </div>
                    <div>
                      <p className="mb-0.5 text-xs font-medium text-slate-600 dark:text-slate-400">Divisi</p>
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{record.divisionName}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="mb-0.5 text-xs font-medium text-slate-600 dark:text-slate-400">Metode</p>
                      <Badge variant="outline" className="text-xs">
                        {record.attendanceMethod === 'web_absen' ? 'Web Absen' : 'ID Card'}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Catatan HRD — absensi sudah dihitung terlepas dari catatan ini; ini bukan approval */}
              {onReview && (
                <Card className="border-slate-200 dark:border-slate-800">
                  <CardContent className="space-y-3 p-4 sm:p-5">
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Catatan HRD</h3>
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">Catatan ini hanya untuk dokumentasi HRD. Absensi tetap dihitung tanpa perlu persetujuan.</p>
                    </div>
                    <Textarea
                      placeholder="Catatan (opsional)..."
                      value={reviewNote}
                      onChange={(e) => setReviewNote(e.target.value)}
                      className="min-h-[70px] text-sm"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
                        onClick={() => {
                          const note = reviewNote.trim() || `Terima kasih, ${firstName}. Laporan sudah diterima HRD.`;
                          onReview('acknowledged', note);
                        }}
                      >
                        <CheckCircle2 className="h-4 w-4" /> Terima Kasih, {firstName}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setReviewNote('')}>
                        Batalin
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>

        {/* Footer — sticky */}
        <div className="flex shrink-0 flex-col gap-2 border-t border-slate-200 bg-white px-5 py-3.5 dark:border-slate-800 dark:bg-slate-950 sm:flex-row sm:items-center sm:justify-between sm:px-7 sm:py-4">
          <div className="flex flex-wrap gap-2">
            {onMarkInvalid && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-900/20"
                onClick={() => { onClose(); setTimeout(() => onMarkInvalid?.(), 100); }}
              >
                <ShieldAlert className="h-4 w-4" />
                Tandai Tidak Valid
              </Button>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Tutup
            </Button>
          </div>
        </div>
      </DialogContent>

      {lightbox && (
        <Lightbox src={lightbox.src} caption={lightbox.caption} />
      )}
    </Dialog>
  );
}
