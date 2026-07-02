'use client';

import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { useAuth } from '@/providers/auth-provider';

export interface SystemAnnouncement {
  id: string;
  title: string;
  content: string;
  category: string;
  announcementLevel: 'info' | 'warning' | 'maintenance' | 'maintenance_lock';
  targetAllUsers: boolean;
  targetRoles: string[];
  showAsBanner: boolean;
  showAsModal: boolean;
  requireAcknowledgement?: boolean;
  startAt: Timestamp | null;
  endAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

function tsToMs(ts: Timestamp | null | undefined): number | null {
  if (!ts) return null;
  try { return ts.toDate ? ts.toDate().getTime() : (ts as any)._seconds * 1000; }
  catch { return null; }
}

function isTimeActive(a: SystemAnnouncement): boolean {
  const now = Date.now();
  const startMs = tsToMs(a.startAt);
  const endMs = tsToMs(a.endAt); 
  if (startMs !== null && startMs > now) return false;
  if (endMs !== null && endMs < now) return false;
  return true;
}

function isTargetedAt(a: SystemAnnouncement, userRole: string): boolean {
  if (a.targetAllUsers) return true;
  const storedRoles = (a.targetRoles ?? []).map((r: string) => r.toLowerCase().trim());
  return storedRoles.includes(userRole.toLowerCase().trim());
}

// showAsModal defaults to true when the field is missing/undefined
function wantsModal(a: SystemAnnouncement): boolean {
  return a.showAsModal !== false; // undefined → true (modal is the default)
}

export function useSystemAnnouncements() {
  const firestore = useFirestore();
  const { userProfile } = useAuth();
  const [raw, setRaw] = useState<SystemAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);

  const isSuperAdmin = userProfile?.role === 'super-admin';
  const userRole = userProfile?.role ?? '';

  useEffect(() => {
    if (!firestore || !userProfile?.uid) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(firestore, 'system_announcements'),
      where('status', '==', 'active'),
    );

    const unsub = onSnapshot(
      q,
      snap => {
        setRaw(snap.docs.map(d => ({ id: d.id, ...d.data() }) as SystemAnnouncement));
        setLoading(false);
      },
      () => setLoading(false),
    );

    return unsub;
  }, [firestore, userProfile?.uid]);

  // ── Super Admin path ─────────────────────────────────────────────────────────
  // Super Admin never receives regular announcements — only a special lock banner.

  const superAdminLockBanners = useMemo(() => {
    if (!isSuperAdmin) return [];
    return raw.filter(
      a => isTimeActive(a) && a.announcementLevel === 'maintenance_lock',
    );
  }, [raw, isSuperAdmin]);

  // ── Regular user path ────────────────────────────────────────────────────────

  // Announcements that are time-active AND targeted at this (non-super-admin) user
  const activeForUser = useMemo(() => {
    if (isSuperAdmin) return [];
    return raw.filter(a => isTimeActive(a) && isTargetedAt(a, userRole));
  }, [raw, isSuperAdmin, userRole]);

  // Modals: all active announcements (non-lock) — showAsModal defaults to true
  const modalAnnouncements = useMemo(
    () => activeForUser.filter(
      a => a.announcementLevel !== 'maintenance_lock' && wantsModal(a),
    ),
    [activeForUser],
  );

  // Banners: only when showAsBanner is explicitly true
  const bannerAnnouncements = useMemo(
    () => activeForUser.filter(
      a => a.showAsBanner === true && a.announcementLevel !== 'maintenance_lock',
    ),
    [activeForUser],
  );

  // Maintenance Lock: blocks non-super-admin users; Super Admin is never locked
  const lockAnnouncement = useMemo(
    () => activeForUser.find(a => a.announcementLevel === 'maintenance_lock') ?? null,
    [activeForUser],
  );

  return {
    loading,
    // regular user
    modalAnnouncements,
    bannerAnnouncements,
    lockAnnouncement,
    isLocked: !!lockAnnouncement,
    // super admin only
    superAdminLockBanners,
  };
}
