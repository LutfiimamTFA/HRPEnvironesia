import { getAuth } from "firebase/auth";

export interface OfferingDocumentRef {
  offeringId?: string | null;
  documentUrl?: string | null;
  documentPath?: string | null;
  documentName?: string | null;
}

export function isGoogleDriveUrl(url?: string | null): boolean {
  return !!url && (url.includes("drive.google.com") || url.includes("docs.google.com"));
}

/**
 * Open or download an offering document through the portal API.
 *
 * Uses fetch + Bearer token so the new tab never receives a Drive redirect.
 * The tab opens immediately (synchronous) then navigates to a blob URL once
 * the fetch completes — satisfying the browser popup-blocker requirement.
 */
export async function openOfferingDocument(
  doc: OfferingDocumentRef,
  mode: "preview" | "download" = "preview",
  onError?: (msg: string) => void,
): Promise<void> {
  const { offeringId, documentUrl, documentPath, documentName } = doc;
  const filename = documentName || "Surat_Penawaran.pdf";

  // ── Route through portal API (preferred) ─────────────────────────────────
  if (offeringId) {
    await fetchViaApi(
      `/api/recruitment/offering-file/${offeringId}?mode=${mode}`,
      filename,
      mode,
      onError,
    );
    return;
  }

  // ── Direct Firebase Storage URL (no Google Drive) ─────────────────────────
  if (documentUrl && !isGoogleDriveUrl(documentUrl) && isValidUrl(documentUrl)) {
    if (mode === "download") {
      triggerDownload(documentUrl, filename);
    } else {
      window.open(documentUrl, "_blank", "noopener");
    }
    return;
  }

  // ── Nothing usable ────────────────────────────────────────────────────────
  const msg = documentUrl && isGoogleDriveUrl(documentUrl)
    ? "Dokumen ini masih menggunakan Google Drive. Upload ulang dokumen agar dapat dibuka melalui portal."
    : "Dokumen Surat Penawaran belum tersedia. Silakan hubungi Human Capital.";
  onError?.(msg);
  throw new Error(msg);
}

async function fetchViaApi(
  apiUrl: string,
  filename: string,
  mode: "preview" | "download",
  onError?: (msg: string) => void,
): Promise<void> {
  // Open blank tab immediately (must be synchronous — before any await)
  const newTab = mode === "preview" ? window.open("", "_blank") : null;
  if (newTab) newTab.document.title = "Memuat Surat Penawaran...";

  try {
    // Get Firebase ID token
    const auth = getAuth();
    const currentUser = auth.currentUser;
    if (!currentUser) {
      if (newTab) newTab.close();
      const msg = "Anda belum login. Silakan login kembali.";
      onError?.(msg);
      throw new Error(msg);
    }

    const token = await currentUser.getIdToken();

    const response = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      if (newTab) newTab.close();
      let msg = "Surat Penawaran belum dapat dibuka. Silakan hubungi Human Capital.";
      if (response.status === 401) msg = "Anda belum login. Silakan login kembali.";
      if (response.status === 403) msg = "Anda tidak memiliki akses ke dokumen penawaran ini.";
      if (response.status === 404) msg = "Dokumen Surat Penawaran belum tersedia. Silakan hubungi Human Capital.";
      onError?.(msg);
      throw new Error(msg);
    }

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    if (mode === "download") {
      triggerDownload(blobUrl, filename);
      // Revoke after a short delay to allow download to start
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
    } else {
      if (newTab) {
        newTab.location.href = blobUrl;
      } else {
        // Popup was blocked — fallback
        const fallback = window.open(blobUrl, "_blank", "noopener");
        if (!fallback) {
          onError?.("Browser memblokir tab baru. Izinkan popup untuk situs ini.");
        }
      }
    }
  } catch (err: any) {
    if (newTab) newTab.close();
    const msg = err.message || "Surat Penawaran belum dapat dibuka.";
    onError?.(msg);
    throw new Error(msg);
  }
}

function triggerDownload(url: string, filename: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function isValidUrl(str: string): boolean {
  try {
    const u = new URL(str);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
