import { NextRequest, NextResponse } from "next/server";
import admin from "@/lib/firebase/admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import type { EmployeeProfile, UserProfile } from "@/lib/types";
import { HRP_FIELDS } from "@/lib/hrp-fields";

export const runtime = "nodejs";

async function verifyAdmin(req: NextRequest) {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return { error: "Unauthorized: Missing token.", status: 401 };
  }
  const idToken = authorization.split("Bearer ")[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const userDoc = await admin
      .firestore()
      .collection("users")
      .doc(decodedToken.uid)
      .get();
    if (
      !userDoc.exists ||
      !["super-admin", "hrd"].includes(userDoc.data()?.role)
    ) {
      return { error: "Forbidden.", status: 403 };
    }
    return { uid: decodedToken.uid };
  } catch (error: any) {
    if (
      error.code === "auth/id-token-expired" ||
      error.code === "auth/invalid-id-token"
    ) {
      return {
        error:
          "Sesi Anda telah berakhir, silakan muat ulang halaman dan coba lagi.",
        status: 401,
      };
    }
    return { error: `Verifikasi token gagal: ${error.message}`, status: 401 };
  }
}

export async function POST(req: NextRequest) {
  const authResult = await verifyAdmin(req);
  if (authResult.error) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status },
    );
  }

  const { rows, mapping, customFields } = await req.json();

  const db = admin.firestore();
  const results = {
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [] as string[],
  };

  const headerToHrpField: Record<string, string> = {};
  for (const header in mapping) {
    const hrpField = mapping[header];
    if (hrpField && hrpField !== "__skip__") {
      headerToHrpField[header] = hrpField;
    }
  }

  const findHeaderByHrpField = (field: string) =>
    Object.keys(headerToHrpField).find((h) => headerToHrpField[h] === field);
  const employeeMastersRef = db.collection("employees");

  const allowedEmployeeFields = new Set([
    "fullName",
    "email",
    "employeeNumber",
    "brandId",
    "brandName",
    "brand",
    "division",
    "positionTitle",
    "managerName",
    "managerUid",
    "joinDate",
    "startDate",
    "employmentType",
    "employmentStatus",
    "source",
  ]);

  // Process rows sequentially to avoid Firestore race conditions with lookups
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const fullNameHeader = findHeaderByHrpField("fullName");
      if (!fullNameHeader || !row[fullNameHeader]) {
        results.skipped++;
        results.errors.push(
          `Baris ${i + 2}: Dilewati karena nama lengkap tidak ada atau tidak dipetakan.`,
        );
        continue;
      }

      const employeeNumberHeader = findHeaderByHrpField("employeeNumber");
      const emailHeader = findHeaderByHrpField("email");

      const employeeNumber = employeeNumberHeader
        ? row[employeeNumberHeader]
        : null;
      const email = emailHeader ? row[emailHeader] : null;

      let existingEmployeeSnap: admin.firestore.DocumentSnapshot | null = null;
      let userRecord: admin.auth.UserRecord | null = null;

      if (employeeNumber) {
        const querySnapshot = await employeeMastersRef
          .where("employeeNumber", "==", employeeNumber)
          .limit(1)
          .get();
        if (!querySnapshot.empty) {
          existingEmployeeSnap = querySnapshot.docs[0];
        }
      }

      if (!existingEmployeeSnap && email) {
        try {
          userRecord = await admin.auth().getUserByEmail(email);
          if (userRecord) {
            const employeeByUid = await employeeMastersRef
              .doc(userRecord.uid)
              .get();
            if (employeeByUid.exists) {
              existingEmployeeSnap = employeeByUid;
            }
          }
        } catch (authError: any) {
          if (authError.code !== "auth/user-not-found") {
            console.warn(
              `Auth lookup for ${email} failed, but continuing import:`,
              authError.message,
            );
          }
          userRecord = null;
        }
      }

      const payload: Partial<Record<string, any>> = {};
      let hasData = false;

      for (const header in row) {
        const hrpFieldKey = headerToHrpField[header];
        if (
          hrpFieldKey &&
          hrpFieldKey !== "__custom__" &&
          allowedEmployeeFields.has(hrpFieldKey)
        ) {
          const value = row[header];
          if (value !== undefined && value !== null && value !== "") {
            hasData = true;
            if (hrpFieldKey === "joinDate" || hrpFieldKey === "startDate") {
              const dateValue = new Date(value);
              if (!Number.isNaN(dateValue.getTime())) {
                payload.startDate = Timestamp.fromDate(dateValue);
                payload.joinDate = Timestamp.fromDate(dateValue);
              }
            } else {
              payload[hrpFieldKey] = value;
            }
          }
        }
      }

      if (!hasData) {
        results.skipped++;
        results.errors.push(`Baris ${i + 2}: Tidak ada data untuk diimpor.`);
        continue;
      }

      const batch = db.batch();

      if (existingEmployeeSnap) {
        // --- UPDATE ---
        const docRef = existingEmployeeSnap.ref;
        batch.set(
          docRef,
          {
            ...payload,
            source: "import",
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        results.updated++;
      } else {
        // --- CREATE ---
        let uid;
        let newDocRef;

        if (userRecord) {
          uid = userRecord.uid;
          newDocRef = employeeMastersRef.doc(uid);
        } else {
          newDocRef = employeeMastersRef.doc();
          uid = newDocRef.id;
        }

        const finalPayload = {
          uid,
          fullName: row[findHeaderByHrpField("fullName")] || "",
          email: email || "",
          source: "import" as const,
          employmentType: (payload.employmentType as string) || "karyawan",
          employmentStatus: (payload.employmentStatus as string) || "active",
          ...payload,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        };

        batch.set(newDocRef, finalPayload);
        results.created++;
      }

      await batch.commit();
    } catch (e: any) {
      results.failed++;
      results.errors.push(`Baris ${i + 2}: ${e.message}`);
    }
  }

  return NextResponse.json(results);
}
