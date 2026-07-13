'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';
import { Copy, X, AlertCircle, RotateCw, ShieldAlert, HeartPulse, CheckCircle2, XCircle, RefreshCw, ShieldCheck, FileText } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { getAttendanceImageUrl, getConditionProofImageSrc } from '@/lib/google-drive-image';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Textarea } from '@/components/ui/textarea';
import type { LocationValidation } from '@/lib/attendance-helpers';

interface AttendanceDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMarkInvalid?: () => void;
  onReview?: (status: 'approved' | 'rejected' | 'revision_requested' | 'valid_auto' | 'needs_review', note: string) => void;
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
    earlyLeaveMinutes?: number | null;
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
    /** The matching attendance_condition_reports doc — the ONLY source for the condition proof photo. */
    conditionReport?: any | null;
    rawConditionReport?: any | null;
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

/** Tap-in and tap-out photos are recorded and shown separately — each has its own load/reload state. */
function PhotoEvidenceBlock({ label, rawEvent }: { label: string; rawEvent?: any }) {
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

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-800 dark:text-white mb-2">{label}</h3>
      {hasPhoto ? (
        <div className="relative bg-slate-50 dark:bg-slate-800 rounded-lg overflow-hidden flex items-center justify-center max-h-[280px] border border-slate-200 dark:border-slate-700 p-2">
          {!imageError ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`photo-${reloadCount}`}
              src={imageUrl}
              alt={label}
              className="w-full max-h-[280px] object-contain rounded"
              onError={() => setImageError(true)}
              loading="lazy"
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 p-4 text-center">
              <AlertCircle className="h-8 w-8 text-slate-400" />
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300">Foto tidak bisa dimuat</p>
              <Button variant="outline" size="sm" onClick={() => { setImageError(false); setReloadCount((p) => p + 1); }} className="gap-1.5 h-7 text-xs">
                <RotateCw className="h-3.5 w-3.5" /> Muat Ulang
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-slate-50 dark:bg-slate-900/20 rounded-lg p-5 text-center border border-slate-200 dark:border-slate-700">
          <Badge variant="outline" className="mb-1.5 text-xs">
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
  );
}

/**
 * Kondisi-khusus evidence preview — separate from the tap-in/tap-out photo
 * shown elsewhere in this modal. `src` is expected to already be either a
 * direct-servable URL or an /api/attendance-photo?fileId=... proxy link
 * (never a raw Google Drive webViewLink/share URL — those require the
 * viewer to be signed into the same Google account and silently fail in an
 * <img> tag, which is why photos kept showing "Buka File" before).
 *
 * Always renders the <img> — never a file-card by default. Only if the
 * <img> itself fails to load does a small, secondary fallback line appear;
 * there is deliberately no prominent "Buka File" button as the primary UI.
 */
function ConditionProofPreview({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="mt-3 space-y-1">
        <p className="text-xs text-slate-500 dark:text-slate-400">Foto sedang diproses atau tidak dapat dimuat.</p>
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-medium text-purple-600 dark:text-purple-400 hover:underline"
        >
          Lihat file asli
        </a>
      </div>
    );
  }

  return (
    <a href={src} target="_blank" rel="noreferrer" className="block mt-3">
      <img
        src={src}
        alt="Bukti kondisi"
        onError={() => setFailed(true)}
        className="w-full max-h-[260px] rounded-[10px] border border-slate-200 dark:border-slate-700 bg-white object-contain cursor-zoom-in"
      />
    </a>
  );
}

/** True only when the report explicitly declares a non-image mimeType — unknown/missing mimeType still tries to render as a photo (Drive/Storage URLs often carry no mimeType at all). */
function isExplicitlyNonImage(report: any): boolean {
  const mimeType: string | undefined = report?.mimeType || report?.attachments?.[0]?.mimeType;
  return !!mimeType && !mimeType.startsWith('image/');
}

