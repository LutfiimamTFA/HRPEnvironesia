/**
 * Google Drive Image Handling Utilities
 * Provides safe image URL generation for Google Drive files
 * via local API proxy instead of direct Drive URLs
 */

/**
 * Extract Google Drive file ID from various URL formats
 */
export function extractGoogleDriveFileId(url?: string | null): string | null {
  if (!url) return null;

  const patterns = [
    /\/file\/d\/([^/]+)/,        // /file/d/FILE_ID/view
    /[?&]id=([^&]+)/,             // ?id=FILE_ID or &id=FILE_ID
    /\/d\/([^/]+)/,                // /d/FILE_ID (generic)
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
}

/**
 * Get safe image src for company logo
 * Prioritizes: driveFileId → extracted fileId → direct URL → fallback local
 * Uses local API proxy for Google Drive files
 */
export function getCompanyLogoSrc(company: any): string {
  if (!company) return getLocalCompanyLogo("");

  // 1. Try to get driveFileId from various field names
  const fileId =
    company.driveFileId ||
    company.iconFileId ||
    company.logoFileId ||
    extractGoogleDriveFileId(company.iconUrl) ||
    extractGoogleDriveFileId(company.logoUrl) ||
    extractGoogleDriveFileId(company.driveViewUrl);

  // 2. If we have a file ID, use proxy API
  if (fileId) {
    return `/api/storage/google-drive-image?fileId=${encodeURIComponent(fileId)}`;
  }

  // 3. Check if we have a raw URL (not Google Drive)
  const rawUrl = company.iconUrl || company.logoUrl || "";

  // 4. Skip Firebase Storage old URLs (quota issues)
  if (rawUrl.includes("firebasestorage.googleapis.com")) {
    return getLocalCompanyLogo(company.name || company.companyName);
  }

  // 5. If URL is not a Google Drive /view URL, it might be a direct URL
  if (rawUrl && !rawUrl.includes("drive.google.com/file/d/")) {
    return rawUrl;
  }

  // 6. Fallback to local logo
  return getLocalCompanyLogo(company.name || company.companyName);
}

/**
 * Get local fallback logo based on company name
 */
export function getLocalCompanyLogo(name?: string): string {
  const lower = String(name || "").toLowerCase();

  if (lower.includes("greenlab")) return "/images/greenlab-logo.png";
  if (lower.includes("bikin")) return "/images/bikin-logo.png";
  if (lower.includes("greenskill")) return "/images/greenskill-logo.png";
  if (lower.includes("lsp")) return "/images/lsp-logo.png";
  if (lower.includes("environesia")) return "/images/hrp-logo.svg";

  return "/images/hrp-logo.svg";
}

/**
 * Check if URL is a direct image URL (safe to use)
 */
export function isDirectImageUrl(url?: string): boolean {
  if (!url) return false;
  return (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("/")
  ) && !url.includes("drive.google.com/file/d/");
}

/**
 * Check if URL is Google Drive /view URL (unsafe for img src)
 */
export function isGoogleDriveViewUrl(url?: string): boolean {
  if (!url) return false;
  return url.includes("drive.google.com/file/d/") && url.includes("/view");
}
