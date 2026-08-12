"use client";

/**
 * Evidence preview for Pengajuan Lembur's detail modal.
 *
 * /api/storage/view?fileId=... accepts a Firebase ID token via the
 * Authorization header (see src/app/api/storage/view/route.ts) — evidence
 * must never be rendered as a plain <a href>/<img src> pointed at that url,
 * since a link navigation or <img> tag never attaches that header. The fix
 * is client-side: fetch the file with the token, turn it into a blob, and
 * only ever display/navigate to the resulting blob: URL. Mirrors the same
 * pattern already used by src/components/SecureDriveImage.tsx.
 *
 * The route's non-privileged ownership check only ever looked at
 * employee_profiles/profiles/applications — overtime evidence lives on
 * overtime_submissions, which it never checked, so every overtime evidence
 * file 403'd even for the submitter themselves. Passing submissionId+type
 * lets the route look the submission up directly instead of relying on that
 * heuristic scan.
 */

import { useEffect, useState } from "react";
import { getAuth } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  FileText, Loader2, X, ZoomIn, ZoomOut, RotateCcw, Download, ExternalLink, ImageOff,
} from "lucide-react";

export type EvidenceSource = "submission" | "attachment" | "job";

export type EvidenceItem = {
  name: string;
  url: string;
  mimeType?: string;
  jobTitle?: string;
  source?: EvidenceSource;
};

export function isImageEvidence(file: { mimeType?: string; name?: string }): boolean {
  const mime = String(file.mimeType || "").toLowerCase();
  const name = String(file.name || "").toLowerCase();
  return mime.startsWith("image/") || /\.(jpe?g|png|webp|gif)$/i.test(name);
}

export function getEvidenceSourceLabel(file: EvidenceItem): string {
  if (file.source === "job" && file.jobTitle) return `Pekerjaan: ${file.jobTitle}`;
  return "Lampiran Utama";
}

function isProtectedStorageViewUrl(url: string): boolean {
  return typeof url === "string" && url.startsWith("/api/storage/view");
}

/** Appends submissionId/type=overtime so the API can look the submission up
 * directly instead of relying on its generic (and, for this collection,
 * previously non-existent) ownership scan. */
