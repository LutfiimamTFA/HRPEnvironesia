/**
 * Extract Google Drive file ID dari berbagai format URL
 */
export function extractDriveFileId(url: string | null | undefined): string | null {
  if (!url) return null;

  try {
    // Pattern 1: https://drive.google.com/file/d/FILE_ID/view
    const match1 = String(url).match(/\/file\/d\/([a-zA-Z0-9-_]+)/);
    if (match1?.[1]) return match1[1];

    // Pattern 2: https://drive.google.com/uc?id=FILE_ID
    const match2 = String(url).match(/[?&]id=([a-zA-Z0-9-_]+)/);
    if (match2?.[1]) return match2[1];

    return null;
  } catch (error) {
    console.error('Error extracting Drive file ID:', error, url);
    return null;
  }
}

/**
 * Get attendance image URL untuk embed di <img>
 * Menggunakan API lokal proxy di HRP yang membaca dari Google Drive via Apps Script
 *
 * Flow:
 * 1. Extract driveFileId dari event
 * 2. Return `/api/attendance-photo?fileId=...`
 * 3. API route proxy ke Apps Script
 * 4. Apps Script ambil file dari Google Drive dan return base64
 * 5. API route convert base64 menjadi image dan return ke browser
 */
export function getAttendanceImageUrl(event: any): string | null {
  if (!event) return null;

  const evidence = event?.evidence || {};

  // Priority 1: Use driveFileId - paling reliable
  const driveFileId =
    evidence.driveFileId ||
    event.driveFileId ||
    extractDriveFileId(evidence.driveViewUrl) ||
    extractDriveFileId(evidence.driveDownloadUrl) ||
    extractDriveFileId(evidence.selfieUrl) ||
    extractDriveFileId(event.photoUrl);

  if (driveFileId) {
    // Return HRP API lokal proxy URL
    // API route akan handle komunikasi dengan Google Drive via Apps Script
    return `/api/attendance-photo?fileId=${encodeURIComponent(driveFileId)}`;
  }

  // Priority 2: Fallback ke direct URLs (untuk non-Google Drive sources)
  if (evidence.driveDownloadUrl && !evidence.driveDownloadUrl.includes("drive.google.com")) {
    return evidence.driveDownloadUrl;
  }

  if (evidence.watermarkedSelfieUrl && !evidence.watermarkedSelfieUrl.includes("drive.google.com")) {
    return evidence.watermarkedSelfieUrl;
  }

  if (evidence.selfieUrl && !evidence.selfieUrl.includes("drive.google.com")) {
    return evidence.selfieUrl;
  }

  if (event.photoUrl && !event.photoUrl.includes("drive.google.com")) {
    return event.photoUrl;
  }

  return null;
}

/**
 * Get Google Drive link untuk fallback "buka di Drive"
 */
export function getGoogleDriveLink(event: any): string | null {
  if (!event) return null;

  const evidence = event?.evidence || {};
  const fileId = evidence.driveFileId || extractDriveFileId(evidence.driveViewUrl);

  if (fileId) {
    return `https://drive.google.com/file/d/${fileId}/view`;
  }

  return null;
}

/**
 * Convert Google Drive URLs to direct image URLs that can be embedded
 * @deprecated Use getAttendanceImageUrl instead for attendance photos
 */
export function convertGoogleDriveUrlToImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  try {
    const fileId = extractDriveFileId(url);
    if (fileId) {
      return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;
    }

    // If it's already a direct image URL (not Google Drive), return as is
    if (url.startsWith('http') && !url.includes('drive.google.com')) {
      return url;
    }

    return null;
  } catch (error) {
    console.error('Error converting Google Drive URL:', error, url);
    return null;
  }
}

/**
 * Get best image URL with fallback chain
 * @deprecated Use getAttendanceImageUrl instead
 */
export function getBestImageUrl(event: any): string | null {
  return getAttendanceImageUrl(event);
}
