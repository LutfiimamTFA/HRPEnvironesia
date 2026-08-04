'use client';

import { Eye, X } from 'lucide-react';
import { usePreviewRole } from '@/providers/preview-role-provider';

const ROLE_LABELS: Record<string, string> = {
  hrd: 'HRD',
  manager: 'Manager',
  karyawan: 'Karyawan',
  kandidat: 'Kandidat',
};

export function PreviewModeBanner() {
  const { isPreviewMode, previewRole, exitPreview } = usePreviewRole();

  if (!isPreviewMode || !previewRole) return null;

  const label = (ROLE_LABELS[previewRole] ?? previewRole).toUpperCase();

  return (
    <div className="sticky top-0 z-[70] flex items-center justify-center gap-3 bg-amber-500 px-4 py-2 text-sm font-semibold text-amber-950 shadow-md">
      <Eye className="h-4 w-4 shrink-0" />
      <span>
        PREVIEW MODE: {label} — hanya Super Admin yang bisa melihat ini. Data dan tampilan disimulasikan, aksi sensitif tetap memerlukan konfirmasi.
      </span>
      <button
        type="button"
        onClick={exitPreview}
        className="ml-2 flex items-center gap-1 rounded-md bg-amber-950/10 px-2 py-1 text-xs font-bold hover:bg-amber-950/20"
      >
        <X className="h-3.5 w-3.5" /> Keluar Preview Mode
      </button>
    </div>
  );
}
