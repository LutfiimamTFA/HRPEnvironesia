import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { Readable } from "stream";
import * as XLSX from "xlsx";
import admin from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

// Payroll templates are small spreadsheets, but give some headroom over the
// 1MB cap used for profile photos elsewhere.
const MAX_FILE_SIZE = 15 * 1024 * 1024;
const PAYROLL_TEMPLATE_FOLDER_NAME = "HRP Payroll Templates";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const DRIVE_NOT_CONNECTED_MESSAGE =
  "Google Drive belum terhubung. Hubungkan Google Drive terlebih dahulu di menu Backup & Export.";

// Payroll templates must be uploaded using the Super Admin's connected OAuth
// Google Drive account (the same connection used by Backup & Export), never
// a service account — service accounts have no storage quota of their own.
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
  // Force a refresh now so an expired/near-expiry access token doesn't fail mid-upload.
  await oauth2Client.getAccessToken();

  return google.drive({ version: "v3", auth: oauth2Client });
}

async function getOrCreatePayrollTemplateFolder(drive: any): Promise<string> {
  const envFolderId = process.env.GOOGLE_DRIVE_PAYROLL_TEMPLATE_FOLDER_ID;
  if (envFolderId) return envFolderId;

  const query = `mimeType='application/vnd.google-apps.folder' and name='${PAYROLL_TEMPLATE_FOLDER_NAME}' and 'root' in parents and trashed=false`;
  const listResponse = await drive.files.list({
    q: query,
    fields: "files(id, name)",
    spaces: "drive",
  });
  const existing = listResponse.data.files;
  if (existing && existing.length > 0) return existing[0].id!;

  const created = await drive.files.create({
    requestBody: {
      name: PAYROLL_TEMPLATE_FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
      parents: ["root"],
    },
    fields: "id",
  });
  return created.data.id!;
}

function isDriveAuthError(message: string): boolean {
  return /invalid_grant|invalid_rapt|unauthorized|token|permission|belum terhubung/i.test(message);
}

export async function POST(req: NextRequest) {
  try {
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
    const userProfile = userDoc.exists ? userDoc.data() : null;

    if (!userProfile || userProfile.role !== "super-admin") {
      return NextResponse.json(
        { success: false, message: "Hanya Super Admin yang boleh mengupload template payroll." },
        { status: 403 },
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const name = (formData.get("name") as string) || "";

    if (!file) {
      return NextResponse.json({ success: false, message: "File tidak ditemukan." }, { status: 400 });
    }
    if (!name.trim()) {
      return NextResponse.json({ success: false, message: "Nama template wajib diisi." }, { status: 400 });
    }

    const isXlsx =
      file.name.toLowerCase().endsWith(".xlsx") || file.type === XLSX_MIME;
    if (!isXlsx) {
      return NextResponse.json({ success: false, message: "File harus berformat .xlsx." }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ success: false, message: "Ukuran file terlalu besar. Maksimal 15 MB." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Read sheet names server-side, before uploading — also doubles as a validity check.
    let sheetNames: string[] = [];
    try {
      const workbook = XLSX.read(buffer, { bookSheets: true });
      sheetNames = workbook.SheetNames;
    } catch {
      return NextResponse.json({ success: false, message: "File Excel tidak valid atau rusak." }, { status: 400 });
    }
    if (sheetNames.length === 0) {
      return NextResponse.json({ success: false, message: "Tidak ada sheet ditemukan di file Excel ini." }, { status: 400 });
    }

    let drive;
    try {
      drive = await buildOAuthDriveClient();
    } catch (err: any) {
      const msg = String(err?.message || "");
      return NextResponse.json(
        { success: false, message: msg === DRIVE_NOT_CONNECTED_MESSAGE ? msg : "Upload gagal karena koneksi Google Drive perlu diperbarui." },
        { status: msg === DRIVE_NOT_CONNECTED_MESSAGE ? 400 : 502 },
      );
    }

    let driveFolderId: string;
    try {
      driveFolderId = await getOrCreatePayrollTemplateFolder(drive);
    } catch (err: any) {
      const msg = String(err?.message || "");
      return NextResponse.json(
        { success: false, message: isDriveAuthError(msg) ? "Upload gagal karena koneksi Google Drive perlu diperbarui." : "Gagal menyiapkan folder template payroll di Google Drive." },
        { status: 502 },
      );
    }

    const bufferStream = new Readable();
    bufferStream.push(buffer);
    bufferStream.push(null);

    let driveFile;
    try {
      const driveResponse = await drive.files.create({
        requestBody: { name: file.name, parents: [driveFolderId] },
        media: { mimeType: XLSX_MIME, body: bufferStream },
        fields: "id, name, size, mimeType, webViewLink, webContentLink",
        supportsAllDrives: true,
      });
      driveFile = driveResponse.data;
      if (driveFile.id) {
        await drive.permissions.create({
          fileId: driveFile.id,
          requestBody: { type: "anyone", role: "reader" },
          supportsAllDrives: true,
        });
      }
    } catch (err: any) {
      const msg = String(err?.message || "");
      return NextResponse.json(
        { success: false, message: isDriveAuthError(msg) ? "Upload gagal karena koneksi Google Drive perlu diperbarui." : (err.message || "Gagal upload ke Google Drive.") },
        { status: 502 },
      );
    }

    if (!driveFile.id) {
      return NextResponse.json({ success: false, message: "Upload ke Google Drive gagal: file id tidak ditemukan." }, { status: 502 });
    }

    const createdByName = userProfile.fullName || (userProfile as any).displayName || userProfile.email || decoded.uid;
    const now = FieldValue.serverTimestamp();
    const templateRef = db.collection("payroll_templates").doc();
    await templateRef.set({
      name: name.trim(),
      fileName: file.name,
      mimeType: XLSX_MIME,
      size: file.size,
      storageProvider: "google_drive",
      driveFileId: driveFile.id,
      driveFolderId,
      driveWebViewLink: driveFile.webViewLink || null,
      driveWebContentLink: driveFile.webContentLink || null,
      sheetNames,
      isActive: true,
      createdByUid: decoded.uid,
      createdByName,
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json({
      success: true,
      templateId: templateRef.id,
      sheetNames,
      driveFileId: driveFile.id,
      driveWebViewLink: driveFile.webViewLink || null,
      driveWebContentLink: driveFile.webContentLink || null,
    });
  } catch (error: any) {
    console.error("[payroll-templates/upload] error:", error);
    const msg = String(error?.message || "");
    return NextResponse.json(
      { success: false, message: isDriveAuthError(msg) ? "Upload gagal karena koneksi Google Drive perlu diperbarui." : (error.message || "Terjadi kesalahan server.") },
      { status: 500 },
    );
  }
}
