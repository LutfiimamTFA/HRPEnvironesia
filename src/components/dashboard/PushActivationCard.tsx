'use client';

import { useEffect, useState } from 'react';
import { doc } from 'firebase/firestore';
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { Button } from '@/components/ui/button';
import { BellRing, Loader2, Send, Timer } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  enablePushForDevice,
  disableDevice,
  sendTestPush,
  scheduleTestPush,
  getCurrentDeviceId,
  isIosDevice,
  isStandalonePwa,
} from '@/lib/push-notifications';

/** Status card pinned to the top of the notification bell dropdown — lets the user turn on/off Web Push for *this* device, and run real delivery tests. All diagnostic detail (permission, service worker state, token, delivery status, messageId) is intentionally console-only — never rendered — see handleSendNow/handleScheduleTen below. */
export function PushActivationCard({ uid }: { uid: string }) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [deviceId, setDeviceId] = useState<string | null | undefined>(undefined); // undefined = still resolving
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCurrentDeviceId().then((id) => { if (!cancelled) setDeviceId(id); });
    return () => { cancelled = true; };
  }, []);

  const deviceRef = useMemoFirebase(
    () => (deviceId ? doc(firestore, 'push_subscriptions', uid, 'devices', deviceId) : null),
    [firestore, uid, deviceId],
  );
  const { data: deviceDoc, mutate } = useDoc<any>(deviceRef);

  const isActive = !!deviceId && deviceDoc?.enabled === true;
  // Server marked this exact device's token invalid/expired — the browser
  // still has a cached deviceId, but the doc says otherwise.
  const needsReactivation = !!deviceId && !!deviceDoc && deviceDoc.enabled === false;

  const refreshDeviceId = async () => {
    const id = await getCurrentDeviceId();
    setDeviceId(id);
  };

  const handleEnable = async () => {
    setBusy('enable');
    const result = await enablePushForDevice(firestore, uid);
    setBusy(null);
    if (result.ok) {
      await refreshDeviceId();
      mutate?.();
      toast({ title: 'Notifikasi Perangkat Aktif', description: 'Perangkat ini akan menerima notifikasi HRP Environesia meskipun tab ditutup.' });
    } else {
      toast({ variant: 'destructive', title: 'Gagal mengaktifkan', description: result.message });
    }
  };

  const handleDisable = async () => {
    if (!deviceId) return;
    setBusy('disable');
    try {
      await disableDevice(firestore, uid, deviceId);
      mutate?.();
      toast({ title: 'Notifikasi Perangkat Dinonaktifkan' });
    } finally {
      setBusy(null);
    }
  };

  const handleSendNow = async () => {
    if (!deviceId) return;
    setBusy('now');
    try {
      const result = await sendTestPush(deviceId);
      // Toast is never the proof by itself — only a real FCM messageId is.
      // The full id still goes to console for debugging; the card only ever
      // shows a short, non-technical confirmation.
      if (result.success && result.messageId) {
        console.info('[push] Kirim Sekarang — messageId:', result.messageId);
        toast({ title: 'Notifikasi terkirim', description: 'Periksa perangkat Anda.' });
      } else {
        console.error('[push] Kirim Sekarang gagal:', result);
        toast({ variant: 'destructive', title: 'Gagal mengirim', description: !result.success ? result.message : 'Pengiriman tidak dapat dikonfirmasi.' });
      }
      mutate?.();
    } finally {
      setBusy(null);
    }
  };

  const handleScheduleTen = async () => {
    if (!deviceId) return;
    setBusy('schedule');
    try {
      const result = await scheduleTestPush(deviceId, 10);
      if (result.success) {
        toast({ title: 'Notifikasi dijadwalkan', description: 'Akan terkirim dalam 10 detik.' });
      } else {
        console.error('[push] Kirim dalam 10 Detik gagal:', result);
        toast({ variant: 'destructive', title: 'Gagal menjadwalkan', description: result.message });
      }
    } finally {
      setBusy(null);
      // Re-check the device doc once the server-side timer would have fired —
      // if the token turned out invalid, this flips the card to "Perlu Diaktifkan Ulang".
      setTimeout(() => mutate?.(), 11000);
    }
  };

  const showIosHint = isIosDevice() && !isStandalonePwa();

  const title = isActive
    ? 'Notifikasi Perangkat Aktif'
    : needsReactivation
      ? 'Notifikasi Perangkat Perlu Diaktifkan Ulang'
      : 'Notifikasi Perangkat Belum Aktif';

  const description = isActive
    ? 'Perangkat ini dapat menerima notifikasi HRP.'
    : needsReactivation
      ? 'Token perangkat ini sudah tidak berlaku — aktifkan ulang untuk melanjutkan.'
      : showIosHint
        ? 'Di iPhone, tambahkan HRP ke Home Screen agar notifikasi bisa diterima.'
        : 'Dapatkan notifikasi meskipun HRP ditutup atau Anda logout.';

  return (
    <div className="mx-4 mt-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3.5 shadow-sm">
      <div className="flex items-start gap-2.5">
        <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${isActive ? 'bg-teal-50 dark:bg-teal-900/30' : 'bg-slate-100 dark:bg-slate-800'}`}>
          <BellRing className={`h-3.5 w-3.5 ${isActive ? 'text-teal-600 dark:text-teal-400' : 'text-slate-400'}`} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>

          <div className="mt-3 flex flex-col gap-1.5">
            {!isActive ? (
              <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={busy === 'enable' || deviceId === undefined} onClick={handleEnable}>
                {busy === 'enable' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BellRing className="h-3.5 w-3.5" />}
                Aktifkan Notifikasi
              </Button>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-1.5">
                  <Button size="sm" variant="secondary" className="h-8 gap-1.5 text-xs font-medium" disabled={!!busy} onClick={handleSendNow}>
                    {busy === 'now' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Kirim Sekarang
                  </Button>
                  <Button size="sm" variant="secondary" className="h-8 gap-1.5 text-xs font-medium" disabled={!!busy} onClick={handleScheduleTen}>
                    {busy === 'schedule' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Timer className="h-3.5 w-3.5" />}
                    Kirim 10 Detik
                  </Button>
                </div>
                <Button size="sm" variant="ghost" className="h-7 self-start px-2 text-xs font-normal text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={!!busy} onClick={handleDisable}>
                  Nonaktifkan
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
