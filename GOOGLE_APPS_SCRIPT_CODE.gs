/**
 * Google Apps Script Code.gs untuk Upload Google Drive
 *
 * INSTRUKSI:
 * 1. Buka https://script.google.com
 * 2. Create New Project
 * 3. Beri nama: "HRP Environment Upload Bridge"
 * 4. Copy-paste seluruh code di bawah ke File "Code.gs"
 * 5. Sesuaikan UPLOAD_SECRET dengan value di .env.local GOOGLE_DRIVE_UPLOAD_SECRET
 * 6. Deploy sebagai Web App:
 *    - Deploy > New Deployment > Select Type: Web App
 *    - Execute As: Me (dengan akun yang punya Google Drive folder)
 *    - Who has access: Anyone
 * 7. Copy URL /exec yang keluar (format: https://script.google.com/macros/s/[ID]/exec)
 * 8. Update .env.local dengan GOOGLE_DRIVE_APPS_SCRIPT_URL=[URL dari step 7]
 * 9. Untuk update code selanjutnya, Deploy > Manage Deployments > Edit > Deploy as new version
 */

// ============== CONFIGURATION ==============
const UPLOAD_SECRET = "ISI_DENGAN_SECRET_YANG_SAMA_DI_ENV"; // Ganti dengan secret dari .env.local
const ROOT_FOLDER_ID = "ROOT_FOLDER_ID_DARI_ENV"; // Akan di-pass dari API route

// ============== MAIN HANDLERS ==============
function doGet(e) {
  var action = e.parameter.action;

  // ========== IMAGE RETRIEVAL HANDLER ==========
  if (action === "image") {
    var secret = e.parameter.secret;
    var fileId = e.parameter.fileId;

    // Validate secret
    if (!secret || secret !== UPLOAD_SECRET) {
      return jsonResponse({ success: false, error: "Unauthorized image request" }, 401);
    }

    // Validate fileId
    if (!fileId) {
      return jsonResponse({ success: false, error: "Missing fileId parameter" }, 400);
    }

    try {
      var file = DriveApp.getFileById(fileId);
      var blob = file.getBlob();

      // Encode blob to base64
      var bytes = blob.getBytes();
      var base64 = Utilities.base64Encode(bytes);

      // Return JSON dengan base64 encoded image
      return jsonResponse({
        success: true,
        fileId: fileId,
        fileName: file.getName(),
        mimeType: blob.getContentType(),
        size: bytes.length,
        base64: base64,
      });
    } catch (err) {
      Logger.log("Image retrieval error: " + err.message);
      return jsonResponse({
        success: false,
        error: "File not found or access denied: " + err.message,
      }, 404);
    }
  }

  // ========== DEFAULT HEALTH CHECK ==========
  return jsonResponse({
    success: true,
    message: "Google Drive Upload & Image Proxy endpoint aktif",
  });
}

// ============== HELPER: BUILD FOLDER PATH ==============
function buildFolderPath(category) {
  // Ecosystem company logos - auto create ecosystem_assets/company_logos
  if (category === "ecosystem_logo" || category === "company_logo") {
    return "ecosystem_assets/company_logos";
  }

  // Employee profiles
  if (category === "profile_photo" || category === "ktp" || category === "npwp" ||
      category === "bpjs" || category === "bank_proof") {
    return "employee_profiles";
  }

  // Candidate documents
  if (category === "cv" || category === "ijazah" || category === "sertifikat") {
    return "candidate_docs";
  }

  // Offerings
  if (category === "offering") {
    return "offerings";
  }

  // Offering templates
  if (category === "offering_template") {
    return "offering_templates";
  }

  // Landing page sections assets
  if (category === "section_asset") {
    return "ecosystem_assets/sections";
  }

  // Business trip documents
  if (category === "business_trip_spd") {
    return "business_trip_spd";
  }

  // Default: root folder (no subfolder)
  return "";
}

