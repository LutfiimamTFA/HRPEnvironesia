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
 * 1. Extract driveFileId dari event dengan multiple fallback
 * 2. Return `/api/attendance-photo?fileId=...`
 * 3. API route proxy ke Apps Script
 * 4. Apps Script ambil file dari Google Drive dan return base64
 * 5. API route convert base64 menjadi image dan return ke browser
 */
export function getAttendanceImageUrl(event: any): string | null {
  if (!event) return null;

  // Debug: log available fields
  if (typeof window !== "undefined" && window.__DEBUG_ATTENDANCE__) {
    console.log("[AttendanceImage] Available fields in event:", {
      event_keys: Object.keys(event),
      evidence_keys: Object.keys(event?.evidence || {}),
      photo_keys: Object.keys(event?.photo || {}),
      event_driveFileId: event?.driveFileId,
      event_fileId: event?.fileId,
      event_photoFileId: event?.photoFileId,
      evidence_driveFileId: event?.evidence?.driveFileId,
      evidence_fileId: event?.evidence?.fileId,
      photo_fileId: event?.photo?.fileId,
    });
  }

  const evidence = event?.evidence || {};
  const photo = event?.photo || {};

  // Priority 1: Check all possible fileId fields
  // Different sources may store fileId in different locations
  const driveFileId =
    // Direct fields on event
    event.driveFileId ||
    event.fileId ||
    event.photoFileId ||
    // Fields in evidence object
    evidence.driveFileId ||
    evidence.fileId ||
    evidence.photoFileId ||
    // Fields in photo object (nested)
    photo.fileId ||
    photo.driveFileId ||
    // Extract from URLs
    extractDriveFileId(evidence.driveViewUrl) ||
    extractDriveFileId(evidence.driveDownloadUrl) ||
    extractDriveFileId(evidence.thumbnailUrl) ||
    extractDriveFileId(evidence.directUrl) ||
    extractDriveFileId(evidence.viewUrl) ||
    extractDriveFileId(evidence.downloadUrl) ||
    extractDriveFileId(evidence.watermarkedSelfieUrl) ||
    extractDriveFileId(evidence.selfieUrl) ||
    extractDriveFileId(event.photoUrl) ||
    extractDriveFileId(event.selfieUrl);

  if (driveFileId) {
    // Return HRP API lokal proxy URL
    // API route akan handle komunikasi dengan Google Drive via Apps Script
    const apiUrl = `/api/attendance-photo?fileId=${encodeURIComponent(driveFileId)}`;
    if (typeof window !== "undefined" && window.__DEBUG_ATTENDANCE__) {
      console.log("[AttendanceImage] Using fileId:", driveFileId);
    }
    return apiUrl;
  }

  // Priority 2: Check for direct URLs (thumbnailUrl, directUrl, downloadUrl)
  // These might be direct image URLs without needing Google Drive
  const directUrl =
    evidence.thumbnailUrl ||
    evidence.directUrl ||
    evidence.downloadUrl ||
    evidence.viewUrl ||
    evidence.watermarkedSelfieUrl ||
    evidence.selfieUrl ||
    event.photoUrl;

  if (directUrl && directUrl.trim()) {
    // Only use if it's a valid URL
    try {
      new URL(directUrl);
      if (typeof window !== "undefined" && window.__DEBUG_ATTENDANCE__) {
        console.log("[AttendanceImage] Using direct URL:", directUrl.substring(0, 50) + "...");
      }
      return directUrl;
    } catch {
      // Invalid URL, continue
    }
  }

  if (typeof window !== "undefined" && window.__DEBUG_ATTENDANCE__) {
    console.warn("[AttendanceImage] No valid image URL found in event", event);
  }
  return null;
}

