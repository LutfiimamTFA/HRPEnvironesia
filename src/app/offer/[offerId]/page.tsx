"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useDoc, useFirestore, updateDocumentNonBlocking } from "@/firebase";
import { doc, serverTimestamp } from "firebase/firestore";
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { useAuth } from "@/providers/auth-provider";
import type { Offering, JobApplication } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import SafeRichText from "@/components/ui/SafeRichText";
import {
  CheckCircle,
  Clock,
  Calendar,
  MapPin,
  Eye,
  FileText,
  Download,
  Upload,
  Phone,
  ChevronDown,
} from "lucide-react";
import { format, differenceInSeconds } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { openOfferingDocument } from "@/lib/offering-file-utils";

const ACCEPTED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

function useCountdown(deadline: Date) {
  const calc = () => Math.max(0, differenceInSeconds(deadline, new Date()));
  const [secs, setSecs] = useState(calc);
  useEffect(() => {
    const t = setInterval(() => setSecs(calc()), 1000);
    return () => clearInterval(t);
  });
  return {
    days: Math.floor(secs / 86400),
    hours: Math.floor((secs % 86400) / 3600),
    minutes: Math.floor((secs % 3600) / 60),
    seconds: secs % 60,
    expired: secs === 0,
  };
}

export default function OfferPage() {
  const params = useParams();
  const offerId = params.offerId as string;
  const firestore = useFirestore();
  const { toast } = useToast();
  const { userProfile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const offeringRef = doc(firestore, "offerings", offerId);
  const { data: offering, isLoading: isLoadingOffering } = useDoc<Offering>(offeringRef);

  const applicationRef = offering ? doc(firestore, "applications", offering.applicationId) : null;
  const { data: application, isLoading: isLoadingApplication } = useDoc<JobApplication>(applicationRef);

  const isLoading = isLoadingOffering || isLoadingApplication;
  const isValidOffering =
    offering && application &&
    offering.id === application.currentOfferingId &&
    offering.isActive === true;

  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Must be called unconditionally before any early return
  const deadlineForHook = offering?.responseDeadline?.toDate?.() ?? new Date(Date.now() + 86400000);
  const countdown = useCountdown(deadlineForHook);

  // Mark as viewed
  useEffect(() => {
    if (!offering || !isValidOffering || !applicationRef) return;
    if (offering.status === "sent" && application?.offerStatus === "sent") {
      updateDocumentNonBlocking(applicationRef, {
        offerStatus: "viewed",
        offerViewedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  }, [offering, application, applicationRef, isValidOffering]);

  const handleAccept = async () => {
    if (!applicationRef) return;
    setIsAccepting(true);
    try {
      await updateDocumentNonBlocking(applicationRef, {
        offerStatus: "accepted_pending_document",
        candidateVisibleStatus: "offering_document_upload",
        candidateOfferDecisionAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast({ title: "Penawaran Diterima", description: "Silakan unggah dokumen penerimaan yang telah ditandatangani." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Gagal", description: e.message });
    } finally {
      setIsAccepting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast({ variant: "destructive", title: "Format tidak didukung", description: "Unggah PDF, JPG, PNG, DOC, atau DOCX." });
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast({ variant: "destructive", title: "File terlalu besar", description: "Maksimal 10 MB." });
      return;
    }
    setSelectedFile(file);
  };

  const handleUploadSubmit = async () => {
    if (!selectedFile || !offering || !applicationRef) return;
    setIsUploading(true);
    setUploadProgress(0);
    try {
      const storage = getStorage();
      const filePath = `acceptance_documents/${offering.applicationId}/${Date.now()}_${selectedFile.name}`;
      const storageRef = ref(storage, filePath);
      const task = uploadBytesResumable(storageRef, selectedFile);
      await new Promise<void>((resolve, reject) => {
        task.on("state_changed",
          (snap) => setUploadProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
          reject, resolve);
      });
      const downloadUrl = await getDownloadURL(task.snapshot.ref);
      await updateDocumentNonBlocking(applicationRef, {
        offerStatus: "document_uploaded",
        offerDocumentStatus: "submitted",
        candidateVisibleStatus: "offering_document_submitted",
        acceptanceDocumentUrl: downloadUrl,
        acceptanceDocumentName: selectedFile.name,
        acceptanceDocumentUploadedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast({ title: "Dokumen Berhasil Dikirim", description: "Tim Human Capital akan meninjau dokumen Anda segera." });
      setSelectedFile(null);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Gagal Mengunggah", description: err.message });
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  // ── loading / error states ─────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!offering || !isValidOffering || !offering.isActive) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center text-muted-foreground">
            Penawaran ini sudah tidak berlaku atau belum tersedia. Silakan periksa penawaran terbaru Anda.
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── derived data ───────────────────────────────────────────────────────────
  const deadline = offering.responseDeadline.toDate();
  const { days, hours, minutes, seconds, expired } = countdown;
  const currentStatus = application?.offerStatus || offering.status;
  const isPendingDocument = currentStatus === "accepted_pending_document";
  const isDocumentUploaded = currentStatus === "document_uploaded" || !!application?.acceptanceDocumentUrl;
  const isStep1 = !isPendingDocument && !isDocumentUploaded;

  const details = offering.offeringDetails;
  const jobPosition = application?.jobPosition || "";
  const brandName = application?.brandName || "";
  const candidateName = offering.candidateName || "";

  const hcContact = details
    ? [details.humanCapitalContactName, details.humanCapitalContactPhone].filter(Boolean).join(" · ")
      || details.humanCapitalContact || details.hrContact
    : null;

  const deadlineDateLabel = format(deadline, "EEEE, dd MMMM yyyy", { locale: idLocale });
  const deadlineTimeLabel = format(deadline, "HH:mm");

  const infoItems = [
    { label: "Batas Konfirmasi", value: `${deadlineDateLabel}, pukul ${deadlineTimeLabel} WIB` },
    details?.startDate && {
      label: "Tanggal Mulai Kerja / Program",
      value: (() => { try { return format(new Date(details.startDate!), "dd MMMM yyyy", { locale: idLocale }); } catch { return String(details.startDate); } })(),
    },
    details?.contractDurationMonths && { label: "Durasi Kontrak / Program", value: `${details.contractDurationMonths} bulan` },
    details?.firstDayTime && { label: "Jam Hadir Hari Pertama", value: `${details.firstDayTime} WIB` },
    details?.firstDayLocation && { label: "Lokasi Hari Pertama", value: details.firstDayLocation },
    hcContact && { label: "Kontak Human Capital", value: hcContact },
  ].filter(Boolean) as { label: string; value: string }[];

  const offeringMessage = [
    `Dear ${candidateName},`,
    "",
    `Terimalah salam hangat dari kami ${brandName || "[brandName]"}.`,
    "",
    `Berdasarkan hasil proses seleksi dan wawancara yang telah Saudara ikuti bersama tim kami, dengan senang hati kami sampaikan bahwa Saudara telah sesuai dengan kualifikasi yang dibutuhkan oleh perusahaan untuk posisi ${jobPosition || "[posisi]"}.`,
    "",
    `Berikut kami kirimkan Surat Penawaran Kerja yang dapat Saudara pertimbangkan. Apabila Saudara menyetujui penawaran tersebut, silakan membubuhkan tanda tangan pada Lembar Penerimaan Posisi, kemudian mengunggah kembali dokumen yang telah ditandatangani melalui portal ini maksimal ${deadlineDateLabel} pukul ${deadlineTimeLabel} WIB untuk melanjutkan tahap berikutnya, yaitu penandatanganan kontrak.`,
    "",
    `Kami sangat berharap Saudara dapat mempertimbangkan dan bergabung dengan perusahaan kami.${hcContact ? ` Apabila terdapat hal-hal yang perlu didiskusikan lebih lanjut, mohon jangan ragu untuk menghubungi tim Human Capital melalui ${hcContact}.` : ""}`,
    "",
    "Demikian surat penawaran ini kami sampaikan. Atas perhatian dan kerja sama yang baik, kami ucapkan terima kasih.",
    "",
    "Regards,",
    "Human Capital",
    brandName || "[brandName]",
  ].join("\n");

  const InfoGrid = () => (
    <div className="divide-y divide-slate-100 dark:divide-slate-800">
      {infoItems.map(({ label, value }) => (
        <div key={label} className="flex justify-between items-baseline gap-4 py-2.5">
          <p className="text-xs text-slate-500 dark:text-slate-400 shrink-0">{label}</p>
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200 text-right">{value}</p>
        </div>
      ))}
    </div>
  );

  const CountdownStrip = () => (
    <div className={cn(
      "rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3",
      expired
        ? "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300"
        : "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400"
    )}>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider mb-1 opacity-70">Batas Waktu Konfirmasi</p>
        {expired ? (
          <p className="text-sm font-semibold">Batas waktu telah berakhir</p>
        ) : (
          <p className="text-sm font-semibold tabular-nums">
            {days}h {String(hours).padStart(2, "0")}j {String(minutes).padStart(2, "0")}m {String(seconds).padStart(2, "0")}d
          </p>
        )}
      </div>
      <p className="text-xs opacity-80">s/d {deadlineDateLabel} pukul {deadlineTimeLabel} WIB</p>
    </div>
  );

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-8 pb-16">
      <div className="container mx-auto px-4 max-w-2xl space-y-4">

        {/* ── STEP 3: dokumen sudah dikirim ────────────────────────────────── */}
        {isDocumentUploaded && (
          <>
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <Badge className="w-fit mb-1 bg-emerald-100 text-emerald-700 border-0 dark:bg-emerald-950/50 dark:text-emerald-300">
                  Dokumen Penerimaan Telah Dikirim
                </Badge>
                <CardTitle className="text-xl">Surat Penawaran Kerja: {jobPosition}</CardTitle>
              </CardHeader>
            </Card>

            <Card className="border border-emerald-200 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20">
              <CardContent className="pt-5 pb-5 flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-emerald-800 dark:text-emerald-300">
                    Dokumen Penerimaan Telah Dikirim
                  </p>
                  {application?.acceptanceDocumentName && (
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                      File: {application.acceptanceDocumentName}
                    </p>
                  )}
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    Tim Human Capital akan meninjau dokumen Anda dan menghubungi Anda untuk tahap berikutnya.
                  </p>
                </div>
              </CardContent>
            </Card>

            {infoItems.length > 0 && (
              <Card className="border-0 shadow-sm bg-slate-50/50 dark:bg-slate-900/30">
                <CardContent className="pt-4 pb-4"><InfoGrid /></CardContent>
              </Card>
            )}
          </>
        )}

        {/* ── STEP 2: accepted_pending_document → upload ────────────────────── */}
        {isPendingDocument && (
          <>
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <Badge className="w-fit mb-1 bg-blue-100 text-blue-700 border-0 dark:bg-blue-950/50 dark:text-blue-300">
                  Menunggu Dokumen Penerimaan
                </Badge>
                <CardTitle className="text-xl">Surat Penawaran Kerja: {jobPosition}</CardTitle>
                <CardDescription>
                  Anda telah menerima penawaran ini. Silakan unggah dokumen penerimaan posisi yang telah ditandatangani.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0 pb-4 space-y-4">
                <CountdownStrip />

                {/* Upload area */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
                  <p className="text-sm font-semibold">Unggah Dokumen Penerimaan Posisi</p>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    Apabila Saudara menyetujui penawaran ini, silakan membubuhkan tanda tangan pada{" "}
                    <strong>Lembar Penerimaan Posisi</strong>. Jika pada dokumen terdapat kolom materai,
                    Saudara dapat menggunakan materai elektronik atau materai tempel fisik sesuai ketentuan
                    yang berlaku. Setelah dokumen ditandatangani dan dibubuhi materai, silakan unggah kembali
                    dokumen tersebut melalui portal ini sebelum batas waktu konfirmasi offering.
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    Pastikan tanda tangan, nama, tanggal, dan materai terlihat jelas sebelum dokumen diunggah.
                    Format: PDF, DOC, DOCX, JPG, PNG · maks. 10 MB.
                  </p>

                  {offering.documentUrl && (
                    <Button variant="outline" size="sm" className="w-full"
                      onClick={() => openOfferingDocument({ offeringId: offering.id, documentUrl: offering.documentUrl, documentPath: offering.documentPath, documentName: offering.documentName }, "download").catch((e) => toast({ variant: "destructive", title: "Gagal Mengunduh", description: e.message }))}>
                      <Download className="h-3.5 w-3.5 mr-1.5" />
                      Download Surat Penawaran
                    </Button>
                  )}

                  <input ref={fileInputRef} type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    className="hidden" onChange={handleFileChange} />

                  {selectedFile ? (
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-2">
                      <span className="text-sm truncate">{selectedFile.name}</span>
                      <button type="button" onClick={() => setSelectedFile(null)}
                        className="text-xs text-slate-400 hover:text-red-500 shrink-0">Ganti</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => fileInputRef.current?.click()}
                      className="w-full rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 py-6 flex flex-col items-center gap-1.5 text-slate-400 hover:border-primary hover:text-primary transition-colors">
                      <Upload className="h-5 w-5" />
                      <span className="text-sm font-medium">Klik untuk memilih file</span>
                    </button>
                  )}

                  {uploadProgress !== null && (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>Mengunggah...</span><span>{uploadProgress}%</span>
                      </div>
                      <Progress value={uploadProgress} className="h-1.5" />
                    </div>
                  )}

                  <Button type="button" className="w-full" size="lg"
                    disabled={!selectedFile || isUploading}
                    onClick={handleUploadSubmit}>
                    <Upload className="h-4 w-4 mr-2" />
                    {isUploading ? "Mengunggah..." : "Kirim Dokumen Penerimaan"}
                  </Button>
                </div>

                {/* Ringkasan info */}
                {infoItems.length > 0 && (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2">
                    <InfoGrid />
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* ── STEP 1: penawaran tersedia, belum diterima ────────────────────── */}
        {isStep1 && (
          <>
            {/* 1. Header */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <Badge className="w-fit mb-1 bg-green-100 text-green-700 border-0 dark:bg-green-950/50 dark:text-green-300">
                  Penawaran Tersedia
                </Badge>
                <CardTitle className="text-xl">Surat Penawaran Kerja: {jobPosition}</CardTitle>
                <CardDescription className="text-sm leading-relaxed">
                  Selamat, Anda telah lolos tahap wawancara untuk posisi{" "}
                  <strong>{jobPosition}</strong>. Silakan baca pesan dari Human
                  Capital dan tinjau Surat Penawaran Kerja yang tersedia pada
                  halaman ini.
                </CardDescription>
              </CardHeader>
            </Card>

            {/* 2. Pesan dari Human Capital — terbuka by default */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4 text-slate-400" />
                  Pesan dari Human Capital
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 pb-4">
                <pre className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300 font-sans leading-relaxed bg-slate-50/60 dark:bg-slate-900/40 rounded-xl p-4 border border-slate-100 dark:border-slate-800">
                  {offeringMessage}
                </pre>
              </CardContent>
            </Card>

            {/* Catatan tambahan */}
            {offering.additionalNotes && (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Informasi Tambahan</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 pb-4">
                  <SafeRichText html={offering.additionalNotes} />
                </CardContent>
              </Card>
            )}

            {/* 3. Batas Waktu Konfirmasi */}
            <Card className={cn(
              "border-0 shadow-sm",
              expired ? "bg-red-50 dark:bg-red-950/20" : "bg-amber-50 dark:bg-amber-950/20"
            )}>
              <CardContent className="pt-4 pb-4">
                <p className={cn(
                  "text-[10px] font-bold uppercase tracking-wider mb-2",
                  expired ? "text-red-500" : "text-amber-600 dark:text-amber-400"
                )}>
                  Batas Waktu Konfirmasi Offering
                </p>
                {expired ? (
                  <p className="text-sm font-semibold text-red-600 dark:text-red-400">
                    Batas waktu konfirmasi telah berakhir.
                    {hcContact && ` Hubungi Tim Human Capital melalui ${hcContact}.`}
                  </p>
                ) : (
                  <>
                    <div className="flex items-center gap-3 mb-2">
                      {[
                        { v: days, label: "Hari" },
                        { v: hours, label: "Jam" },
                        { v: minutes, label: "Menit" },
                        { v: seconds, label: "Detik" },
                      ].map(({ v, label }) => (
                        <div key={label} className="flex flex-col items-center">
                          <span className="text-2xl font-bold tabular-nums text-slate-800 dark:text-slate-100">
                            {String(v).padStart(2, "0")}
                          </span>
                          <span className="text-[10px] uppercase tracking-wider text-slate-400">{label}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Anda memiliki waktu sampai{" "}
                      <strong>{deadlineDateLabel}</strong> pukul{" "}
                      <strong>{deadlineTimeLabel} WIB</strong> untuk mengunggah
                      dokumen penerimaan posisi yang telah ditandatangani.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            {/* 4. Dokumen Penawaran Resmi */}
            {offering.documentUrl && (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Dokumen Penawaran Resmi</CardTitle>
                  <CardDescription className="text-xs">
                    Buka Surat Penawaran Kerja untuk membaca detail penawaran secara lengkap.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0 pb-4 space-y-2">
                  <Button variant="outline" size="sm" className="w-full"
                    onClick={() => openOfferingDocument({ offeringId: offering.id, documentUrl: offering.documentUrl, documentPath: offering.documentPath, documentName: offering.documentName }, "preview").catch((e) => toast({ variant: "destructive", title: "Gagal Membuka", description: e.message }))}>
                    <Eye className="h-3.5 w-3.5 mr-1.5" />
                    Preview Surat Penawaran
                  </Button>
                  <p className="text-xs text-slate-400 dark:text-slate-500 text-center">
                    Anda dapat mengunduh dokumen melalui tombol download yang tersedia pada tampilan preview PDF.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* 5. Informasi Offering */}
            {infoItems.length > 0 && (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Informasi Offering</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 pb-4">
                  <InfoGrid />
                </CardContent>
              </Card>
            )}

            {/* 6. Aksi Kandidat */}
            <Card className="border-0 shadow-sm">
              <CardContent className="pt-4 pb-4 space-y-3">
                {expired ? (
                  <div className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-300">
                    Batas waktu konfirmasi telah berakhir.
                    {hcContact && ` Hubungi Tim Human Capital melalui ${hcContact} untuk informasi lebih lanjut.`}
                  </div>
                ) : (
                  <>
                    <Button type="button" size="lg" className="w-full"
                      disabled={isAccepting}
                      onClick={handleAccept}>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      {isAccepting ? "Memproses..." : "Saya Menerima Penawaran"}
                    </Button>
                    <p className="text-xs text-center text-slate-400 leading-relaxed px-2">
                      Dengan mengklik tombol di atas, Anda menyatakan telah membaca
                      dan menyetujui Surat Penawaran Kerja yang diberikan oleh{" "}
                      <strong>{brandName}</strong>. Langkah selanjutnya: unggah
                      dokumen penerimaan posisi yang telah ditandatangani.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          </>
        )}

      </div>
    </div>
  );
}
