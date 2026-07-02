'use client';

import { useMemo, useState } from 'react';
import {
  ToggleLeft, Database, HardDrive, Users, Mail,
  FileText, Lock, Info, AlertTriangle, Wrench,
} from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { useAuth } from '@/providers/auth-provider';
import { useFirestore } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { useMaintenanceRules } from '@/hooks/useMaintenance';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { MENU_CONFIG } from '@/lib/menu-config';
import { cn } from '@/lib/utils';
import {
  FEATURE_KEYS, FEATURE_DEFAULTS, initializeFeatureConfig, toggleFeature, useFeatureFlags,
  type FeatureKey, type FeatureRiskLevel,
} from '@/lib/feature-flags';

const FEATURE_ICONS: Record<FeatureKey, typeof Database> = {
  backup_auto: Database,
  google_drive_backup: HardDrive,
  candidate_portal: Users,
  employee_invite: Mail,
  offering_letter: FileText,
  maintenance_lock: Lock,
};

const FEATURE_COLORS: Record<FeatureKey, { color: string; bg: string; border: string }> = {
  backup_auto: { color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
  google_drive_backup: { color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
  candidate_portal: { color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-100' },
  employee_invite: { color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
  offering_letter: { color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-100' },
  maintenance_lock: { color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100' },
};

const RISK_BADGE: Record<FeatureRiskLevel, { label: string; cls: string }> = {
  low: { label: 'Risiko Rendah', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  medium: { label: 'Risiko Sedang', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  high: { label: 'Risiko Tinggi', cls: 'bg-red-50 text-red-700 border-red-200' },
};

function formatDateTime(ts: any): string | null {
  if (!ts) return null;
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  if (Number.isNaN(d?.getTime?.())) return null;
  return d.toLocaleString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta',
  }) + ' WIB';
}

function FeatureControlContent() {
  const firestore = useFirestore();
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const { config, loading, isEnabled } = useFeatureFlags(firestore);
  const { rules: maintenanceRules } = useMaintenanceRules();
  const [initializing, setInitializing] = useState(false);
  const [pendingKey, setPendingKey] = useState<FeatureKey | null>(null);
  const [confirmKey, setConfirmKey] = useState<FeatureKey | null>(null);

  const actorUid = userProfile?.uid ?? '';
  const actorName = userProfile?.fullName ?? userProfile?.email ?? 'Super Admin';

  const hasActiveMaintenance = useMemo(
    () => maintenanceRules.some((r) => r.enabled === true),
    [maintenanceRules],
  );

  const handleInitialize = async () => {
    setInitializing(true);
    try {
      await initializeFeatureConfig(firestore, actorUid, actorName);
      toast({ title: 'Feature Config diinisialisasi', description: 'Semua fitur diisi dengan nilai default.' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Gagal inisialisasi', description: err?.message ?? 'Terjadi kesalahan.' });
    } finally {
      setInitializing(false);
    }
  };

  const applyToggle = async (key: FeatureKey, next: boolean) => {
    setPendingKey(key);
    try {
      await toggleFeature(firestore, key, next, actorUid, actorName, !next);
      toast({
        title: `${FEATURE_DEFAULTS[key].label} ${next ? 'diaktifkan' : 'dinonaktifkan'}`,
      });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Gagal menyimpan', description: err?.message ?? 'Terjadi kesalahan.' });
    } finally {
      setPendingKey(null);
    }
  };

  const handleToggleRequest = (key: FeatureKey, checked: boolean) => {
    // Item 7: never allow turning maintenance_lock OFF while a maintenance is still enabled —
    // that would strand Maintenance Control unable to finish/manage a lock already in effect.
    if (key === 'maintenance_lock' && !checked && hasActiveMaintenance) {
      toast({
        variant: 'destructive',
        title: 'Tidak bisa dimatikan',
        description: 'Selesaikan semua maintenance aktif sebelum mematikan Maintenance Lock.',
      });
      return;
    }

    const risk = FEATURE_DEFAULTS[key].riskLevel;
    if (risk === 'high' && !checked) {
      setConfirmKey(key);
      return;
    }
    applyToggle(key, checked);
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURE_KEYS.map((k) => <Skeleton key={k} className="h-48 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50">
          <ToggleLeft className="h-5 w-5 text-violet-600" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">Feature Control</h1>
            <Badge variant="outline" className="border-purple-200 bg-purple-50 text-purple-700 text-[10px] font-semibold uppercase tracking-wide">
              Super Admin Only
            </Badge>
          </div>
          <p className="text-sm text-slate-500">
            Saklar fitur utama HRP — mati/nyala di sini benar-benar mengunci tombol, menu, dan API terkait.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <p className="text-sm text-slate-600">
          Feature Control ≠ Maintenance Control ≠ Access &amp; Roles ≠ Pengumuman Sistem. Feature Control adalah
          saklar ON/OFF fitur; Maintenance Control mengunci akses role/modul; Access &amp; Roles mengatur menu per
          role; Pengumuman Sistem hanya informasi.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURE_KEYS.map((key) => {
          const flag = config[key];
          const isConfigured = !!flag;
          const enabled = isEnabled(key);
          const meta = FEATURE_DEFAULTS[key];
          const Icon = FEATURE_ICONS[key];
          const colors = FEATURE_COLORS[key];
          const riskBadge = RISK_BADGE[meta.riskLevel];
          const updatedAt = formatDateTime(flag?.updatedAt);
          const busy = pendingKey === key;

          return (
            <Card key={key} className={cn('border shadow-sm', colors.border)}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', colors.bg)}>
                    <Icon className={cn('h-4 w-4', colors.color)} />
                  </div>
                  <Badge variant="outline" className={cn('text-[10px] font-semibold shrink-0', riskBadge.cls)}>
                    {riskBadge.label}
                  </Badge>
                </div>
                <p className="mt-3 text-sm font-semibold text-slate-800">{meta.label}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">{meta.description}</p>

                {isConfigured ? (
                  <>
                    <div className="mt-4 flex items-center justify-between">
                      <span className={cn('text-[11px] font-medium', enabled ? 'text-emerald-600' : 'text-slate-400')}>
                        {enabled ? 'Aktif' : 'Nonaktif'}
                      </span>
                      <Switch checked={enabled} disabled={busy} onCheckedChange={(checked) => handleToggleRequest(key, checked)} />
                    </div>
                    <p className="mt-2 text-[11px] text-slate-400">
                      Diubah oleh {flag?.updatedByName ?? '—'}{updatedAt ? ` · ${updatedAt}` : ''}
                    </p>
                  </>
                ) : (
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">Belum dikonfigurasi</span>
                    <div className="h-5 w-9 rounded-full border border-slate-200 bg-slate-100" title="Belum dikonfigurasi" />
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {FEATURE_KEYS.some((k) => !config[k]) && (
        <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-800">
            Sebagian fitur belum dikonfigurasi di <code className="rounded bg-white px-1 text-[12px]">system_settings/features</code>.
          </p>
          <Button size="sm" onClick={handleInitialize} disabled={initializing} className="gap-1.5 bg-amber-600 text-white hover:bg-amber-700">
            <Wrench className="h-3.5 w-3.5" /> Inisialisasi Feature Config
          </Button>
        </div>
      )}

      <p className="text-center text-xs text-slate-400">
        Perubahan fitur direkam di audit_logs. Fitur dengan risiko tinggi memerlukan konfirmasi sebelum dimatikan.
      </p>

      <AlertDialog open={!!confirmKey} onOpenChange={(open) => !open && setConfirmKey(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600" /> Fitur Berisiko Tinggi
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmKey === 'maintenance_lock'
                ? 'Fitur ini berisiko tinggi. Jika dimatikan, Super Admin tidak bisa menggunakan Maintenance Control untuk mengunci akses role. Lanjutkan?'
                : `Fitur "${confirmKey ? FEATURE_DEFAULTS[confirmKey].label : ''}" berisiko tinggi. Menonaktifkannya dapat memengaruhi modul terkait. Lanjutkan?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmKey(null)}>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (confirmKey) applyToggle(confirmKey, false);
                setConfirmKey(null);
              }}
            >
              Ya, Matikan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function FeatureControlPage() {
  const hasAccess = useRoleGuard('super-admin');
  const menuConfig = useMemo(() => MENU_CONFIG['super-admin'] || [], []);

  if (!hasAccess) {
    return (
      <div className="flex h-screen w-full items-center justify-center p-4">
        <Skeleton className="h-[400px] w-full max-w-6xl" />
      </div>
    );
  }

  return (
    <DashboardLayout pageTitle="Feature Control" menuConfig={menuConfig}>
      <FeatureControlContent />
    </DashboardLayout>
  );
}
