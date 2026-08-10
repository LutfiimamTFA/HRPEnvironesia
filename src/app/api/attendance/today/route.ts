import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';

// firestore.rules only lets HRD/Super Admin `read` attendance_events (see
// the /attendance_events match block: `allow read: if isSuperAdmin() ||
// (isHrd() && hrdCanReadBrandData(...))`) — a karyawan can `create` their
// own tap-in/out (the Web Absen app does that), but can never read them
// back client-side. This route uses the Admin SDK to fetch the CALLER's own
// attendance_events (by uid, never by brand/globally) so the dashboard can
// show "sudah absen masuk pukul 08:05" and a days-present-this-month count
// without needing that rule loosened.
//
// Deliberately equality-only queries (employeeUid == uid / uid == uid), no
// dateKey range filter and no orderBy — combining a range/orderBy with an
// equality filter on a different field needs a Firestore composite index,
// and none exists for this collection. Filtering "today" / "this month" is
// done in memory instead, on what's realistically a few hundred docs for a
// single employee.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function getJakartaDateKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(date);
}

function getEventType(event: any): 'tap_in' | 'tap_out' | '' {
  const raw = String(event?.eventType || event?.type || event?.action || event?.tapType || event?.checkType || '').toLowerCase();
  if (['tap_in', 'in', 'check_in', 'clock_in', 'masuk', 'kehadiran_masuk'].includes(raw)) return 'tap_in';
  if (['tap_out', 'out', 'check_out', 'clock_out', 'pulang', 'kehadiran_pulang'].includes(raw)) return 'tap_out';
  return '';
}

function getEventDateKey(event: any): string {
  const direct = event?.dateKey || event?.attendanceDate || event?.localDate;
  if (direct) return direct;
  const raw = event?.tsClient || event?.tsServer || event?.timestamp || event?.ts || event?.createdAt;
  if (!raw) return '';
  try {
    const date = typeof raw?.toDate === 'function' ? raw.toDate() : new Date(raw);
    return Number.isNaN(date.getTime()) ? '' : getJakartaDateKey(date);
  } catch {
    return '';
  }
}

function getEventTimestampIso(event: any): string | null {
  const raw = event?.tsClient || event?.tsServer || event?.timestamp || event?.ts || event?.createdAt;
  if (!raw) return null;
  try {
    const date = typeof raw?.toDate === 'function' ? raw.toDate() : new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  } catch {
    return null;
  }
}

function serializeEvent(event: any) {
  return {
    timestamp: getEventTimestampIso(event),
    mode: event.mode || null,
    address: event.address || null,
  };
}

export async function GET(req: NextRequest) {
  if (!admin.apps.length) {
    return NextResponse.json({ error: 'Firebase Admin SDK not initialized.' }, { status: 500 });
  }

  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized: Missing token.' }, { status: 401 });
  }
  const idToken = authorization.split('Bearer ')[1];

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    const uid = decoded.uid;
    const db = admin.firestore();
    const now = new Date();
    const todayKey = getJakartaDateKey(now);
    const monthPrefix = todayKey.slice(0, 7); // "YYYY-MM"

    const [byEmployeeUid, byUid] = await Promise.all([
      db.collection('attendance_events').where('employeeUid', '==', uid).get(),
      db.collection('attendance_events').where('uid', '==', uid).get(),
    ]);

    const events = new Map<string, any>();
    [...byEmployeeUid.docs, ...byUid.docs].forEach((docSnap) => events.set(docSnap.id, docSnap.data()));

    let todayTapIn: any = null;
    let todayTapOut: any = null;
    const daysPresentThisMonth = new Set<string>();

    events.forEach((event) => {
      const type = getEventType(event);
      const dateKey = getEventDateKey(event);
      if (!type || !dateKey) return;

      if (dateKey.startsWith(monthPrefix) && type === 'tap_in') {
        daysPresentThisMonth.add(dateKey);
      }
      if (dateKey === todayKey) {
        if (type === 'tap_in' && !todayTapIn) todayTapIn = event;
        if (type === 'tap_out' && !todayTapOut) todayTapOut = event;
      }
    });

    const status = todayTapIn && todayTapOut ? 'completed' : todayTapIn ? 'working' : 'not_yet';

    return NextResponse.json(
      {
        today: {
          dateKey: todayKey,
          status,
          tapIn: todayTapIn ? serializeEvent(todayTapIn) : null,
          tapOut: todayTapOut ? serializeEvent(todayTapOut) : null,
        },
        monthSummary: {
          monthKey: monthPrefix,
          daysPresent: daysPresentThisMonth.size,
        },
      },
      { status: 200 },
    );
  } catch (error: any) {
    console.error('[ATTENDANCE_TODAY_FAILED]', error);
    return NextResponse.json({ error: error.message || 'An unexpected error occurred.' }, { status: 500 });
  }
}