// ============== HELPER: RESOLVE FOLDER ==============
function resolveFolder(rootFolderId, category, options) {
  options = options || {};
  let path = buildFolderPath(category);

  if (!path) {
    return rootFolderId;
  }

  // Tambahkan subfolder jika ada ownerUid, applicationId, dll
  if (category === "profile_photo" || category === "ktp" || category === "npwp" ||
      category === "bpjs" || category === "bank_proof") {
    if (options.ownerUid) {
      path += "/" + options.ownerUid;
    }
  }

  if (category === "cv" || category === "ijazah" || category === "sertifikat") {
    if (options.ownerUid) {
      path += "/" + options.ownerUid;
    }
  }

  if (category === "offering" || category === "offering_template") {
    if (options.applicationId) {
      path += "/" + options.applicationId;
    }
  }

  // Create folder structure and return final folder ID
  let folders = path.split("/");
  let currentFolderId = rootFolderId;

  for (let i = 0; i < folders.length; i++) {
    let folderName = folders[i];
    if (!folderName) continue;

    try {
      let subFolder = findOrCreateFolder(currentFolderId, folderName);
      currentFolderId = subFolder.getId();
    } catch (err) {
      throw new Error("Gagal navigate/create folder path '" + path + "': " + err.message);
    }
  }

  return currentFolderId;
}

// ============== HELPER: FIND OR CREATE FOLDER ==============
function findOrCreateFolder(parentFolderId, folderName) {
  try {
    let parentFolder = DriveApp.getFolderById(parentFolderId);

    // Search existing folder
    let iterator = parentFolder.getFoldersByName(folderName);
    if (iterator.hasNext()) {
      return iterator.next();
    }

    // Create new folder if not exists
    return parentFolder.createFolder(folderName);
  } catch (err) {
    throw new Error("Gagal create/find folder '" + folderName + "': " + err.message);
  }
}

// ============== MAIN UPLOAD HANDLER ==============
function doPost(e) {
  try {
    // ========== 1. VALIDASI SECRET ==========
    let data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (err) {
      return buildResponse(false, "Payload harus JSON valid.", null, err.message);
    }

    let secret = data.secret;
    if (!secret || secret !== UPLOAD_SECRET) {
      return buildResponse(false, "Secret tidak sesuai atau tidak ada.", null, "Unauthorized");
    }

    // ========== 2. VALIDASI DATA DIPERLUKAN ==========
    if (!data.fileName) {
      return buildResponse(false, "fileName diperlukan.", null, "Missing fileName");
    }

    if (!data.base64) {
      return buildResponse(false, "base64 diperlukan.", null, "Missing base64");
    }

    if (!data.rootFolderId) {
      return buildResponse(false, "rootFolderId diperlukan.", null, "Missing rootFolderId");
    }

    // ========== 3. TANGANI FILE TYPE / MIME TYPE ==========
    // Support both fileType dan mimeType naming (flexible for different client implementations)
    let fileType = data.fileType || data.mimeType || "application/octet-stream";

    // ========== 4. BERSIHKAN BASE64 ==========
    // Handle both raw base64 and data URL format
    let base64 = data.base64;
    if (!base64) {
      return buildResponse(false, "base64 diperlukan.", null, "Missing base64");
    }

    // Remove data URL prefix if present (e.g., "data:image/png;base64,...")
    let cleanBase64 = base64.indexOf(",") >= 0
      ? base64.split(",")[1]
      : base64;

    // ========== 5. DECODE BASE64 DAN BUAT BLOB ==========
    let decodedBytes;
    try {
      decodedBytes = Utilities.base64Decode(cleanBase64);
    } catch (err) {
      return buildResponse(false, "Base64 tidak valid atau rusak.", null, "Base64 decode error: " + err.message);
    }

    let blob = Utilities.newBlob(decodedBytes, fileType, data.fileName);

    // ========== 6. RESOLVE DESTINATION FOLDER ==========
    let category = data.category || "";
    let options = {
      ownerUid: data.ownerUid,
      applicationId: data.applicationId,
      offeringId: data.offeringId,
      brandId: data.brandId
    };

    let destinationFolderId;
    try {
      destinationFolderId = resolveFolder(data.rootFolderId, category, options);
    } catch (err) {
      return buildResponse(false, "Gagal resolve folder destination.", null, err.message);
    }

    // ========== 7. UPLOAD FILE KE GOOGLE DRIVE ==========
    let destinationFolder = DriveApp.getFolderById(destinationFolderId);
    let file;
    try {
      file = destinationFolder.createFile(blob);
    } catch (err) {
      return buildResponse(false, "Gagal upload file ke Google Drive.", null, err.message);
    }

    let fileId = file.getId();

    // ========== 8. SET PERMISSION (PUBLIC) ==========
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (err) {
      // Log warning tapi jangan block - file sudah ada di Drive
      Logger.log("Warning: Gagal set public permission: " + err.message);
    }

    // ========== 9. BUILD COMPLETE RESPONSE ==========
    let webViewLink = "https://drive.google.com/file/d/" + fileId + "/view";
    let driveViewUrl = "https://drive.google.com/file/d/" + fileId + "/view";
    let driveDownloadUrl = "https://drive.google.com/uc?export=download&id=" + fileId;
    let imageUrl = "https://drive.google.com/uc?export=view&id=" + fileId;
    let folderPath = buildFolderPath(category);

    let responseData = {
      success: true,
      fileId: fileId,
      fileName: data.fileName,
      fileType: fileType,
      fileSize: decodedBytes.length,
      driveFolderId: destinationFolderId,
      driveFolderPath: folderPath,
      webViewLink: webViewLink,
      driveViewUrl: driveViewUrl,
      driveDownloadUrl: driveDownloadUrl,
      imageUrl: imageUrl,
      uploadedAt: new Date().toISOString(),
      uploadedBy: data.uploadedBy || "system"
    };

    return ContentService.createTextOutput(JSON.stringify(responseData))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    Logger.log("Unhandled error: " + err.message + "\nStack: " + err.stack);
    return buildResponse(false, "Terjadi kesalahan server saat upload.", null, err.message);
  }
}

