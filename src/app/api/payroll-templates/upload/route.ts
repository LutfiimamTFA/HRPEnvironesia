import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import admin from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { uploadFileToAppsScript, AppsScriptUploadError } from "@/lib/server/google-drive-apps-script";

export const runtime = "nodejs";

// Payroll templates are small spreadsheets, but give some headroom over the
// 1MB cap used for profile photos elsewhere.
const MAX_FILE_SIZE = 15 * 1024 * 1024;
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

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

    console.info("[Payroll Template] Upload using Apps Script system uploader", { fileName: file.name });

    let uploadResult;
    try {
      uploadResult = await uploadFileToAppsScript({
        fileName: file.name,
        fileType: XLSX_MIME,
        buffer,
        category: "payroll_template",
        uploadedBy: decoded.uid,
      });
    } catch (err) {
      const message = err instanceof AppsScriptUploadError ? err.message : "Gagal upload template ke Google Drive.";
      return NextResponse.json({ success: false, message }, { status: 502 });
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
      driveFileId: uploadResult.fileId,
      driveFolderId: uploadResult.driveFolderId || null,
      driveWebViewLink: uploadResult.webViewLink || null,
      driveWebContentLink: uploadResult.driveDownloadUrl || null,
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
      driveFileId: uploadResult.fileId,
      driveWebViewLink: uploadResult.webViewLink || null,
      driveWebContentLink: uploadResult.driveDownloadUrl || null,
    });
  } catch (error: any) {
    console.error("[payroll-templates/upload] error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Terjadi kesalahan server." },
      { status: 500 },
    );
  }
}
