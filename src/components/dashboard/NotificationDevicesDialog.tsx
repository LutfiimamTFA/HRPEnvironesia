'use client';

import { useState } from 'react';
import { collection } from 'firebase/firestore';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bell, Smartphone, Loader2, Send, Ban, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  enablePushForDevice,
  disableDevice,
  disableAllDevices,
  sendTestPush,
  isIosDevice,
  isStandalonePwa,
} from '@/lib/push-notifications';

interface NotificationDevicesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  uid: string;
}

export function NotificationDevicesDialog({ isOpen, onClose, uid }: NotificationDevicesDialogProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const devicesQuery = useMemoFirebase(
    () => (uid ? collection(firestore, 'push_subscriptions', uid, 'devices') : null),
    [firestore, uid],
  );
  const { data: devices, isLoading, mutate } = useCollection<any>(devicesQuery);

  const activeDevices = (devices || []).filter((d) => d.isActive);
  const inactiveDevices = (devices || []).filter((d) => !d.isActive);

  const handleEnable = async () => {
    setBusy('enable');
    const result = await enablePushForDevice(firestore, uid);
    setBusy(null);
    if (result.ok) {
      toast({ title: 'Notifikasi perangkat aktif', description: 'Perangkat ini sekarang akan menerima notifikasi HRP Environesia.' });
      mutate?.();
    } else {
      toast({ variant: 'destructive', title: 'Tidak dapat mengaktifkan notifikasi', description: result.message });
    }
  };

  const handleDisable = async (deviceId: string) => {
    setBusy(deviceId);
    try {
      await disableDevice(firestore, uid, deviceId);
      toast({ title: 'Perangkat dinonaktifkan' });
      mutate?.();
    } finally {
      setBusy(null);
    }
  };

  const handleDisableAll = async () => {
    setBusy('disable-all');
    try {
      await disableAllDevices(firestore, uid);
      toast({ title: 'Semua perangkat dinonaktifkan' });
      mutate?.();
    } finally {
      setBusy(null);
    }
  };

  const handleTest = async (deviceId: string) => {
    setBusy(`test-${deviceId}`);
    try {
      const result = await sendTestPush(deviceId);
      // Only .messageId from FCM counts as proof — never trust a bare success flag.
      if (result.success && result.messageId) {
        toast({ title: 'Notifikasi tes terkirim', description: `messageId: ${result.messageId}` });
      } else {
        console.error('[push/test] delivery failed:', result);
        toast({ variant: 'destructive', title: 'Gagal mengirim tes', description: !result.success ? result.message : 'Server tidak mengembalikan messageId.' });
        mutate?.();
      }
    } finally {
      setBusy(null);
    }
  };

  const showIosHint = isIosDevice() && !isStandalonePwa();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Bell className="h-4 w-4" /> Perangkat Notifikasi</DialogTitle>
          <DialogDescription>
            Kelola perangkat yang menerima notifikasi HRP Environesia, termasuk saat tab ditutup.
          </DialogDescription>
        </DialogHeader>

        {showIosHint && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300">
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <p>Di iPhone, notifikasi push hanya bisa diterima setelah HRP Environesia ditambahkan ke Home Screen (Bagikan → Tambah ke Layar Utama), lalu dibuka dari ikon tersebut.</p>
          </div>
        )}

        <Button onClick={handleEnable} disabled={busy === 'enable'} className="gap-2">
          {busy === 'enable' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
          Aktifkan Notifikasi Perangkat Ini
        </Button>

        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {isLoading && <p className="text-xs text-slate-500">Memuat perangkat...</p>}
          {!isLoading && (devices?.length ?? 0) === 0 && (
            <p className="text-xs text-slate-500">Belum ada perangkat terdaftar.</p>
          )}

          {activeDevices.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-700 p-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <Smartphone className="h-4 w-4 text-slate-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{d.deviceLabel || 'Perangkat'}</p>
                  <Badge variant="outline" className="text-[10px] mt-0.5">Aktif</Badge>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={busy === `test-${d.id}`} onClick={() => handleTest(d.id)}>
                  {busy === `test-${d.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />} Tes
                </Button>
                <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs text-destructive" disabled={busy === d.id} onClick={() => handleDisable(d.id)}>
                  {busy === d.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Ban className="h-3 w-3" />} Nonaktifkan
                </Button>
              </div>
            </div>
          ))}

          {inactiveDevices.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 dark:border-slate-800 p-2.5 opacity-60">
              <div className="flex items-center gap-2 min-w-0">
                <Smartphone className="h-4 w-4 text-slate-400 shrink-0" />
                <p className="text-sm truncate">{d.deviceLabel || 'Perangkat'}</p>
              </div>
              <Badge variant="outline" className="text-[10px]">Nonaktif</Badge>
            </div>
          ))}
        </div>

        {activeDevices.length > 0 && (
          <Button variant="outline" size="sm" className="gap-2 text-destructive" disabled={busy === 'disable-all'} onClick={handleDisableAll}>
            {busy === 'disable-all' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
            Nonaktifkan Semua Perangkat
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
