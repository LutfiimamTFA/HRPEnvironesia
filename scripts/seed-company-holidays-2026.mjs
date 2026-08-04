import admin from "firebase-admin";

// Seeds `company_holidays` with the 2026 Indonesian national holidays /
// cuti bersama calendar, so Rekap Absensi Payroll stops counting those dates
// as Alpha. Doc id = dateKey, so re-running is idempotent by default.
//
// Usage:
//   node scripts/seed-company-holidays-2026.mjs            # dry run
//   node scripts/seed-company-holidays-2026.mjs --commit    # write changes
//   node scripts/seed-company-holidays-2026.mjs --commit --overwrite  # also overwrite existing docs

const DRY_RUN = !process.argv.includes("--commit");
const OVERWRITE = process.argv.includes("--overwrite");
const NOW = admin.firestore.FieldValue.serverTimestamp();

function normalizedPrivateKey(value) {
  return value ? value.replace(/\\n/g, "\n").trim().replace(/^"|"$/g, "") : null;
}

function initAdmin() {
  if (admin.apps.length) return;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = normalizedPrivateKey(process.env.FIREBASE_PRIVATE_KEY);

  if (projectId && clientEmail && privateKey) {
    admin.initializeApp({ credential: admin.credential.cert({ projectId, clientEmail, privateKey }) });
    return;
  }
  admin.initializeApp({ credential: admin.credential.applicationDefault() });
}

// Mirrors src/lib/payroll-recap.ts's INDONESIA_PUBLIC_HOLIDAYS_2026 — kept in
// sync manually since one lives in Firestore (company_holidays) and the other
// is a hardcoded fallback in app code.
const HOLIDAYS_2026 = [
  { date: "2026-01-01", type: "national_holiday", name: "Tahun Baru Masehi" },
  { date: "2026-01-16", type: "national_holiday", name: "Isra Mikraj Nabi Muhammad SAW" },
  { date: "2026-02-16", type: "collective_leave", name: "Tahun Baru Imlek 2577 Kongzili" },
  { date: "2026-02-17", type: "national_holiday", name: "Tahun Baru Imlek 2577 Kongzili" },
  { date: "2026-03-18", type: "collective_leave", name: "Hari Suci Nyepi" },
  { date: "2026-03-19", type: "national_holiday", name: "Hari Suci Nyepi" },
  { date: "2026-03-20", type: "collective_leave", name: "Idul Fitri 1447 H" },
  { date: "2026-03-21", type: "national_holiday", name: "Idul Fitri 1447 H" },
  { date: "2026-03-22", type: "national_holiday", name: "Idul Fitri 1447 H" },
  { date: "2026-03-23", type: "collective_leave", name: "Idul Fitri 1447 H" },
  { date: "2026-03-24", type: "collective_leave", name: "Idul Fitri 1447 H" },
  { date: "2026-04-03", type: "national_holiday", name: "Wafat Yesus Kristus" },
  { date: "2026-04-05", type: "national_holiday", name: "Hari Paskah" },
  { date: "2026-05-01", type: "national_holiday", name: "Hari Buruh Internasional" },
  { date: "2026-05-14", type: "national_holiday", name: "Kenaikan Yesus Kristus" },
  { date: "2026-05-15", type: "collective_leave", name: "Kenaikan Yesus Kristus" },
  { date: "2026-05-27", type: "national_holiday", name: "Idul Adha 1447 H" },
  { date: "2026-05-28", type: "collective_leave", name: "Idul Adha 1447 H" },
  { date: "2026-05-31", type: "national_holiday", name: "Hari Raya Waisak" },
  { date: "2026-06-01", type: "national_holiday", name: "Hari Lahir Pancasila" },
  { date: "2026-06-16", type: "national_holiday", name: "Tahun Baru Islam 1448 H" },
  { date: "2026-08-17", type: "national_holiday", name: "Hari Kemerdekaan Republik Indonesia" },
  { date: "2026-08-25", type: "national_holiday", name: "Maulid Nabi Muhammad SAW" },
  { date: "2026-12-24", type: "collective_leave", name: "Natal" },
  { date: "2026-12-25", type: "national_holiday", name: "Hari Raya Natal" },
];

async function main() {
  initAdmin();
  const db = admin.firestore();
  const collectionRef = db.collection("company_holidays");

  const stats = { toCreate: 0, toSkipExisting: 0, toOverwrite: 0 };
  let batch = db.batch();
  let pendingWrites = 0;

  for (const holiday of HOLIDAYS_2026) {
    const docRef = collectionRef.doc(holiday.date);
    const existing = await docRef.get();

    if (existing.exists && !OVERWRITE) {
      stats.toSkipExisting++;
      continue;
    }

    if (existing.exists && OVERWRITE) stats.toOverwrite++;
    else stats.toCreate++;

    if (!DRY_RUN) {
      batch.set(docRef, {
        dateKey: holiday.date,
        name: holiday.name,
        type: holiday.type,
        source: "SKB 3 Menteri",
        year: 2026,
        isPaidHoliday: true,
        appliesToBrandIds: ["all"],
        createdAt: existing.exists ? existing.data().createdAt || NOW : NOW,
        updatedAt: NOW,
      }, { merge: true });
      pendingWrites++;
      if (pendingWrites >= 400) {
        await batch.commit();
        batch = db.batch();
        pendingWrites = 0;
      }
    }
  }

  if (!DRY_RUN && pendingWrites > 0) {
    await batch.commit();
  }

  console.log(JSON.stringify({
    mode: DRY_RUN ? "dry-run" : "commit",
    overwriteEnabled: OVERWRITE,
    totalHolidaysInList: HOLIDAYS_2026.length,
    ...stats,
  }, null, 2));

  if (DRY_RUN) {
    console.log("Dry run only. Re-run with --commit to write changes. Add --overwrite to also replace existing docs.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
