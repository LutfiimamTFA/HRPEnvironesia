import { NextRequest, NextResponse } from "next/server";
import { google, drive_v3 } from "googleapis";
import { Readable } from "stream";

// Max file size: 1 MB
const MAX_FILE_SIZE = 1 * 1024 * 1024;

/**
 * Helper to find or create a folder in Google Drive
 */
async function getOrCreateFolder(
  drive: drive_v3.Drive,
  parentId: string,
  folderName: string
): Promise<string> {
  const query = `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and '${parentId}' in parents and trashed=false`;
  
  const response = await drive.files.list({
    q: query,
    fields: "files(id, name)",
    spaces: "drive",
  });

  const folders = response.data.files;
  if (folders && folders.length > 0) {
    return folders[0].id!;
  }

  const createResponse = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id",
  });

  return createResponse.data.id!;
}

/**
 * Resolves the final folder ID based on category and options
 */
async function resolveDrivePath(
  drive: drive_v3.Drive,
  rootId: string,
  category: string,
  options: { ownerUid?: string; applicationId?: string; brandId?: string }
): Promise<{ folderId: string; folderPath: string }> {
  let pathSegments: string[] = [];

  switch (category) {
    case "profile_photo":
    case "ktp":
    case "npwp":
    case "bpjs":
    case "bank_proof":
      if (!options.ownerUid) throw new Error("ownerUid is required for employee profiles");
      pathSegments = ["employee_profiles", options.ownerUid, category];
      break;

    case "cv":
    case "ijazah":
    case "sertifikat":
      if (!options.ownerUid) throw new Error("ownerUid is required for candidate docs");
      pathSegments = ["candidate_docs", options.ownerUid, category];
      break;

    case "offering":
      if (!options.applicationId) throw new Error("applicationId is required for offerings");
      pathSegments = ["offerings", options.applicationId];
      break;

    case "offering_template":
      if (!options.brandId) throw new Error("brandId is required for offering templates");
      pathSegments = ["offering_templates", options.brandId];
      break;

    case "overtime":
      if (!options.ownerUid) throw new Error("ownerUid is required for overtime");
      pathSegments = ["overtime_attachments", options.ownerUid];
      break;

    case "leave":
      if (!options.ownerUid) throw new Error("ownerUid is required for leave");
      pathSegments = ["leave_attachments", options.ownerUid];
      break;

    case "permission":
      if (!options.ownerUid) throw new Error("ownerUid is required for permission");
      pathSegments = ["permission_attachments", options.ownerUid];
      break;

    case "logo":
      pathSegments = ["ecosystem_assets", "logos"];
      break;

    case "section_asset":
      pathSegments = ["ecosystem_assets", "sections"];
      break;

    default:
      // Default to root if no category
      return { folderId: rootId, folderPath: "/" };
  }

  let currentParentId = rootId;
  for (const segment of pathSegments) {
    currentParentId = await getOrCreateFolder(drive, currentParentId, segment);
  }

  return { 
    folderId: currentParentId, 
    folderPath: pathSegments.join("/") 
  };
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const userId = formData.get("userId") as string;
    
    // Stage 2 fields
    const category = formData.get("category") as string;
    const ownerUid = formData.get("ownerUid") as string;
    const applicationId = formData.get("applicationId") as string;
    const brandId = formData.get("brandId") as string;

    if (!file) {
      return NextResponse.json({ success: false, message: "File tidak ditemukan" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ success: false, message: "Ukuran file melebihi 1 MB" }, { status: 400 });
    }

    // Google Drive Authentication ENV
    console.log("Google Drive ENV Check:", {
      hasClientEmail: !!process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
      hasPrivateKey: !!process.env.GOOGLE_DRIVE_PRIVATE_KEY,
      hasRootFolderId: !!process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID,
      privateKeyLength: process.env.GOOGLE_DRIVE_PRIVATE_KEY?.length || 0,
    });

    const clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
    const privateKeyRaw = process.env.GOOGLE_DRIVE_PRIVATE_KEY;
    const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;

    // Detailed server-side check
    if (!clientEmail || !privateKeyRaw || !rootFolderId) {
      console.error("CRITICAL: Missing Google Drive credentials at runtime");
    }

    // 1. Check for missing ENV
    const missingEnv: string[] = [];
    if (!clientEmail) missingEnv.push("GOOGLE_DRIVE_CLIENT_EMAIL");
    if (!privateKeyRaw) missingEnv.push("GOOGLE_DRIVE_PRIVATE_KEY");
    if (!rootFolderId) missingEnv.push("GOOGLE_DRIVE_ROOT_FOLDER_ID");

    if (missingEnv.length > 0) {
      return NextResponse.json({ 
        success: false,
        message: "Konfigurasi Google Drive belum lengkap",
        missingEnv: missingEnv
      }, { status: 500 });
    }

    // 2. Check for placeholder values
    if (privateKeyRaw && (privateKeyRaw.includes("ISI_PRIVATE_KEY") || privateKeyRaw.includes("PLACEHOLDER"))) {
      return NextResponse.json({ 
        success: false,
        message: "GOOGLE_DRIVE_PRIVATE_KEY masih placeholder"
      }, { status: 500 });
    }

    // Process private key
    const privateKey = privateKeyRaw!.replace(/\\n/g, "\n");

    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/drive"],
    });

    const drive = google.drive({ version: "v3", auth });

    // Resolve target folder (Stage 2)
    let targetFolderId = rootFolderId!;
    let driveFolderPath = "/";
    
    try {
      if (category) {
        const resolved = await resolveDrivePath(drive, rootFolderId!, category, {
          ownerUid,
          applicationId,
          brandId,
        });
        targetFolderId = resolved.folderId;
        driveFolderPath = resolved.folderPath;
      }
    } catch (err: any) {
      console.error("Folder resolution error:", err);
      return NextResponse.json({ 
        success: false,
        message: `Gagal memproses folder tujuan: ${err.message}`,
        details: "Pastikan Folder ID benar dan Service Account memiliki akses 'Editor'."
      }, { status: 400 });
    }

    // Convert File to Buffer then to Readable Stream
    const buffer = Buffer.from(await file.arrayBuffer());
    const bufferStream = new Readable();
    bufferStream.push(buffer);
    bufferStream.push(null);

    const driveResponse = await drive.files.create({
      requestBody: {
        name: file.name,
        parents: [targetFolderId],
      },
      media: {
        mimeType: file.type,
        body: bufferStream,
      },
      fields: "id, name, size, mimeType, webViewLink",
    });

    const driveFile = driveResponse.data;

    return NextResponse.json({
      success: true,
      fileId: driveFile.id,
      fileName: driveFile.name,
      fileSize: parseInt(driveFile.size || "0"),
      fileType: driveFile.mimeType,
      driveFolderId: targetFolderId,
      driveFolderPath: driveFolderPath,
      webViewLink: driveFile.webViewLink,
      uploadedBy: userId,
    });

  } catch (error: any) {
    console.error("Google Drive Upload API Error:", error);
    
    let message = "Terjadi kesalahan server saat upload";
    let status = 500;

    if (error.message?.includes("invalid_grant") || error.message?.includes("PEM routines")) {
      message = "Google Drive Error: Private Key tidak valid atau salah format";
    } else if (error.message?.includes("access_denied") || error.code === 403) {
      message = "Google Drive Access Denied. Cek apakah service account sudah Editor pada root folder dan scope API menggunakan https://www.googleapis.com/auth/drive.";
    } else if (error.message?.includes("File not found") || error.code === 404) {
      message = "Google Drive Error: Root folder ID tidak ditemukan atau tidak valid";
    } else if (error.code === 'ENOTFOUND') {
      message = "Network Error: Tidak dapat menghubungi server Google API";
    } else {
      message = error.message || message;
    }

    return NextResponse.json(
      { success: false, message, error: error.message },
      { status: status }
    );
  }
}
