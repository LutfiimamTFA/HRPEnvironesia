'use client';

import { useCallback } from 'react';
import { usePreviewRole } from '@/providers/preview-role-provider';

/**
 * Wrap approve/reject/delete/send handlers with this so that, while a Super
 * Admin is in Preview Mode, the action requires an explicit extra confirmation
 * before running — since Preview Mode simulates another role's UI but still
 * runs on the Super Admin's real, privileged account.
 */
export function useDangerousActionGuard() {
  const { isPreviewMode, previewRole } = usePreviewRole();

  const guard = useCallback(
    <T extends (...args: any[]) => any>(action: T, label = 'aksi ini'): T => {
      if (!isPreviewMode) return action;
      return ((...args: Parameters<T>) => {
        const confirmed = window.confirm(
          `PREVIEW MODE (${previewRole}): Anda login sebagai Super Admin dan sedang menjalankan ${label}. ` +
            'Aksi ini akan benar-benar dieksekusi menggunakan akun Super Admin. Lanjutkan?',
        );
        if (!confirmed) return undefined;
        return action(...args);
      }) as T;
    },
    [isPreviewMode, previewRole],
  );

  return { guard, isPreviewMode, previewRole };
}
