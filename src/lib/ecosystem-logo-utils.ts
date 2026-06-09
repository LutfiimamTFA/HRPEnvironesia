/**
 * Utility functions untuk Ecosystem Company Logo preview dan handling
 */

import type { EcosystemCompany } from './types';

/**
 * Get safe logo preview URL
 * - Filter out old Firebase Storage URLs (quota issues)
 * - Use Google Drive URLs if available
 * - Fallback to local company logos
 */
export function getLogoPreviewUrl(company: EcosystemCompany | null | undefined): {
  url: string;
  source: 'google_drive' | 'firebase_old' | 'local_fallback';
  isValid: boolean;
} {
  if (!company) {
    return {
      url: getLocalCompanyLogo(''),
      source: 'local_fallback',
      isValid: false,
    };
  }

  const rawUrl = company.iconUrl || company.logoUrl || '';

  // Check if Firebase Storage old URL (likely to have quota/permission issues)
  if (rawUrl && rawUrl.includes('firebasestorage.googleapis.com')) {
    return {
      url: getLocalCompanyLogo(company.name),
      source: 'firebase_old',
      isValid: false,
    };
  }

  // If valid URL (Google Drive or other), use it
  if (rawUrl && (rawUrl.includes('drive.google.com') || rawUrl.includes('script.google.com') || rawUrl.startsWith('http'))) {
    return {
      url: rawUrl,
      source: 'google_drive',
      isValid: true,
    };
  }

  // Default: use local fallback
  return {
    url: getLocalCompanyLogo(company.name),
    source: 'local_fallback',
    isValid: false,
  };
}

/**
 * Get local company logo based on company name
 * Falls back to HRP logo if no match
 */
export function getLocalCompanyLogo(name: string): string {
  const lower = String(name || '').toLowerCase();

  // Map company names to local logos
  if (lower.includes('greenlab')) return '/images/greenlab-logo.png';
  if (lower.includes('bikin')) return '/images/bikin-logo.png';
  if (lower.includes('greenskill')) return '/images/greenskill-logo.png';
  if (lower.includes('lsp')) return '/images/lsp-logo.png';
  if (lower.includes('environesia')) return '/images/hrp-logo.svg';

  // Default: HRP logo
  return '/images/hrp-logo.svg';
}

/**
 * Get logo source display text
 */
export function getLogoSourceText(source: 'google_drive' | 'firebase_old' | 'local_fallback'): string {
  switch (source) {
    case 'google_drive':
      return 'Sumber: Google Drive';
    case 'firebase_old':
      return 'Sumber: Firebase lama (disarankan upload ulang)';
    case 'local_fallback':
      return 'Sumber: Fallback lokal';
    default:
      return 'Sumber: Tidak diketahui';
  }
}

/**
 * Get logo status text
 */
export function getLogoStatusText(source: 'google_drive' | 'firebase_old' | 'local_fallback'): {
  status: string;
  statusColor: string;
} {
  switch (source) {
    case 'google_drive':
      return {
        status: 'Logo tersimpan di Google Drive',
        statusColor: 'text-green-600',
      };
    case 'firebase_old':
      return {
        status: 'Logo lama dari Firebase (perlu update)',
        statusColor: 'text-amber-600',
      };
    case 'local_fallback':
      return {
        status: 'Menggunakan fallback lokal',
        statusColor: 'text-blue-600',
      };
    default:
      return {
        status: 'Status tidak diketahui',
        statusColor: 'text-gray-600',
      };
  }
}

/**
 * Get short URL display (for showing in UI)
 */
export function getShortUrlDisplay(url: string, maxLength: number = 50): string {
  if (!url) return 'N/A';
  if (url.length <= maxLength) return url;
  return url.substring(0, maxLength) + '...';
}

/**
 * Check if URL is valid Google Drive URL
 */
export function isValidGoogleDriveUrl(url: string): boolean {
  if (!url) return false;
  return url.includes('drive.google.com') || url.includes('script.google.com');
}

/**
 * Extract Google Drive file ID from URL
 */
export function getGoogleDriveFileId(url: string): string | null {
  if (!url) return null;

  // Match patterns like: /file/d/[ID]/view or ?id=[ID]
  const match = url.match(/\/file\/d\/([^/]+)/);
  if (match) return match[1];

  const idMatch = url.match(/[?&]id=([^&]+)/);
  if (idMatch) return idMatch[1];

  return null;
}
