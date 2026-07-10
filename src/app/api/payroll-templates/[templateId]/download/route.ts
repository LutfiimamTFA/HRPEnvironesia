import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import admin from "@/lib/firebase/admin";

export const runtime = "nodejs";

const DRIVE_NOT_CONNECTED_MESSAGE =
  "Google Drive belum terhubung. Hubungkan Google Drive terlebih dahulu di menu Backup & Export.";

function isDriveAuthError(message: string): boolean {
  return /invalid_grant|invalid_rapt|unauthorized|token|permission|belum terhubung/i.test(message);
}

// Same OAuth Google Drive connection used by Backup & Export and the payroll
// template upload route — never a service account.
async function buildOAuthDriveClient() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(DRIVE_NOT_CONNECTED_MESSAGE);
  }

  const oauthDoc = await admin.firestore().collection("system_settings").doc("google_drive_oauth").get();
  const refreshToken = oauthDoc.data()?.refreshToken as string | undefined;
  if (!refreshToken) {
    throw new Error(DRIVE_NOT_CONNECTED_MESSAGE);
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  await oauth2Client.getAccessToken();

  return google.drive({ version: "v3", auth: oauth2Client });
}

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
    if (template.storageProvider !== "google_drive" || !template.driveFileId) {
      return NextResponse.json({ success: false, message: "Template ini tidak tersimpan di Google Drive." }, { status: 400 });
    }

    let drive;
    try {
      drive = await buildOAuthDriveClient();
    } catch (err: any) {
      const msg = String(err?.message || "");
      return NextResponse.json(
        { success: false, message: msg === DRIVE_NOT_CONNECTED_MESSAGE ? msg : "Gagal terhubung ke Google Drive." },
        { status: msg === DRIVE_NOT_CONNECTED_MESSAGE ? 400 : 502 },
      );
    }

    const fileResponse = await drive.files.get(
      { fileId: template.driveFileId, alt: "media", supportsAllDrives: true },
      { responseType: "arraybuffer" },
    );

    return new NextResponse(new Uint8Array(Buffer.from(fileResponse.data as ArrayBuffer)), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${template.fileName || "template.xlsx"}"`,
      },
    });
  } catch (error: any) {
    console.error("[payroll-templates/download] error:", error);
    const msg = String(error?.message || "");
    return NextResponse.json(
      { success: false, message: isDriveAuthError(msg) ? "Gagal mengambil template karena koneksi Google Drive perlu diperbarui." : (error.message || "Gagal mengambil template dari Google Drive.") },
      { status: 502 },
    );
  }
}
