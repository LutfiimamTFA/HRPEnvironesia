import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import admin from "@/lib/firebase/admin";
import { downloadTemplateFromDrive, DriveAccessError } from "@/lib/server/google-drive-oauth";

export const runtime = "nodejs";

const STATUS_BY_CODE: Record<DriveAccessError["code"], number> = {
  not_connected: 400,
  token_expired: 502,
  not_found: 404,
  permission_denied: 403,
  invalid_file: 400,
  unknown: 502,
};

/**
 * "Test Ambil Template" — Super Admin can verify a payroll template is
 * actually retrievable from Google Drive (and readable as an .xlsx workbook)
 * without running a full payroll export. Surfaces the same DriveAccessError
 * classification as the real export download step, so a failure here is a
 * reliable predictor of what "Mengambil template Google Drive" will do.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ templateId: string }> },
) {
  try {
    const { templateId } = await params;
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }
    const idToken = authorization.split("Bearer ")[1];

    if (!admin.apps.length) {
      return NextResponse.json({ success: false, message: "Firebase Admin SDK belum terinisialisasi." }, { status: 500 });
    }

    const decoded = await admin.auth().verifyIdToken(idToken);
    const db = admin.firestore();
    const userDoc = await db.collection("users").doc(decoded.uid).get();
    const role = userDoc.exists ? userDoc.data()?.role : null;
    if (role !== "super-admin" && role !== "hrd") {
      return NextResponse.json({ success: false, message: "Tidak memiliki akses ke template payroll ini." }, { status: 403 });
    }

    const templateDoc = await db.collection("payroll_templates").doc(templateId).get();
    if (!templateDoc.exists) {
      return NextResponse.json({ success: false, message: "Template payroll tidak ditemukan." }, { status: 404 });
    }
    const template = templateDoc.data()!;
    if (template.storageProvider !== "google_drive" || !template.driveFileId) {
      return NextResponse.json(
        { success: false, message: "Template ini belum memiliki fileId Google Drive. Upload ulang template dari menu Template Payroll." },
        { status: 400 },
      );
    }

    let buffer: Buffer;
    try {
      buffer = await downloadTemplateFromDrive(template.driveFileId);
    } catch (err) {
      if (err instanceof DriveAccessError) {
        return NextResponse.json(
          { success: false, message: `Template "${template.name}" tidak dapat diambil dari Google Drive. FileId: ${template.driveFileId}. Error: ${err.message}`, code: err.code },
          { status: STATUS_BY_CODE[err.code] },
        );
      }
      throw err;
    }

    let sheetNames: string[];
    try {
      const workbook = XLSX.read(buffer, { bookSheets: true });
      sheetNames = workbook.SheetNames;
    } catch {
      return NextResponse.json(
        { success: false, message: `File template "${template.name}" berhasil diunduh tetapi bukan file Excel yang valid (corrupt atau bukan .xlsx).` },
        { status: 502 },
      );
    }
    if (sheetNames.length === 0) {
      return NextResponse.json(
        { success: false, message: `File template "${template.name}" tidak memiliki sheet apapun.` },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
      message: `Template berhasil dibaca. Sheet ditemukan: ${sheetNames.join(", ")}.`,
      sheetNames,
      driveFileId: template.driveFileId,
    });
  } catch (error: any) {
    console.error("[payroll-templates/test] error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Gagal menguji pengambilan template dari Google Drive." },
      { status: 502 },
    );
  }
}
