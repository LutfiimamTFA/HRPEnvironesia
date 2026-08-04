import admin from "firebase-admin";

// Makes `employee_profiles` the canonical source for brand/division/attendance
// method, and syncs those fields out to `users`/`employees` (which some pages
// still read). Also reports duplicate people (same name/email/employeeId/uid)
// and any employee whose brand/method differs between collections — this is
// what caused e.g. "Lutfi Imam" to show a different brand on the list page
// vs the detail page, and to disappear from Monitoring Absensi.
//
// Usage:
//   node scripts/sync-employee-profile-canonical-fields.mjs            # dry run
//   node scripts/sync-employee-profile-canonical-fields.mjs --commit   # write changes

const DRY_RUN = !process.argv.includes("--commit");
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

function str(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeAttendanceMethodBucket(method) {
  switch (method) {
    case "web_absen":
    case "web_photo":
    case "hybrid":
      return "web_absen";
    case "fingerprint":
    case "id_card":
      return "id_card";
    case "manual":
    case "exempt":
      return "manual";
    default:
      return undefined;
  }
}

async function readCollectionMap(db, collectionName) {
  const snap = await db.collection(collectionName).get();
  return new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
}

/** uid > employeeId > email > phone — first non-empty key wins as the identity. */
function identityKey(record) {
  return (
    str(record.uid) ||
    str(record.employeeId) ||
    str(record.employeeCode) ||
    (str(record.email) ? str(record.email).toLowerCase() : null) ||
    str(record.phone) ||
    str(record.phoneNumber) ||
    null
  );
}

function detectDuplicates(profiles) {
  const byName = new Map();
  const byEmail = new Map();
  const byEmployeeId = new Map();
  const duplicates = [];

  for (const p of profiles.values()) {
    const name = str(p.fullName)?.toLowerCase();
    const email = str(p.email)?.toLowerCase();
    const empId = str(p.employeeId) || str(p.employeeCode);

    if (name) {
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push(p.id);
    }
    if (email) {
      if (!byEmail.has(email)) byEmail.set(email, []);
      byEmail.get(email).push(p.id);
    }
    if (empId) {
      if (!byEmployeeId.has(empId)) byEmployeeId.set(empId, []);
      byEmployeeId.get(empId).push(p.id);
    }
  }

  for (const [name, ids] of byName) {
    if (ids.length > 1) duplicates.push({ matchedBy: "fullName", value: name, docIds: ids });
  }
  for (const [email, ids] of byEmail) {
    if (ids.length > 1) duplicates.push({ matchedBy: "email", value: email, docIds: ids });
  }
  for (const [empId, ids] of byEmployeeId) {
    if (ids.length > 1) duplicates.push({ matchedBy: "employeeId", value: empId, docIds: ids });
  }
  return duplicates;
}

function canonicalFieldsFor(profile) {
  const hrdInfo = profile.hrdEmploymentInfo || {};
  const brandId = str(profile.brandId) || str(hrdInfo.brandId) || null;
  const brandName = str(profile.brandName) || str(hrdInfo.brandName) || null;
  const divisionId = str(profile.divisionId) || str(hrdInfo.divisionId) || null;
  const divisionName = str(profile.divisionName) || str(hrdInfo.divisionName) || null;
  const employeeId = str(profile.employeeId) || str(hrdInfo.employeeId) || null;
  const rawMethod = str(profile.attendanceMethod) || str(profile.attendanceConfig?.method) || str(hrdInfo.attendanceMethod) || null;
  const attendanceMethod = normalizeAttendanceMethodBucket(rawMethod) || null;
  return { brandId, brandName, divisionId, divisionName, employeeId, attendanceMethod };
}

async function main() {
  initAdmin();
  const db = admin.firestore();

  const profiles = await readCollectionMap(db, "employee_profiles");
  const users = await readCollectionMap(db, "users");
  const employees = await readCollectionMap(db, "employees");

  const duplicates = detectDuplicates(profiles);

  const mismatches = [];
  let batch = db.batch();
  let pendingWrites = 0;
  let updatedUsers = 0;
  let updatedEmployees = 0;

  const flushIfNeeded = async () => {
    if (pendingWrites >= 400) {
      if (!DRY_RUN) await batch.commit();
      batch = db.batch();
      pendingWrites = 0;
    }
  };

  for (const profile of profiles.values()) {
    const canonical = canonicalFieldsFor(profile);
    if (!canonical.brandId && !canonical.attendanceMethod) continue;

    const targets = [
      ["users", users.get(profile.id)],
      ["employees", employees.get(profile.id)],
    ];

    for (const [collectionName, target] of targets) {
      if (!target) continue;

      const diff = {};
      if (canonical.brandId && str(target.brandId) !== canonical.brandId) diff.brandId = canonical.brandId;
      if (canonical.brandName && str(target.brandName) !== canonical.brandName) diff.brandName = canonical.brandName;
      if (canonical.divisionId && str(target.divisionId) !== canonical.divisionId) diff.divisionId = canonical.divisionId;
      if (canonical.divisionName && str(target.divisionName) !== canonical.divisionName) diff.divisionName = canonical.divisionName;
      if (canonical.employeeId && str(target.employeeId) !== canonical.employeeId) diff.employeeId = canonical.employeeId;
      if (canonical.attendanceMethod && normalizeAttendanceMethodBucket(target.attendanceMethod) !== canonical.attendanceMethod) {
        diff.attendanceMethod = canonical.attendanceMethod;
      }

      if (Object.keys(diff).length === 0) continue;

      mismatches.push({
        uid: profile.id,
        fullName: profile.fullName || null,
        collection: collectionName,
        diff,
      });

      if (!DRY_RUN) {
        batch.set(
          db.collection(collectionName).doc(profile.id),
          {
            ...diff,
            attendanceMethodUpdatedAt: diff.attendanceMethod ? NOW : undefined,
            attendanceMethodUpdatedBy: diff.attendanceMethod ? "sync-employee-profile-canonical-fields" : undefined,
            canonicalSyncedAt: NOW,
            canonicalSyncedFrom: "employee_profiles",
          },
          { merge: true },
        );
        pendingWrites++;
        if (collectionName === "users") updatedUsers++;
        if (collectionName === "employees") updatedEmployees++;
        await flushIfNeeded();
      } else {
        if (collectionName === "users") updatedUsers++;
        if (collectionName === "employees") updatedEmployees++;
      }
    }
  }

  if (!DRY_RUN && pendingWrites > 0) {
    await batch.commit();
  }

  console.log(JSON.stringify({
    mode: DRY_RUN ? "dry-run" : "commit",
    profilesScanned: profiles.size,
    usersToUpdate: updatedUsers,
    employeesToUpdate: updatedEmployees,
    mismatchCount: mismatches.length,
    mismatchSample: mismatches.slice(0, 50),
    duplicateGroups: duplicates,
  }, null, 2));

  if (DRY_RUN) {
    console.log("Dry run only. Re-run with --commit to write changes.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