export function AttendanceDetailModal({ isOpen, onClose, onMarkInvalid, onReview, record }: AttendanceDetailModalProps) {
  const { toast } = useToast();
  const [reviewNote, setReviewNote] = useState('');

  if (!record) return null;

  const handleCopyAddress = () => {
    if (record.address && record.address !== '-') {
      navigator.clipboard.writeText(record.address);
      toast({
        title: 'Alamat disalin',
        description: 'Alamat sudah disalin ke clipboard',
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Accessibility Title (Hidden) */}
        <DialogTitle>
          <VisuallyHidden>Detail Absensi {record.name}</VisuallyHidden>
        </DialogTitle>

        {/* Header */}
        <DialogHeader className="pb-3 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Avatar className="h-10 w-10 shrink-0">
                <AvatarFallback className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-semibold text-sm">
                  {getInitials(record.name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-bold text-slate-800 dark:text-white truncate">{record.name}</h2>
                <p className="text-xs text-slate-600 dark:text-slate-400">{record.employeeNumber}</p>
              </div>
            </div>
            <Badge className={`${record.rawEvent?.isInvalid ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' : getStatusColor(record.status)} text-xs px-2 py-0.5 whitespace-nowrap shrink-0`}>
              {record.rawEvent?.isInvalid ? 'Tidak Valid' : record.status}
            </Badge>
          </div>
          <DialogClose className="absolute right-4 top-4" asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
            </Button>
          </DialogClose>
        </DialogHeader>

        {/* Main Content */}
        <div className="space-y-5 py-4">
          {/* A. Foto Bukti Absensi — masuk dan pulang direkam & ditampilkan terpisah */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <PhotoEvidenceBlock label="Foto Tap In" rawEvent={record.rawEventIn} />
            <PhotoEvidenceBlock label="Foto Tap Out" rawEvent={record.rawEventOut} />
          </div>

          {/* B. Ringkasan Absensi */}
          <Card className="border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/20">
            <CardContent className="pt-4">
              <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-3">Ringkasan Kehadiran</h3>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mb-1">Masuk</p>
                  <p className="text-lg font-bold text-slate-800 dark:text-white">
                    {record.tapIn || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mb-1">Pulang</p>
                  <p className="text-lg font-bold text-slate-800 dark:text-white">
                    {record.tapOut || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mb-1">Status</p>
                  <div className="flex flex-wrap gap-1">
                    {record.lateMinutes && record.lateMinutes > 0 && (
                      <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 text-xs py-0">
                        Terlambat {record.lateMinutes}m
                      </Badge>
                    )}
                    {record.earlyLeaveMinutes && record.earlyLeaveMinutes > 0 && (
                      <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 text-xs py-0">
                        Pulang Awal {record.earlyLeaveMinutes}m
                      </Badge>
                    )}
                    {(!record.lateMinutes || record.lateMinutes <= 0) &&
                     (!record.earlyLeaveMinutes || record.earlyLeaveMinutes <= 0) && (
                      <span className="text-xs text-slate-600 dark:text-slate-400">Normal</span>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* C. Lokasi — masuk dan pulang terpisah, dengan jarak/radius/selisih. Ini catatan, bukan penghalang absen. */}
          <Card className="border-slate-200 dark:border-slate-700">
            <CardContent className="pt-4 space-y-4">
              <div>
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1">Lokasi Tap In</h3>
                    <p className="text-sm text-slate-800 dark:text-slate-100 leading-relaxed break-words">
                      {record.addressIn || record.address || '—'}
                    </p>
                  </div>
                  {(record.addressIn || record.address) && (record.addressIn || record.address) !== '-' && (
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0" onClick={handleCopyAddress} title="Salin alamat">
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                {record.locationValidation && (
                  <>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {record.locationValidation.badges.map((b) => (
                        <Badge key={b} variant="outline" className="text-xs">{b}</Badge>
                      ))}
                    </div>
                    {record.locationValidation.distanceM !== null && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                        Jarak dari kantor: {record.locationValidation.distanceM} m
                        {record.locationValidation.radiusM !== null && ` • Radius ditetapkan: ${record.locationValidation.radiusM} m`}
                        {record.locationValidation.excessM !== null && record.locationValidation.excessM > 0 && ` • Selisih: +${record.locationValidation.excessM} m`}
                      </p>
                    )}
                  </>
                )}
              </div>

              {record.tapOut && record.tapOut !== '-' && (
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                  <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1">Lokasi Tap Out</h3>
                  <p className="text-sm text-slate-800 dark:text-slate-100 leading-relaxed break-words">
                    {record.addressOut || '—'}
                  </p>
                  {record.locationValidationOut && (
                    <>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {record.locationValidationOut.badges.map((b) => (
                          <Badge key={`out-${b}`} variant="outline" className="text-xs">{b}</Badge>
                        ))}
                      </div>
                      {record.locationValidationOut.distanceM !== null && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                          Jarak dari kantor: {record.locationValidationOut.distanceM} m
                          {record.locationValidationOut.radiusM !== null && ` • Radius ditetapkan: ${record.locationValidationOut.radiusM} m`}
                          {record.locationValidationOut.excessM !== null && record.locationValidationOut.excessM > 0 && ` • Selisih: +${record.locationValidationOut.excessM} m`}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Kondisi Khusus */}
          {record.specialCondition && (() => {
            // The condition report's proof photo lives ONLY in the joined
            // attendance_condition_reports doc (record.rawConditionReport,
            // joined in AttendanceMonitoringClient by uid+date/linkedId) — it
            // must never fall back to rawEvent/rawEventIn/rawEventOut, since
            // those are the tap-in/tap-out event and reading photo fields off
            // them is exactly what caused the condition photo to show the
            // Foto Tap In photo before.
            const report = record.rawConditionReport || record.conditionReport || null;
            const tapInPhotoUrl = record.rawEventIn ? getAttendanceImageUrl(record.rawEventIn) : null;
            const tapOutPhotoUrl = record.rawEventOut ? getAttendanceImageUrl(record.rawEventOut) : null;
            const conditionProofUrl = report ? getConditionProofImageSrc(report) : null;
            const nonImageFile = report ? isExplicitlyNonImage(report) : false;

            console.log('[HRP_CONDITION_MODAL_DEBUG]', {
              specialCondition: record.specialCondition,
              rawConditionReport: record.rawConditionReport,
              conditionProofUrl,
              tapInPhotoUrl,
            });

            const imageSrc = conditionProofUrl;

            return (
              <Card className="border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/10">
                <CardContent className="pt-4">
                  <h3 className="text-xs font-semibold text-purple-700 dark:text-purple-300 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <HeartPulse className="h-3.5 w-3.5" /> Laporan Kondisi Khusus
                  </h3>
                  <p className="text-sm text-slate-800 dark:text-slate-100">{record.specialCondition}</p>

                  {imageSrc && !nonImageFile ? (
                    <ConditionProofPreview src={imageSrc} />
                  ) : imageSrc && nonImageFile ? (
                    <a
                      href={imageSrc}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 flex items-center gap-2 rounded-lg border border-purple-200 dark:border-purple-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors w-fit"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      {report?.attachments?.[0]?.fileName || 'Buka File'}
                    </a>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 italic">
                      Tidak ada bukti foto kondisi yang diunggah.
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          {/* Keputusan HRD (jika sudah direview) */}
          {record.hrdReviewStatus && (
            <Card className="border-slate-200 dark:border-slate-700">
              <CardContent className="pt-4">
                <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-2">Catatan HRD Sebelumnya</h3>
                <Badge className="mb-2">{HRD_REVIEW_LABEL[record.hrdReviewStatus] ?? record.hrdReviewStatus}</Badge>
                {record.hrdReviewNote && (
                  <p className="text-sm text-slate-700 dark:text-slate-300 mt-1">{record.hrdReviewNote}</p>
                )}
                {record.hrdReviewedByName && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">oleh {record.hrdReviewedByName}</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* D. Identitas */}
          <Card className="border-slate-200 dark:border-slate-700">
            <CardContent className="pt-4">
              <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-3">Data Identitas</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mb-0.5">Brand</p>
                  <p className="text-sm text-slate-800 dark:text-slate-100 font-medium">
                    {record.brandName}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mb-0.5">Divisi</p>
                  <p className="text-sm text-slate-800 dark:text-slate-100 font-medium">
                    {record.divisionName}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mb-0.5">Metode</p>
                  <Badge variant="outline" className="text-xs">
                    {record.attendanceMethod === 'web_absen' ? 'Web Absen' : 'ID Card'}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Catatan HRD — absensi sudah dihitung terlepas dari catatan ini; ini bukan approval */}
          {onReview && (
            <Card className="border-slate-200 dark:border-slate-700">
              <CardContent className="pt-4 space-y-3">
                <div>
                  <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Catatan HRD</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Absensi tetap dihitung. Catatan ini hanya untuk keperluan HRD, bukan persetujuan.</p>
                </div>
                <Textarea
                  placeholder="Catatan (opsional)..."
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  className="text-sm min-h-[70px]"
                />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onReview('needs_review', reviewNote)}>
                    <ShieldCheck className="h-4 w-4" /> Tambah Catatan
                  </Button>
                  <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white" onClick={() => onReview('approved', reviewNote)}>
                    <CheckCircle2 className="h-4 w-4" /> Tandai Sudah Dicek
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5 text-purple-700 border-purple-200 hover:bg-purple-50 dark:text-purple-400 dark:border-purple-800" onClick={() => onReview('revision_requested', reviewNote)}>
                    <RefreshCw className="h-4 w-4" /> Minta Klarifikasi
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5 text-slate-600 border-slate-200 hover:bg-slate-50 dark:text-slate-400 dark:border-slate-800" onClick={() => onReview('rejected', reviewNote)}>
                    <XCircle className="h-4 w-4" /> Abaikan Catatan
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-200 dark:border-slate-700 flex gap-2">
          {onMarkInvalid && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-900/20"
              onClick={() => { onClose(); setTimeout(() => onMarkInvalid?.(), 100); }}
            >
              <ShieldAlert className="h-4 w-4" />
              Tandai Tidak Valid
            </Button>
          )}
          <Button variant="outline" size="sm" className="flex-1" onClick={onClose}>
            Tutup
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