// ============== HELPER: BUILD ERROR RESPONSE ==========
function buildResponse(success, message, fileData, error) {
  let response = {
    success: success,
    message: message
  };

  // Add error detail jika ada
  if (error) {
    response.error = String(error);
  }

  // Merge file data jika ada (for success responses)
  if (fileData) {
    Object.assign(response, fileData);
  }

  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============== HELPER: JSON RESPONSE ==========
function jsonResponse(data, statusCode) {
  statusCode = statusCode || 200;

  let output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);

  // Note: Apps Script tidak support custom HTTP status codes di response
  // Status code hanya untuk logging/documentation
  if (statusCode !== 200) {
    Logger.log("Response status: " + statusCode);
  }

  return output;
}

// ============== TEST FUNCTION (untuk debug, run di Apps Script console) ==========
function testUpload() {
  Logger.log("Testing Google Apps Script Upload Bridge...");
  Logger.log("UPLOAD_SECRET configured: " + (UPLOAD_SECRET && UPLOAD_SECRET !== "ISI_DENGAN_SECRET_YANG_SAMA_DI_ENV"));
  Logger.log("ROOT_FOLDER_ID configured: " + (ROOT_FOLDER_ID && ROOT_FOLDER_ID !== "ROOT_FOLDER_ID_DARI_ENV"));
}

// ============== CONFIGURATION CHECK (optional, untuk debug) ==========
function checkConfiguration() {
  let config = {
    uploadSecretConfigured: UPLOAD_SECRET && UPLOAD_SECRET !== "ISI_DENGAN_SECRET_YANG_SAMA_DI_ENV",
    rootFolderConfigured: ROOT_FOLDER_ID && ROOT_FOLDER_ID !== "ROOT_FOLDER_ID_DARI_ENV"
  };
  Logger.log("Configuration Status: " + JSON.stringify(config));
  return config;
}
