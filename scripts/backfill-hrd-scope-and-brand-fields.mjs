import admin from "firebase-admin";

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
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
    return;
  }

  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

function valueAsString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getCandidateUid(data) {
  return (
    valueAsString(data.uid) ||
    valueAsString(data.employeeUid) ||
    valueAsString(data.employeeId) ||
    valueAsString(data.applicantUid) ||
    valueAsString(data.requesterUid) ||
    valueAsString(data.candidateUid)
  );
}

function makeBrandResolver({ brands, users, profiles, employees }) {
  const brandById = new Map();
  const brandIdByName = new Map();

  brands.forEach((brand) => {
    if (!brand.id) return;
    brandById.set(brand.id, brand);
    [brand.name, brand.companyName, brand.brandName]
      .map(valueAsString)
      .filter(Boolean)
      .forEach((name) => brandIdByName.set(name.toLowerCase(), brand.id));
  });

  function directBrand(data) {
    const brandId = valueAsString(data.brandId) || valueAsString(data.applicantBrandId);
    if (brandId && brandById.has(brandId)) return brandId;

    const brandName =
      valueAsString(data.brandName) ||
      valueAsString(data.applicantBrandName) ||
      valueAsString(data.companyName) ||
      valueAsString(data.applicantCompanyName);
    if (brandName) return brandIdByName.get(brandName.toLowerCase()) || null;

    return null;
  }

  function fromUid(uid) {
    if (!uid) return null;
    return directBrand(users.get(uid) || {}) ||
      directBrand(profiles.get(uid) || {}) ||
      directBrand(employees.get(uid) || {});
  }

  return (data) => {
    const brandId = directBrand(data) || fromUid(getCandidateUid(data));
    if (!brandId) return null;
    return {
      brandId,
      brandName: brandById.get(brandId)?.name || brandById.get(brandId)?.companyName || data.brandName || null,
    };
  };
}

async function readCollectionMap(db, collectionName) {
  const snap = await db.collection(collectionName).get();
  return new Map(snap.docs.map((doc) => [doc.id, { id: doc.id, ...doc.data() }]));
}

async function commitBatch(batch, stats) {
  if (DRY_RUN || stats.pendingWrites === 0) return;
  await batch.commit();
  stats.pendingWrites = 0;
}

async function backfillHrdRoles(db, stats) {
  const hrdUsers = await db.collection("users").where("role", "==", "hrd").get();
  let batch = db.batch();

  for (const userDoc of hrdUsers.docs) {
    const roleRef = db.collection("roles_hrd").doc(userDoc.id);
    const roleDoc = await roleRef.get();
    const roleData = roleDoc.exists ? roleDoc.data() || {} : {};
    const userData = userDoc.data();
    const userScope = userData.hrdScope || {};
    const hasScope =
      roleData.scopeType === "all_companies" ||
      roleData.scopeType === "selected_companies";

    if (hasScope) continue;

    const scopeType = userScope.scopeType === "all_companies" ? "all_companies" : "selected_companies";
    const allowedBrandIds = scopeType === "all_companies" ? [] : Array.isArray(userScope.allowedBrandIds) ? userScope.allowedBrandIds : [];
    const allowedBrandNames = scopeType === "all_companies" ? [] : Array.isArray(userScope.allowedBrandNames) ? userScope.allowedBrandNames : [];

    stats.hrdRoles++;
    if (!DRY_RUN) {
      batch.set(roleRef, {
        uid: userDoc.id,
        role: "hrd",
        scopeType,
        allowedBrandIds,
        allowedBrandNames,
        active: userData.isActive !== false,
        updatedAt: NOW,
        updatedBy: "backfill-hrd-scope-and-brand-fields",
      }, { merge: true });
      stats.pendingWrites++;
      if (stats.pendingWrites >= 450) {
        await commitBatch(batch, stats);
        batch = db.batch();
      }
    }
  }

  await commitBatch(batch, stats);
}

async function backfillCollectionBrand(db, collectionName, resolveBrand, stats) {
  const snap = await db.collection(collectionName).get();
  let batch = db.batch();

  for (const doc of snap.docs) {
    const data = doc.data();
    if (valueAsString(data.brandId)) continue;

    const resolved = resolveBrand(data);
    if (!resolved?.brandId) {
      stats.unresolved.push(`${collectionName}/${doc.id}`);
      continue;
    }

    stats.brandFields++;
    if (!DRY_RUN) {
      batch.update(doc.ref, {
        brandId: resolved.brandId,
        brandName: resolved.brandName || admin.firestore.FieldValue.delete(),
        brandBackfilledAt: NOW,
        brandBackfilledBy: "backfill-hrd-scope-and-brand-fields",
      });
      stats.pendingWrites++;
      if (stats.pendingWrites >= 450) {
        await commitBatch(batch, stats);
        batch = db.batch();
      }
    }
  }

  await commitBatch(batch, stats);
}

async function main() {
  initAdmin();
  const db = admin.firestore();
  const stats = { hrdRoles: 0, brandFields: 0, pendingWrites: 0, unresolved: [] };

  const brands = Array.from((await readCollectionMap(db, "brands")).values());
  const users = await readCollectionMap(db, "users");
  const profiles = await readCollectionMap(db, "employee_profiles");
  const employees = await readCollectionMap(db, "employees");
  const resolveBrand = makeBrandResolver({ brands, users, profiles, employees });

  await backfillHrdRoles(db, stats);

  const collections = [
    "users",
    "employee_profiles",
    "employees",
    "attendance_sites",
    "attendance_events",
    "permission_requests",
    "leave_requests",
    "leave_balances",
    "leave_balance_adjustments",
    "overtime_submissions",
    "business_trips",
    "business_trip_missions",
    "bank_change_requests",
    "daily_reports",
    "monthly_evaluations",
    "jobs",
    "applications",
    "assessment_sessions",
    "offerings",
  ];

  for (const collectionName of collections) {
    await backfillCollectionBrand(db, collectionName, resolveBrand, stats);
  }

  console.log(JSON.stringify({
    mode: DRY_RUN ? "dry-run" : "commit",
    hrdRoleDocsToUpdate: stats.hrdRoles,
    docsWithBrandBackfill: stats.brandFields,
    unresolvedCount: stats.unresolved.length,
    unresolvedSample: stats.unresolved.slice(0, 50),
  }, null, 2));

  if (DRY_RUN) {
    console.log("Dry run only. Re-run with --commit to write changes.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