/**
 * Get an embeddable <img> src for a "kondisi khusus" condition report's proof
 * photo — mirrors getAttendanceImageUrl's Drive-proxy pattern above rather
 * than ever pointing <img> straight at a Drive webViewLink/share URL (those
 * require the viewer to be signed into the same Google account and fail
 * silently in an <img> tag). Reuses the same /api/attendance-photo proxy
 * (already validates the requester and fetches the file server-side via the
 * app's existing Drive access) instead of a separate route, since the two
 * proxy the exact same thing — a Drive file by id.
 */
export function getConditionProofImageSrc(report: any): string | null {
  if (!report) return null;
  const attachment = report.attachments?.[0] || {};
  // Web Absen may nest the condition report under the event instead of
  // flattening it (attendance_condition_reports doc doesn't exist as a
  // separate collection in this app yet, so whatever shape it wrote ends up
  // nested on the event as `conditionReport`).
  const nested = report.conditionReport || {};
  const nestedAttachment = nested.attachments?.[0] || {};

  // IMPORTANT: never read report.photoUrl / report.selfieUrl / report.driveFileId /
  // report.fileId / report.evidence.* here. This function is sometimes handed the
  // same tap-in/tap-out event object getAttendanceImageUrl() already reads (there is
  // no dedicated attendance_condition_reports collection yet) — reusing those shared
  // fields silently resolved the condition photo to the Foto Tap In photo.
  // Only condition-specific field names (top-level, nested `conditionReport`, or
  // `condition`-prefixed on the event) are used below.
  const driveFileId: string | null =
    attachment.driveFileId ||
    nestedAttachment.driveFileId ||
    extractDriveFileId(report.driveWebViewLink) ||
    extractDriveFileId(report.driveWebContentLink) ||
    extractDriveFileId(report.proofPhotoUrl) ||
    extractDriveFileId(report.conditionProofPhotoUrl) ||
    extractDriveFileId(report.reportProofPhotoUrl) ||
    extractDriveFileId(report.conditionPhotoUrl) ||
    extractDriveFileId(report.evidencePhotoUrl) ||
    extractDriveFileId(report.evidenceUrl) ||
    extractDriveFileId(report.conditionEvidenceUrl) ||
    extractDriveFileId(report.specialConditionPhotoUrl) ||
    extractDriveFileId(attachment.fileUrl) ||
    extractDriveFileId(attachment.url) ||
    extractDriveFileId(attachment.downloadUrl) ||
    extractDriveFileId(report.attachmentUrls?.[0]) ||
    extractDriveFileId(report.conditionAttachmentUrls?.[0]) ||
    extractDriveFileId(nested.proofPhotoUrl) ||
    extractDriveFileId(nested.conditionPhotoUrl) ||
    extractDriveFileId(nested.evidencePhotoUrl) ||
    extractDriveFileId(nested.photoUrl) ||
    extractDriveFileId(nested.imageUrl) ||
    extractDriveFileId(nestedAttachment.fileUrl) ||
    extractDriveFileId(nested.attachmentUrls?.[0]) ||
    null;

  if (driveFileId) {
    return `/api/attendance-photo?fileId=${encodeURIComponent(driveFileId)}`;
  }

  // Not a Drive link (or no fileId could be extracted) — safe to use directly,
  // e.g. a Firebase Storage download URL.
  const directUrl: string =
    report.proofPhotoUrl ||
    report.conditionProofPhotoUrl ||
    report.reportProofPhotoUrl ||
    report.conditionPhotoUrl ||
    report.evidencePhotoUrl ||
    report.evidenceUrl ||
    report.conditionEvidenceUrl ||
    report.specialConditionPhotoUrl ||
    attachment.fileUrl ||
    attachment.url ||
    attachment.downloadUrl ||
    report.attachmentUrls?.[0] ||
    report.conditionAttachmentUrls?.[0] ||
    nested.proofPhotoUrl ||
    nested.conditionPhotoUrl ||
    nested.evidencePhotoUrl ||
    nested.photoUrl ||
    nested.imageUrl ||
    nestedAttachment.fileUrl ||
    nestedAttachment.url ||
    nested.attachmentUrls?.[0] ||
    '';

  return directUrl || null;
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
