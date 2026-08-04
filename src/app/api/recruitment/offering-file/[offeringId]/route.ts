import { NextRequest, NextResponse } from "next/server";
import admin from "@/lib/firebase/admin";
import { google } from "googleapis";

/**
 * GET /api/recruitment/offering-file/[offeringId]?mode=preview|download
 *
 * Serves offering documents (PDF) through the portal.
 * Never exposes Google Drive or Firebase Storage URLs to the client.
 *
 * Auth: candidate must own the application, or user must be HRD/admin.
 * Source: Firebase Storage (documentPath) preferred; falls back to Google Drive.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { offeringId: string } },
) {
  const { offeringId } = params;
  const mode = req.nextUrl.searchParams.get("mode") === "download" ? "download" : "preview";

  // ── 1. Auth ──────────────────────────────────────────────────────────────
  let uid: string | null = null;

  const authHeader = req.headers.get("authorization");
  const cookieToken =
    req.cookies.get("firebase-token")?.value ||
    req.cookies.get("__session")?.value;
  const token = authHeader?.replace("Bearer ", "") || cookieToken;

  if (token) {
    try {
      const decoded = await admin.auth().verifyIdToken(token);
      uid = decoded.uid;
    } catch {
      // fall through
    }
  }

  if (!uid) {
    return new NextResponse("Silakan login untuk mengakses dokumen ini.", { status: 401 });
  }

  // ── 2. Fetch offering from Firestore ─────────────────────────────────────
  let offeringData: FirebaseFirestore.DocumentData | null = null;
  try {
    const snap = await admin.firestore().collection("offerings").doc(offeringId).get();
    if (!snap.exists) {
      return new NextResponse("Surat Penawaran tidak ditemukan.", { status: 404 });
    }
    offeringData = snap.data()!;
  } catch (e: any) {
    console.error("[offering-file] Firestore error:", e.message);
    return new NextResponse("Gagal mengambil data penawaran.", { status: 500 });
  }

  // ── 3. Access control ────────────────────────────────────────────────────
  let isAuthorized = false;

  // Check HRD/admin role
  try {
    const [userDoc, hrdSnap, adminSnap, superSnap] = await Promise.all([
      admin.firestore().collection("users").doc(uid).get(),
      admin.firestore().collection("roles_hrd").doc(uid).get(),
      admin.firestore().collection("roles_admin").doc(uid).get(),
      admin.firestore().collection("roles_superadmin").doc(uid).get(),
    ]);
    const role = userDoc.data()?.role || "";
    if (
      hrdSnap.exists || adminSnap.exists || superSnap.exists ||
      ["hrd", "admin", "super-admin", "superadmin", "Super Admin", "HRD"].includes(role)
    ) {
      isAuthorized = true;
    }
  } catch {
    // continue
  }

  // Check candidate owns the application
  if (!isAuthorized) {
    const applicationId = offeringData.applicationId as string | undefined;
    if (applicationId) {
      try {
        const appSnap = await admin.firestore().collection("applications").doc(applicationId).get();
        const appData = appSnap.data();
        if (
          appData?.candidateUid === uid ||
          appData?.userId === uid ||
          appData?.applicantUid === uid
        ) {
          isAuthorized = true;
        }
      } catch {
        // continue
      }
    }

    // Also check candidateUid stored directly on offering
    if (!isAuthorized && offeringData.candidateUid === uid) {
      isAuthorized = true;
    }
  }

  if (!isAuthorized) {
    return new NextResponse(
      "Anda tidak memiliki akses untuk membuka dokumen penawaran ini.",
      { status: 403 },
    );
  }

  // ── 4. Resolve & stream file ─────────────────────────────────────────────
  const documentPath = offeringData.documentPath as string | undefined;
  const documentUrl = offeringData.documentUrl as string | undefined;
  const documentName = offeringData.documentName || "Surat_Penawaran.pdf";
  const disposition = mode === "download"
    ? `attachment; filename="${documentName}"`
    : `inline; filename="${documentName}"`;

  // ── 4a. Firebase Storage (preferred) ────────────────────────────────────
  if (documentPath) {
    try {
      const bucket = admin
        .storage()
        .bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
      const file = bucket.file(documentPath);
      const [exists] = await file.exists();
      if (exists) {
        const [buffer] = await file.download();
        const [meta] = await file.getMetadata();
        const contentType = meta.contentType || "application/pdf";
        return new NextResponse(buffer as unknown as BodyInit, {
          status: 200,
          headers: {
            "Content-Type": contentType,
            "Content-Disposition": disposition,
            "Cache-Control": "private, max-age=3600",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
    } catch (e: any) {
      console.warn("[offering-file] Firebase Storage failed:", e.message);
      // fall through to Drive
    }
  }

  // ── 4b. Google Drive fallback ────────────────────────────────────────────
  if (documentUrl) {
    const fileIdMatch =
      documentUrl.match(/\/d\/([a-zA-Z0-9_-]+)/) ||
      documentUrl.match(/fileId=([a-zA-Z0-9_-]+)/) ||
      documentUrl.match(/id=([a-zA-Z0-9_-]+)/);
    const fileId = fileIdMatch?.[1];

    if (fileId) {
      const clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
      const privateKeyRaw = process.env.GOOGLE_DRIVE_PRIVATE_KEY;

      if (!clientEmail || !privateKeyRaw) {
        console.error("[offering-file] Missing Google Drive credentials");
        return new NextResponse(
          "Surat Penawaran belum dapat dibuka. Silakan hubungi Human Capital.",
          { status: 503 },
        );
      }

      try {
        const auth = new google.auth.JWT({
          email: clientEmail,
          key: privateKeyRaw.replace(/\\n/g, "\n"),
          scopes: ["https://www.googleapis.com/auth/drive.readonly"],
        });
        const drive = google.drive({ version: "v3", auth });

        const fileMeta = await drive.files.get({
          fileId,
          fields: "mimeType,name",
          supportsAllDrives: true,
        });
        const mimeType = fileMeta.data.mimeType || "application/pdf";

        const fileRes = await drive.files.get(
          { fileId, alt: "media", supportsAllDrives: true },
          { responseType: "arraybuffer" },
        );

        const buffer = Buffer.from(fileRes.data as ArrayBuffer);
        return new NextResponse(buffer as unknown as BodyInit, {
          status: 200,
          headers: {
            "Content-Type": mimeType,
            "Content-Disposition": disposition,
            "Cache-Control": "private, max-age=3600",
            "X-Content-Type-Options": "nosniff",
          },
        });
      } catch (e: any) {
        console.error("[offering-file] Drive fetch failed:", e.message);
        return new NextResponse(
          "Surat Penawaran belum dapat dibuka. Silakan hubungi Human Capital.",
          { status: 502 },
        );
      }
    }
  }

  return new NextResponse(
    "Dokumen Surat Penawaran belum tersedia. Silakan hubungi Human Capital.",
    { status: 404 },
  );
}
