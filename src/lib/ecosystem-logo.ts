/**
 * Ecosystem Company Logo Utilities
 * Centralized logo handling untuk Detail, Tabel, Landing Page
 * Semua render logo harus melalui helper ini
 */

/**
 * Extract Google Drive file ID dari berbagai format URL
 */
export function extractGoogleDriveFileId(url?: string | null): string | null {
  if (!url) return null;

  const patterns = [
    /\/file\/d\/([^/]+)/,      // /file/d/FILE_ID/view
    /id=([^&]+)/,               // ?id=FILE_ID
    /\/d\/([^/]+)/,             // /d/FILE_ID
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
}

/**
 * Get local company logo fallback berdasarkan nama
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
 * Get safe image src untuk company logo via API proxy
 * Prioritas: driveFileId → extracted fileId → direct URL → fallback
 */
export function getCompanyLogoSrc(company: any): string {
  if (!company) return getLocalCompanyLogo("");

  // 1. Try various fileId field names
  const fileId =
    company.driveFileId ||
    company.iconFileId ||
    company.logoFileId ||
    company.fileId ||
    extractGoogleDriveFileId(company.iconUrl) ||
    extractGoogleDriveFileId(company.logoUrl) ||
    extractGoogleDriveFileId(company.driveViewUrl) ||
    extractGoogleDriveFileId(company.webViewLink);

  // 2. If we have a file ID, use proxy API
  if (fileId) {
    return `/api/storage/google-drive-image?fileId=${encodeURIComponent(fileId)}`;
  }

  // 3. Check raw URL
  const rawUrl = company.iconUrl || company.logoUrl || "";

  // 4. Skip Firebase Storage old URLs
  if (rawUrl.includes("firebasestorage.googleapis.com")) {
    return getLocalCompanyLogo(company.name || company.companyName);
  }

  // 5. If it's a direct URL (not Drive), use it
  if (rawUrl && !rawUrl.includes("drive.google.com")) {
    return rawUrl;
  }

  // 6. Default: fallback local logo
  return getLocalCompanyLogo(company.name || company.companyName);
}

/**
 * Get Google Drive view URL (untuk link ke Drive file, bukan src image)
 */
export function getGoogleDriveViewUrl(company: any): string | null {
  return company.driveViewUrl || company.iconUrl || null;
}

/**
 * Get render URL untuk display di UI
 * Combines fileId + API endpoint
 */
export function getCompanyLogoRenderUrl(company: any): string {
  const fileId =
    company.driveFileId ||
    company.iconFileId ||
    company.logoFileId ||
    company.fileId ||
    extractGoogleDriveFileId(company.iconUrl) ||
    extractGoogleDriveFileId(company.logoUrl) ||
    extractGoogleDriveFileId(company.driveViewUrl);

  if (fileId) {
    return `/api/storage/google-drive-image?fileId=${encodeURIComponent(fileId)}`;
  }

  return "";
}

/**
 * Format URL untuk display (short version)
 */
export function formatUrlForDisplay(url?: string, maxLength: number = 50): string {
  if (!url) return "N/A";
  if (url.length <= maxLength) return url;
  return url.substring(0, maxLength) + "...";
}

/**
 * Check if company has valid logo
 */
export function hasValidLogo(company: any): boolean {
  const fileId =
    company.driveFileId ||
    company.iconFileId ||
    company.logoFileId ||
    company.fileId ||
    extractGoogleDriveFileId(company.iconUrl) ||
    extractGoogleDriveFileId(company.logoUrl);

  return !!fileId;
}

/**
 * Get logo source description (untuk info di UI)
 */
export function getLogoSourceDescription(company: any): string {
  const fileId =
    company.driveFileId ||
    company.iconFileId ||
    company.logoFileId ||
    company.fileId ||
    extractGoogleDriveFileId(company.iconUrl) ||
    extractGoogleDriveFileId(company.logoUrl);

  if (fileId) {
    return "Google Drive";
  }

  const rawUrl = company.iconUrl || company.logoUrl || "";
  if (rawUrl.includes("firebasestorage.googleapis.com")) {
    return "Firebase (Legacy)";
  }

  if (rawUrl) {
    return "External URL";
  }

  return "Fallback Local";
}

/**
 * CSS classes untuk berbagai ukuran logo
 */
export const LOGO_SIZES = {
  // Landing page: besar dan rapi
  landing: "h-20 md:h-24 max-w-[240px] w-auto object-contain opacity-80 group-hover:opacity-100 transition-opacity",
  landingContainer: "h-28 flex items-center justify-center",

  // Detail modal: preview besar dan jelas
  detail: "max-h-28 max-w-[320px] w-auto object-contain",
  detailContainer: "flex min-h-[180px] items-center justify-center bg-slate-100 rounded-lg border border-border",

  // Table admin: kecil dan optional
  table: "h-8 w-20 object-contain",
};