function withOvertimeContext(url: string, submissionId?: string): string {
  if (!submissionId || !isProtectedStorageViewUrl(url)) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}submissionId=${encodeURIComponent(submissionId)}&type=overtime`;
}

// Keyed by the context-qualified url — evidence items only ever carry the
// full /api/storage/view?fileId=... url (uploadFile() never stores a bare
// fileId on the submission doc), so the url itself is already a stable
// cache key. Caching the in-flight Promise (not just the resolved value)
// also dedupes concurrent callers — the same file's thumbnail and lightbox
// can both mount around the same time.
const evidenceBlobUrlCache = new Map<string, Promise<string>>();

export async function fetchProtectedFileBlobUrl(url: string, submissionId?: string): Promise<string> {
  const requestUrl = withOvertimeContext(url, submissionId);
  const cached = evidenceBlobUrlCache.get(requestUrl);
  if (cached) return cached;

  const promise = (async () => {
    const auth = getAuth();
    const token = await auth.currentUser?.getIdToken();
    if (!token) {
      throw new Error("Sesi login tidak valid. Silakan login ulang.");
    }
    const response = await fetch(requestUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(text || `Gagal membuka file bukti (${response.status}).`);
    }
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  })();

  evidenceBlobUrlCache.set(requestUrl, promise);
  promise.catch(() => evidenceBlobUrlCache.delete(requestUrl));
  return promise;
}

/** Resolves the url a click should actually navigate to — the raw url for
 * public/signed links, a freshly-fetched blob url for protected ones. */
async function resolveOpenableUrl(file: EvidenceItem, submissionId?: string): Promise<string> {
  return isProtectedStorageViewUrl(file.url) ? fetchProtectedFileBlobUrl(file.url, submissionId) : file.url;
}

function getEvidenceKey(file: { url?: string; name?: string }): string {
  return file.url || file.name || "";
}

type OvertimeEvidenceSubmission = {
  evidenceFiles?: Array<{ name?: string; url: string; mimeType?: string }>;
  attachments?: Array<string | { name?: string; fileName?: string; url?: string; fileUrl?: string; mimeType?: string }>;
  jobs?: Array<{ id?: string; title?: string; evidenceFiles?: Array<{ name?: string; url: string; mimeType?: string }> }>;
};

// Combines evidenceFiles + attachments + every job's evidenceFiles into one
// deduped list — attachments on this feature are always url-only mirrors of
// evidenceFiles (see combinedAttachments in OvertimeSubmissionForm.tsx), and
// evidenceFiles (top-level) is already a flattened union of every job's
// evidence, so naively concatenating all three would show most files 2-3x
// over. Jobs are processed FIRST so a file tied to a job keeps its
// source:"job"/jobTitle (used for the "Pekerjaan: X" label and by
// collectSubmissionOnlyEvidence below) instead of being claimed by the
// top-level mirror first and losing that context.
export function collectOvertimeEvidence(submission: OvertimeEvidenceSubmission): EvidenceItem[] {
  const map = new Map<string, EvidenceItem>();
  const add = (file: EvidenceItem | null) => {
    if (!file || !file.url) return;
    const key = getEvidenceKey(file);
    if (!key || map.has(key)) return;
    map.set(key, file);
  };

  for (const job of submission.jobs || []) {
    for (const file of job.evidenceFiles || []) {
      if (file?.url) add({ name: file.name || file.url, url: file.url, mimeType: file.mimeType, jobTitle: job.title, source: "job" });
    }
  }
  for (const file of submission.evidenceFiles || []) {
    if (file?.url) add({ name: file.name || file.url, url: file.url, mimeType: file.mimeType, source: "submission" });
  }
  for (const raw of submission.attachments || []) {
    const file = typeof raw === "string"
      ? { url: raw, name: raw }
      : { url: raw.url || raw.fileUrl || "", name: raw.name || raw.fileName || raw.url || raw.fileUrl || "", mimeType: raw.mimeType };
    if (file.url) add({ ...file, source: "attachment" });
  }
  return Array.from(map.values());
}

/** One job's own evidence, tagged with source:"job" — for a layout that
 * shows thumbnails grouped under each job (e.g. ReviewOvertimeDialog.tsx's
 * "Output & Bukti per Pekerjaan"). */
export function collectJobEvidence(job: { title?: string; evidenceFiles?: Array<{ name?: string; url: string; mimeType?: string }> }): EvidenceItem[] {
  return (job.evidenceFiles || [])
    .filter((f): f is { name?: string; url: string; mimeType?: string } => !!f?.url)
    .map((f) => ({ name: f.name || f.url, url: f.url, mimeType: f.mimeType, jobTitle: job.title, source: "job" as const }));
}

/** Evidence NOT already shown under a job — for a layout where jobs already
 * render their own thumbnails and a second "all evidence" section should
 * only add genuinely extra, submission-level files (never repeat a file
 * that's already visible under its job). */
export function collectSubmissionOnlyEvidence(submission: OvertimeEvidenceSubmission): EvidenceItem[] {
  return collectOvertimeEvidence(submission).filter((item) => item.source !== "job");
}

/** Job cards show this count instead of their own thumbnails — the same
 * files already render once in section D ("Bukti Pendukung"); a second
 * thumbnail grid per job duplicated every image on screen. */
export function getJobEvidenceCount(job: { evidenceFiles?: Array<{ url?: string }>; evidenceLinks?: string[] }): number {
  return (job.evidenceFiles?.length || 0) + (job.evidenceLinks?.length || 0);
}

export function EvidenceThumbnail({ file, submissionId, onOpen }: { file: EvidenceItem; submissionId?: string; onOpen: (file: EvidenceItem) => void }) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const image = isImageEvidence(file);

  useEffect(() => {
    if (!image) return;
    let cancelled = false;
    setFailed(false);
    if (!isProtectedStorageViewUrl(file.url)) {
      setThumbUrl(file.url);
      return;
    }
    fetchProtectedFileBlobUrl(file.url, submissionId)
      .then((blobUrl) => { if (!cancelled) setThumbUrl(blobUrl); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [file.url, image, submissionId]);

  const sourceLabel = getEvidenceSourceLabel(file);

  if (image) {
    return (
      <button
        type="button"
        onClick={() => onOpen(file)}
        className="group relative aspect-video w-full overflow-hidden rounded-lg border bg-muted text-left"
        title={file.name}
      >
        {failed ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-muted-foreground">
            <ImageOff className="h-5 w-5" />
            <span className="text-[10px]">Gagal memuat</span>
          </div>
        ) : thumbUrl ? (
          <img src={thumbUrl} alt={file.name} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        <span className="absolute inset-x-0 bottom-0 flex flex-col bg-black/60 px-2 py-1 text-white">
          <span className="truncate text-[11px]">{file.name}</span>
          <span className="truncate text-[10px] text-white/70">{sourceLabel}</span>
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(file)}
      className="flex items-center gap-2 rounded-lg border p-2.5 text-left hover:bg-muted/50"
      title={file.name}
    >
      <FileText className="h-6 w-6 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">{file.name}</span>
        <span className="block truncate text-[10px] text-muted-foreground">{sourceLabel} · Buka / Download</span>
      </span>
    </button>
  );
}

export function EvidenceThumbnailGrid({ files, submissionId, onOpen, emptyLabel }: { files: EvidenceItem[]; submissionId?: string; onOpen: (file: EvidenceItem) => void; emptyLabel?: string }) {
  if (files.length === 0) {
    return emptyLabel ? <p className="text-xs text-amber-600">{emptyLabel}</p> : null;
  }
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {files.map((file, i) => (
        <EvidenceThumbnail key={`${file.url}-${i}`} file={file} submissionId={submissionId} onOpen={onOpen} />
      ))}
    </div>
  );
}

/** Opens non-image evidence in a new tab. window.open() is called
 * synchronously (before the token fetch) so popup blockers still treat it as
 * a direct response to the click — calling it only after an `await` gets
 * silently blocked in Chrome/Firefox since the async gap breaks the
 * "user gesture" chain. */
export async function openEvidenceInNewTab(
  file: EvidenceItem,
  onError: (message: string) => void,
  submissionId?: string,
) {
  const win = typeof window !== "undefined" ? window.open("", "_blank") : null;
  try {
    const openableUrl = await resolveOpenableUrl(file, submissionId);
    if (win) win.location.href = openableUrl;
    else window.open(openableUrl, "_blank", "noopener,noreferrer");
  } catch (e: any) {
    win?.close();
    onError(e?.message || "Bukti belum bisa ditampilkan. Silakan login ulang atau coba buka kembali.");
  }
}

export function EvidenceLightbox({ file, submissionId, onClose, onError }: { file: EvidenceItem | null; submissionId?: string; onClose: () => void; onError: (message: string) => void }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    setBlobUrl(null);
    setError(null);
    setZoom(1);
    if (!file) return;
    let cancelled = false;
    resolveOpenableUrl(file, submissionId)
      .then((url) => { if (!cancelled) setBlobUrl(url); })
      .catch((e: any) => { if (!cancelled) setError(e?.message || "Bukti belum bisa ditampilkan. Silakan login ulang atau coba buka kembali."); });
    return () => { cancelled = true; };
  }, [file, submissionId]);

  if (!file) return null;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-5xl w-[92vw] max-h-[90vh] overflow-hidden border-none bg-black/95 p-0 text-white">
        <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-black/80 px-4 py-3">
          <DialogTitle className="truncate text-sm font-normal leading-none tracking-normal text-white">{file.name}</DialogTitle>
          <div className="flex shrink-0 items-center gap-1">
            <Button type="button" size="icon" variant="ghost" className="text-white hover:bg-white/10" disabled={!blobUrl} onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100))}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button type="button" size="icon" variant="ghost" className="text-white hover:bg-white/10" disabled={!blobUrl} onClick={() => setZoom(1)}>
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button type="button" size="icon" variant="ghost" className="text-white hover:bg-white/10" disabled={!blobUrl} onClick={() => setZoom((z) => Math.min(3, Math.round((z + 0.25) * 100) / 100))}>
              <ZoomIn className="h-4 w-4" />
            </Button>
            {blobUrl && (
              <Button type="button" size="icon" variant="ghost" className="text-white hover:bg-white/10" asChild>
                <a href={blobUrl} download={file.name}><Download className="h-4 w-4" /></a>
              </Button>
            )}
            <Button type="button" size="icon" variant="ghost" className="text-white hover:bg-white/10" disabled={!blobUrl} onClick={() => window.open(blobUrl!, "_blank", "noopener,noreferrer")}>
              <ExternalLink className="h-4 w-4" />
            </Button>
            <Button type="button" size="icon" variant="ghost" className="text-white hover:bg-white/10" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex items-center justify-center overflow-auto bg-black" style={{ maxHeight: "calc(90vh - 57px)", minHeight: "50vh" }}>
          {error ? (
            <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-white/80">
              <ImageOff className="h-8 w-8" />
              <p>{error}</p>
              <Button type="button" size="sm" variant="secondary" onClick={() => { onError(error); onClose(); }}>Tutup</Button>
            </div>
          ) : blobUrl ? (
            <img
              src={blobUrl}
              alt={file.name}
              style={{ transform: `scale(${zoom})`, transition: "transform 0.15s ease", maxWidth: "100%", maxHeight: "80vh", objectFit: "contain" }}
            />
          ) : (
            <Loader2 className="h-8 w-8 animate-spin text-white/70" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
