import { NextRequest, NextResponse } from "next/server";
import admin from "@/lib/firebase/admin";
import { downloadPayrollTemplateFromDrive, PayrollDriveAccessError } from "@/lib/server/google-drive-payroll";

export const runtime = "nodejs";

const STATUS_BY_CODE: Record<PayrollDriveAccessError["code"], number> = {
  not_configured: 500,
  not_found: 404,
  permission_denied: 403,
  invalid_file: 400,
  unknown: 502,
};

/**
 * Serves a payroll template's raw .xlsx bytes from Google Drive, so the
 * browser-side export flow never talks to Firebase Storage. Access is
 * limited to Super Admin / HRD (Firestore rules already restrict who can
 * read the payroll_templates metadata doc; this route re-checks the role
 * since it bypasses Firestore's own rule engine via the Admin SDK).
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
    if (template.storageProvider !== "google_drive") {
      return NextResponse.json({ success: false, message: "Template ini tidak tersimpan di Google Drive." }, { status: 400 });
    }
    if (!template.driveFileId) {
      return NextResponse.json(
        { success: false, message: "Template payroll belum memiliki fileId Google Drive. Upload ulang template dari menu Template Payroll." },
        { status: 400 },
      );
    }

    let buffer: Buffer;
    try {
      buffer = await downloadPayrollTemplateFromDrive(template.driveFileId);
    } catch (err) {
      if (err instanceof PayrollDriveAccessError) {
        return NextResponse.json({ success: false, message: err.message, code: err.code }, { status: STATUS_BY_CODE[err.code] });
      }
      throw err;
    }

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${template.fileName || "template.xlsx"}"`,
      },
    });
  } catch (error: any) {
    console.error("[payroll-templates/download] error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Gagal mengambil template dari Google Drive." },
      { status: 502 },
    );
  }
}
