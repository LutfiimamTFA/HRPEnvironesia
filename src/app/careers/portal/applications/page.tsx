"use client";

import React, { useMemo, useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/providers/auth-provider";
import {
  useCollection,
  useDoc,
  useFirestore,
  useMemoFirebase,
  updateDocumentNonBlocking,
} from "@/firebase";
import {
  collection,
  doc,
  getDoc,
  query,
  serverTimestamp,
  Timestamp,
  where,
} from "firebase/firestore";
import { uploadFile } from "@/lib/storage/storage-adapter";
import { 
  validateStorageFile, 
  compressImage, 
  handleStorageError 
} from "@/lib/storage-utils";
import type {
  Job,
  JobApplication,
  JobApplicationStatus,
  AssessmentSession,
  Offering,
} from "@/lib/types";
import { getCandidateDisplayStatus } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import {
  format,
  addMonths,
  differenceInMinutes,
  differenceInSeconds,
} from "date-fns";
import { id } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { openOfferingDocument } from "@/lib/offering-file-utils";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Briefcase,
  Building,
  FileSignature,
  FileUp,
  ClipboardCheck,
  Users,
  Award,
  XCircle,
  BrainCircuit,
  FileText,
  Search,
  Calendar,
  Link as LinkIcon,
  FileClock,
  Loader2,
  Clock,
  Download,
  MapPin,
  Info,
  CheckCircle2,
  ChevronDown,
  Eye,
} from "lucide-react";
import { generateOfferingPDF } from "@/lib/recruitment/pdf-generator";
import { cn } from "@/lib/utils";
import SafeRichText from "@/components/ui/SafeRichText";
import { sendNotification } from "@/lib/notifications";
import { Separator } from "@/components/ui/separator";
import { ORDERED_RECRUITMENT_STAGES } from "@/lib/types";
import { statusDisplayLabels } from "@/components/recruitment/ApplicationStatusBadge";
import { useToast } from "@/hooks/use-toast";

function ApplicationCard({
  application,
  job,
  hasCompletedTest,
  isOpen,
  onToggle,
}: {
  application: JobApplication;
  job?: Job;
  hasCompletedTest: boolean;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const [now, setNow] = useState(new Date());
  const [isDeciding, setIsDeciding] = React.useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [isAcceptConfirmOpen, setIsAcceptConfirmOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("Gaji tidak sesuai");
  const [customRejectReason, setCustomRejectReason] = useState("");
  const [rejectionNotes, setRejectionNotes] = useState("");
  const [signedFile, setSignedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isNegotiationDialogOpen, setIsNegotiationDialogOpen] = useState(false);
  const [negotiationAreas, setNegotiationAreas] = useState<string[]>([]);
  const [negotiationStartDate, setNegotiationStartDate] = useState("");
  const [negotiationWorkModel, setNegotiationWorkModel] = useState("");
  const [negotiationWorkDays, setNegotiationWorkDays] = useState("");
  const [negotiationWorkTime, setNegotiationWorkTime] = useState("");
  const [negotiationEntryLocation, setNegotiationEntryLocation] = useState("");
  const [negotiationLocation, setNegotiationLocation] = useState("");
  const [negotiationContractDuration, setNegotiationContractDuration] =
    useState<number | null>(null);
  const [negotiationBenefitNotes, setNegotiationBenefitNotes] = useState("");
  const [negotiationScopeNotes, setNegotiationScopeNotes] = useState("");
  const [negotiationOtherNotes, setNegotiationOtherNotes] = useState("");
  const [negotiationReason, setNegotiationReason] = useState("");
  const { firebaseUser } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const activeOfferingPointerId =
    application.activeOfferingId || application.currentOfferingId;
  const activeOfferingRef = useMemoFirebase(() => {
    if (!activeOfferingPointerId) return null;
    return doc(firestore, "offerings", activeOfferingPointerId);
  }, [activeOfferingPointerId, firestore]);

  const [activeOffering, setActiveOffering] = useState<Offering | null>(null);
  const [activeOfferingLoading, setActiveOfferingLoading] = useState(false);

  useEffect(() => {
    async function fetchOffering() {
      if (!activeOfferingRef) {
        setActiveOffering(null);
        return;
      }

      setActiveOfferingLoading(true);
      try {
        const snap = await getDoc(activeOfferingRef);
        if (snap.exists()) {
          setActiveOffering({ ...snap.data(), id: snap.id } as Offering);
        } else {
          setActiveOffering(null);
        }
      } catch (err) {
        console.error("Error fetching offering:", err);
      } finally {
        setActiveOfferingLoading(false);
      }
    }

    fetchOffering();
  }, [activeOfferingRef]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const activeOfferingId =
    activeOffering?.id || activeOfferingPointerId || null;
  const isActuallyLoading = activeOfferingLoading;

  const offerDetails = activeOffering?.offeringDetails || {};
  const offerSalaryLabel =
    application.jobType === "internship" ? "Uang Saku" : "Gaji";
  const offerSalary = offerDetails.salary || "-";
  const offerStartDate = offerDetails.startDate
    ? new Date(offerDetails.startDate)
    : null;
  const offerContractDuration = offerDetails.contractDurationMonths
    ? `${offerDetails.contractDurationMonths} bulan`
    : "-";
  const offerFirstDayTime = offerDetails.firstDayTime || "-";
  const offerFirstDayLocation = offerDetails.firstDayLocation || "-";
  const offerWorkModel = (offerDetails as any)?.workModel || "-";
  const offerJobLocation =
    (offerDetails as any)?.location || offerFirstDayLocation || "-";
  const offerBenefits = (offerDetails as any)?.benefits || "-";
  const offerRoleScope = (offerDetails as any)?.roleScope || "-";
  const offerAdditionalNotes = activeOffering?.additionalNotes || "";
  const offerOtherNotes = offerAdditionalNotes || "-";
  const offerHrContact = (() => {
    const name = offerDetails.humanCapitalContactName;
    const phone = offerDetails.humanCapitalContactPhone;
    if (name || phone) return [name, phone].filter(Boolean).join(" - ");
    return offerDetails.humanCapitalContact || offerDetails.hrContact || "-";
  })();
  const offerDocumentUrl = activeOffering?.documentUrl;
  const offerDocumentPath = activeOffering?.documentPath;
  const offerDocumentName =
    activeOffering?.documentName ||
    `Offering_${application.jobPosition.replace(/\s+/g, "_")}.pdf`;

  const requestedStartDateLabel = negotiationStartDate
    ? format(new Date(negotiationStartDate), "dd MMMM yyyy", { locale: id })
    : "Belum diisi";
  const requestedWorkModelLabel =
    [
      negotiationWorkModel,
      negotiationWorkDays ? `Hari kerja: ${negotiationWorkDays}` : null,
      negotiationWorkTime ? `Jam kerja: ${negotiationWorkTime}` : null,
      negotiationEntryLocation ? `Lokasi: ${negotiationEntryLocation}` : null,
    ]
      .filter(Boolean)
      .join(" • ") || "Belum diisi";
  const requestedLocationLabel = negotiationLocation || "Belum diisi";
  const requestedContractDurationLabel = negotiationContractDuration
    ? `${negotiationContractDuration} bulan`
    : "Belum diisi";
  const requestedBenefitLabel = negotiationBenefitNotes || "Belum diisi";
  const requestedScopeLabel = negotiationScopeNotes || "Belum diisi";
  const requestedOtherLabel = negotiationOtherNotes || "Belum diisi";

  // Requirement 8: Card is available only if we found an active offering and it is active.
  const activeOfferIsAvailable = !!activeOffering && activeOffering.isActive;

  const parseDateValue = (value: any) => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (value && typeof value.toDate === "function") return value.toDate();
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const offerResponseDeadline = parseDateValue(
    activeOffering?.responseDeadline,
  );
  const secondsLeft = offerResponseDeadline
    ? Math.max(0, differenceInSeconds(offerResponseDeadline, now))
    : null;
  const hasExpired =
    !!offerResponseDeadline && now.getTime() > offerResponseDeadline.getTime();
  const isVeryUrgent =
    secondsLeft !== null && !hasExpired && secondsLeft <= 10 * 60;
  const isUrgent =
    secondsLeft !== null &&
    !hasExpired &&
    secondsLeft <= 60 * 60 &&
    secondsLeft > 10 * 60;
  const isWarning =
    secondsLeft !== null &&
    !hasExpired &&
    secondsLeft <= 24 * 60 * 60 &&
    secondsLeft > 60 * 60;
  const responseDeadlineLabel = offerResponseDeadline
    ? format(offerResponseDeadline, "dd MMMM yyyy HH:mm", { locale: id })
    : "-";
  const countdownParts =
    secondsLeft !== null
      ? {
          days: Math.floor(secondsLeft / 86400),
          hours: Math.floor((secondsLeft % 86400) / 3600),
          minutes: Math.floor((secondsLeft % 3600) / 60),
          seconds: secondsLeft % 60,
        }
      : null;
  const countdownLabel = countdownParts
    ? `${countdownParts.days} hari ${String(countdownParts.hours).padStart(2, "0")} jam ${String(countdownParts.minutes).padStart(2, "0")} menit ${String(countdownParts.seconds).padStart(2, "0")} detik`
    : "-";
  const offerAcceptedStatuses = [
    "accepted",
    "accepted_pending_document",
    "document_uploaded",
  ];
  const offerIsAccepted = offerAcceptedStatuses.includes(
    application.offerStatus || "",
  );

  const candidateOfferStatusLabel = hasExpired
    ? "Expired"
    : application.offerStatus === "accepted"
      ? "Diterima"
      : application.offerStatus === "negotiation_requested"
        ? "Negosiasi Diajukan"
        : application.offerStatus === "offered_final"
          ? "Penawaran Final"
          : application.offerStatus === "negotiation_rejected"
            ? "Negosiasi Ditolak"
            : isVeryUrgent
              ? "Waktu Hampir Habis"
              : isUrgent
                ? "Urgent"
                : isWarning
                  ? "Hampir Habis"
                  : "Menunggu Keputusan";
  const candidateStatusBadgeClass = hasExpired
    ? "border-red-400/30 bg-red-950/60 text-red-100"
    : application.offerStatus === "accepted" ||
        application.offerStatus === "accepted_pending_document" ||
        application.offerStatus === "document_uploaded"
      ? "border-emerald-400/30 bg-emerald-950/60 text-emerald-100"
      : application.offerStatus === "negotiation_requested"
        ? "border-blue-400/30 bg-blue-950/60 text-blue-100"
        : application.offerStatus === "offered_final"
          ? "border-indigo-400/30 bg-indigo-950/60 text-indigo-100"
          : application.offerStatus === "negotiation_rejected"
            ? "border-orange-400/30 bg-orange-950/60 text-orange-100"
            : isVeryUrgent
              ? "border-red-400/30 bg-red-950/60 text-red-100"
              : isUrgent
                ? "border-orange-400/30 bg-orange-950/60 text-orange-100"
                : isWarning
                  ? "border-amber-400/30 bg-amber-950/60 text-amber-100"
                  : "border-slate-500/30 bg-slate-950/70 text-slate-100";
  const isOfferDisabled =
    hasExpired ||
    application.offerStatus === "negotiation_requested" ||
    application.offerStatus === "accepted" ||
    application.offerStatus === "accepted_pending_document" ||
    application.offerStatus === "document_uploaded";
  const offerActionHint = hasExpired
    ? "Penawaran ini sudah lewat batas waktu dan tidak dapat diproses lagi."
    : application.offerStatus === "negotiation_requested"
      ? "Permintaan negosiasi Anda sedang dalam peninjauan Tim HRD. Mohon tunggu informasi selanjutnya."
      : application.offerStatus === "offered_final"
        ? "Ini adalah penawaran final berdasarkan hasil diskusi negosiasi. Silakan berikan keputusan akhir Anda."
        : application.offerStatus === "negotiation_rejected"
          ? "Permintaan diskusi sebelumnya tidak dapat disetujui. Anda dapat melanjutkan dengan penawaran awal ini atau memberikan keputusan penolakan."
          : `Anda memiliki waktu sampai ${responseDeadlineLabel} untuk memberikan keputusan.`;

  const offerContractEndDate =
    offerStartDate && offerDetails.contractDurationMonths
      ? addMonths(offerStartDate, Number(offerDetails.contractDurationMonths))
      : null;

  useEffect(() => {
    if (
      application.status === "offered" &&
      application.offerStatus === "sent" &&
      application.id
    ) {
      const appRef = doc(firestore, "applications", application.id);
      updateDocumentNonBlocking(appRef, {
        offerStatus: "viewed",
        offerViewedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }).catch(console.error);
    }
  }, [application, firestore]);

  const handleDecision = async (
    decision: "accepted" | "rejected",
    reason?: string,
  ) => {
    if (!firebaseUser) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Anda harus login.",
      });
      return;
    }
    setIsDeciding(true);
    try {
      const appRef = doc(firestore, "applications", application.id!);
      const payload: any = {
        offerStatus:
          decision === "accepted" ? "accepted_pending_document" : decision,
        candidateOfferDecisionAt: serverTimestamp(),
        offerRejectionReason: reason ?? null,
        updatedAt: serverTimestamp(),
      };
      if (decision === "rejected") {
        payload.status = "rejected";
      }
      await updateDocumentNonBlocking(appRef, payload);

      const hrRecipient = application.assignedRecruiterId;
      if (hrRecipient) {
        await sendNotification(firestore, {
          userId: hrRecipient,
          type: "decision",
          module: "recruitment",
          title:
            decision === "accepted"
              ? "Kandidat telah menerima penawaran kerja."
              : "Kandidat menolak penawaran kerja.",
          message:
            decision === "accepted"
              ? "Kandidat telah menerima penawaran kerja."
              : "Kandidat menolak penawaran kerja.",
          targetType: "application",
          targetId: application.id!,
          actionUrl: `/admin/recruitment/applications/${application.id}`,
          createdBy: firebaseUser.uid,
          meta: {
            applicationId: application.id,
            candidateUid: application.candidateUid,
            candidateName: application.candidateName,
          },
        });
      }

      toast({
        title:
          decision === "accepted"
            ? "Persetujuan Awal Tercatat"
            : "Keputusan Tercatat",
        description:
          decision === "accepted"
            ? "Anda telah menyetujui penawaran secara prinsip. Langkah selanjutnya adalah unggah dokumen yang sudah ditandatangani."
            : "Anda telah menolak penawaran ini. Tim HR akan mencatat keputusan Anda dan menindaklanjutinya.",
      });
    } catch (error: any) {
      console.error("Failed to submit decision:", error);
      toast({
        variant: "destructive",
        title: "Gagal Menyimpan Keputusan",
        description: error.message,
      });
    } finally {
      setIsDeciding(false);
    }
  };

  const handleNegotiationSubmit = async () => {
    if (!firebaseUser) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Anda harus login.",
      });
      return;
    }

    if (negotiationAreas.length === 0) {
      toast({
        variant: "destructive",
        title: "Pilih Area",
        description: "Pilih setidaknya satu area yang ingin dinegosiasikan.",
      });
      return;
    }

    if (!negotiationReason.trim()) {
      toast({
        variant: "destructive",
        title: "Alasan Wajib",
        description: "Berikan penjelasan profesional mengenai permintaan Anda.",
      });
      return;
    }

    setIsDeciding(true);
    try {
      const appRef = doc(firestore, "applications", application.id!);

      const requestedWorkModel = negotiationAreas.includes("sistem_kerja")
        ? [
            negotiationWorkModel,
            negotiationWorkDays ? `Hari kerja: ${negotiationWorkDays}` : null,
            negotiationWorkTime ? `Jam kerja: ${negotiationWorkTime}` : null,
            negotiationEntryLocation
              ? `Lokasi masuk: ${negotiationEntryLocation}`
              : null,
          ]
            .filter(Boolean)
            .join(" • ")
        : null;

      await updateDocumentNonBlocking(appRef, {
        offerStatus: "negotiation_requested" as const,
        candidateNegotiationUsed: true,
        candidateCounterOffer: {
          requestedAreas: negotiationAreas,
          requestedStartDate: negotiationAreas.includes("tanggal_mulai")
            ? negotiationStartDate
            : null,
          requestedWorkModel,
          requestedLocation: negotiationAreas.includes("lokasi")
            ? negotiationLocation
            : null,
          requestedContractDurationMonths: negotiationAreas.includes(
            "durasi_kontrak",
          )
            ? negotiationContractDuration
            : null,
          requestedBenefitNotes: negotiationAreas.includes("benefit")
            ? negotiationBenefitNotes
            : null,
          requestedScopeNotes: negotiationAreas.includes("peran")
            ? negotiationScopeNotes
            : null,
          requestedOtherNotes: negotiationAreas.includes("lainnya")
            ? negotiationOtherNotes
            : null,
          reason: negotiationReason,
          submittedAt: Timestamp.now(),
        },
        updatedAt: serverTimestamp(),
      });

      const hrRecipient = application.assignedRecruiterId;
      if (hrRecipient) {
        await sendNotification(firestore, {
          userId: hrRecipient,
          type: "negotiation",
          module: "recruitment",
          title: "Permintaan Negosiasi Penawaran",
          message: `${application.candidateName} mengajukan diskusi negosiasi untuk penawaran ${application.jobPosition}.`,
          targetType: "application",
          targetId: application.id!,
          actionUrl: `/admin/recruitment/applications/${application.id}`,
          createdBy: firebaseUser.uid,
          meta: {
            applicationId: application.id,
            candidateName: application.candidateName,
          },
        });
      }

      setIsNegotiationDialogOpen(false);
      toast({
        title: "Negosiasi Terkirim",
        description: "Permintaan diskusi Anda telah terkirim ke Tim HRD.",
      });
    } catch (error: any) {
      console.error("Failed to submit negotiation:", error);
      toast({
        variant: "destructive",
        title: "Gagal Mengajukan",
        description: error.message,
      });
    } finally {
      setIsDeciding(false);
    }
  };

  const handleReturnToOfferReview = async () => {
    if (!firebaseUser || !application.id) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Tidak dapat mengembalikan ke penawaran saat ini.",
      });
      return;
    }

    setIsDeciding(true);
    try {
      const appRef = doc(firestore, "applications", application.id);
      await updateDocumentNonBlocking(appRef, {
        offerStatus: "viewed",
        updatedAt: serverTimestamp(),
      });

      toast({
        title: "Kembali ke Penawaran",
        description:
          "Anda sekarang dapat meninjau ulang penawaran sebelum mengunggah dokumen.",
      });
    } catch (error: any) {
      console.error("Failed to return to offer review:", error);
      toast({
        variant: "destructive",
        title: "Gagal Kembali",
        description:
          error?.message ||
          "Terjadi kesalahan saat mengembalikan ke penawaran.",
      });
    } finally {
      setIsDeciding(false);
    }
  };

  const handleSignedDocumentUpload = async () => {
    if (!firebaseUser) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Anda harus login untuk mengunggah dokumen.",
      });
      return;
    }

    if (!activeOfferingId || !activeOffering) {
      setUploadError("Tidak ada penawaran yang aktif untuk diunggah dokumen.");
      return;
    }

    if (!signedFile) {
      setUploadError("Pilih file dokumen penawaran yang telah ditandatangani.");
      return;
    }

    setUploadError(null);
    setIsUploading(true);
    setUploadProgress(0);

    try {
      const validation = validateStorageFile(signedFile);
      if (!validation.isValid) {
        setUploadError(validation.message || 'File tidak valid');
        setIsUploading(false);
        return;
      }
      
      const processedFile = await compressImage(signedFile);
      setUploadProgress(10);
      
      const filePath = `offerings/${activeOfferingId}/signed_documents/${Date.now()}_${processedFile.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
      
      const result = await uploadFile(processedFile, filePath, firebaseUser.uid, {
        category: 'signed_offering',
        ownerUid: firebaseUser.uid,
        applicationId: application.id,
        offeringId: activeOfferingId,
        compress: false // Already compressed
      });

      const signedDocumentUrl = result.webViewLink || result.downloadUrl || "";
      
      const offeringRef = doc(firestore, "offerings", activeOfferingId);
      const appRef = doc(firestore, "applications", application.id!);
      await updateDocumentNonBlocking(appRef, {
        offerStatus: "document_uploaded",
        signedOfferUrl: signedDocumentUrl,
        signedOfferFileName: signedFile.name,
        offerDocumentStatus: "pending_verification",
        candidateOfferDocumentAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setSignedFile(null);
      setUploadProgress(100);

      toast({
        title: "Dokumen Terkirim",
        description:
          "Dokumen penawaran telah dikirim ke Google Drive. Tim HRD akan memverifikasi segera.",
      });
    } catch (error: any) {
      console.error("Upload signed document failed:", error);
      setUploadError(error?.message || "Gagal mengunggah dokumen.");
      toast({
        variant: "destructive",
        title: "Unggah Gagal",
        description:
          error?.message || "Terjadi kesalahan saat mengunggah dokumen ke Google Drive.",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const formatSalary = (value: number | undefined | null) => {
    if (value === undefined || value === null) return "-";
    return `Rp ${value.toLocaleString("id-ID")}`;
  };

  const formatSalaryInput = (value: string) => {
    const digits = value.replace(/\D/g, "");
    if (!digits) return "";
    return `Rp ${parseInt(digits, 10).toLocaleString("id-ID")}`;
  };

  const scheduledInterview = useMemo(() => {
    if (!application.interviews || application.interviews.length === 0)
      return null;
    const now = new Date().getTime();
    const scheduledInterviews = application.interviews.filter(
      (i) => i.status === "scheduled",
    );
    if (scheduledInterviews.length === 0) return null;

    const upcoming = scheduledInterviews
      .filter((i) => i.startAt.toDate().getTime() >= now)
      .sort(
        (a, b) => a.startAt.toDate().getTime() - b.startAt.toDate().getTime(),
      );

    if (upcoming.length > 0) return upcoming[0];

    const past = scheduledInterviews
      .filter((i) => i.startAt.toDate().getTime() < now)
      .sort(
        (a, b) => b.startAt.toDate().getTime() - a.startAt.toDate().getTime(),
      );

    if (past.length > 0) return past[0];

    return null;
  }, [application.interviews]);

  // HRD internal negative post-interview decision — candidate must NOT see this.
  // Old code used to set application.status="rejected" when HRD chose "tidak_lanjut";
  // detect by the decision field so the portal freezes at "Evaluasi Setelah Wawancara".
  // Pre-interview "tidak_dilanjutkan_saat_ini"/"pending_internal" never changes
  // application.status, so we only guard the "rejected" edge case there.
  const isHRDInternalRejection =
    application.postInterviewDecision?.status === "tidak_lanjut" ||
    (["tidak_dilanjutkan_saat_ini", "pending_internal"].includes(
      application.recruitmentInternalDecision?.status ?? ""
    ) &&
      application.status === "rejected");

  // Only surface "Proses Selesai" to candidates who rejected an offer themselves.
  const isRejected = application.status === "rejected" && !isHRDInternalRejection;

  const isHired =
    application.status === "hired" &&
    application.internalAccessEnabled === true;
  const isOffered = application.status === "offered";
  const hasPostInterviewEvaluation =
    !!application.postInterviewEvaluation &&
    ((application.postInterviewEvaluation.submissions ?? 0) > 0 ||
      (((application.postInterviewEvaluation as any).evaluatorSubmissions?.length ?? 0) > 0));
  const isPostInterviewEvaluationState =
    !!application.postInterviewDecision ||
    application.candidateVisibleStatus === "evaluasi_setelah_wawancara" ||
    application.interviewCompleted === true ||
    !!application.interviewCompletedAt ||
    hasPostInterviewEvaluation;
  // Include neutral post-interview states so they render before any interview schedule card.
  const isInterviewStage =
    application.status === "interview" ||
    isHRDInternalRejection ||
    isPostInterviewEvaluationState;
  const isAssessmentStage = application.status === "tes_kepribadian";
  const isProcessing = [
    "submitted",
    "screening",
    "verification",
    "document_submission",
  ].includes(application.status);
  const hasFinalPositive = application.candidateStatus === "lolos";

  // True when the interview is physically complete from the candidate's viewpoint.
  // Internal "tidak_lanjut" decision always triggers this so the candidate sees the
  // neutral post-interview state rather than an active interview card.
  // Note: !!postInterviewDecision alone is intentionally NOT used — only "lanjut" or
  // an explicit internal rejection should transition this flag.
  const isInterviewActuallyDone =
    isPostInterviewEvaluationState || !!application.interviewCompletionSource;

  // Status shown to candidate — uses helper that never exposes HRD internal decisions
  const displayStatus = useMemo(
    () => getCandidateDisplayStatus(application),
    [application],
  );

  if (isOffered) {
    // ── menyiapkan penawaran (belum ada offering aktif) ───────────────────────
    const renderMissingOfferDetails = () => (
      <Card className="flex flex-col border-primary/50">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4">
            <div>
              <CardTitle className="text-xl">
                Surat Penawaran Kerja: {application.jobPosition}
              </CardTitle>
              <CardDescription>
                Selamat, Anda telah lolos tahap wawancara untuk posisi{" "}
                <strong>{application.jobPosition}</strong>. Saat ini tim Human
                Capital <strong>{application.brandName}</strong> sedang
                menyiapkan dokumen penawaran kerja resmi untuk Anda. Mohon
                pantau halaman ini secara berkala hingga detail penawaran
                tersedia.
              </CardDescription>
            </div>
            <Badge className="w-fit bg-slate-500/80">
              Menyiapkan Penawaran
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Separator />
          <div className="rounded-lg border border-muted/70 bg-muted/50 p-4 text-sm">
            <p>
              Detail penawaran saat ini tidak dapat ditampilkan karena penawaran
              aktif belum ditemukan atau belum diaktifkan.
            </p>
          </div>
        </CardContent>
      </Card>
    );

    // ── status yang tampilkan form utama (belum upload / baru dikirim / dilihat) ──
    const isActiveOfferStatus =
      !application.offerStatus ||
      ["sent", "viewed"].includes(application.offerStatus);
    const isDocumentUploadedStatus = ["accepted", "accepted_pending_document", "document_uploaded"].includes(application.offerStatus || "");

    if (isActuallyLoading) {
      return (
        <Card className="flex flex-col border-primary/20 animate-pulse">
          <CardHeader>
            <Skeleton className="h-8 w-3/4 mb-2" />
            <Skeleton className="h-4 w-1/2" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <div className="grid grid-cols-2 gap-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </CardContent>
        </Card>
      );
    }

    if (!activeOfferIsAvailable && isActiveOfferStatus) {
      return renderMissingOfferDetails();
    }

    // ── data derivasi ─────────────────────────────────────────────────────────
    const brandName = application.brandName || "";
    const candidateName = application.candidateName || "";
    const jobPosition = application.jobPosition || "";
    const deadline = offerResponseDeadline;
    const deadlineDateLabel = deadline
      ? format(deadline, "EEEE, dd MMMM yyyy", { locale: id })
      : "-";
    const deadlineTimeLabel = deadline ? format(deadline, "HH:mm") : "-";
    const hcName = offerDetails.humanCapitalContactName || "";
    const hcPhone = offerDetails.humanCapitalContactPhone || "";
    const hcContact = [hcName, hcPhone].filter(Boolean).join(" - ") || offerDetails.humanCapitalContact || offerDetails.hrContact || "";

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

    const infoItems = [
      deadline && {
        label: "Batas Konfirmasi",
        value: `${deadlineDateLabel}, pukul ${deadlineTimeLabel} WIB`,
      },
      offerDetails.startDate && {
        label: "Tanggal Mulai Kerja / Program",
        value: (() => {
          try { return format(new Date(offerDetails.startDate!), "dd MMMM yyyy", { locale: id }); }
          catch { return String(offerDetails.startDate); }
        })(),
      },
      offerDetails.contractDurationMonths && {
        label: "Durasi Kontrak / Program",
        value: `${offerDetails.contractDurationMonths} bulan`,
      },
      offerDetails.firstDayTime && {
        label: "Jam Hadir Hari Pertama",
        value: `${offerDetails.firstDayTime} WIB`,
      },
      offerDetails.firstDayLocation && {
        label: "Lokasi Hari Pertama",
        value: offerDetails.firstDayLocation,
      },
      hcContact && {
        label: "Kontak Human Capital",
        value: hcContact,
      },
    ].filter(Boolean) as { label: string; value: string }[];

    // ── helper: InfoItem grid ─────────────────────────────────────────────────
    const InfoGrid = () => infoItems.length > 0 ? (
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {infoItems.map(({ label, value }) => (
          <div key={label} className="flex justify-between items-baseline gap-4 py-2.5">
            <p className="text-xs text-slate-500 dark:text-slate-400 shrink-0">{label}</p>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200 text-right">{value}</p>
          </div>
        ))}
      </div>
    ) : null;

    // ── helper: Countdown strip ───────────────────────────────────────────────
    const CountdownStrip = () => !deadline ? null : (
      <div className={cn(
        "rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3",
        hasExpired
          ? "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300"
          : "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400"
      )}>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider mb-1 opacity-70">
            Batas Waktu Konfirmasi
          </p>
          {hasExpired ? (
            <p className="text-sm font-semibold">Batas waktu telah berakhir</p>
          ) : countdownParts ? (
            <p className="text-sm font-semibold tabular-nums">
              {countdownParts.days}h {String(countdownParts.hours).padStart(2,"0")}j{" "}
              {String(countdownParts.minutes).padStart(2,"0")}m{" "}
              {String(countdownParts.seconds).padStart(2,"0")}d
            </p>
          ) : null}
        </div>
        <p className="text-xs opacity-80">
          s/d {deadlineDateLabel} pukul {deadlineTimeLabel} WIB
        </p>
      </div>
    );

    // ── STEP 2: sudah accept, menunggu / sudah upload dokumen ─────────────────
    if (isDocumentUploadedStatus) {
      const isUploaded = application.offerStatus === "document_uploaded" || !!(application as any).signedOfferUrl;
      return (
        <div className="space-y-4">
          {/* Header */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <Badge className={cn(
                "w-fit mb-1 border-0",
                isUploaded
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                  : "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"
              )}>
                {isUploaded ? "Dokumen Penerimaan Telah Dikirim" : "Menunggu Dokumen Penerimaan"}
              </Badge>
              <CardTitle className="text-xl">Surat Penawaran Kerja: {jobPosition}</CardTitle>
            </CardHeader>
          </Card>

          {/* Status selesai */}
          {isUploaded ? (
            <Card className="border border-emerald-200 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20">
              <CardContent className="pt-5 pb-5 flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-emerald-800 dark:text-emerald-300">
                    Dokumen Penerimaan Telah Dikirim
                  </p>
                  {(application as any).signedOfferFileName && (
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                      File: {(application as any).signedOfferFileName}
                    </p>
                  )}
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    Tim Human Capital akan meninjau dokumen Anda dan menghubungi Anda untuk tahap berikutnya.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            /* Upload dokumen */
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileUp className="h-4 w-4 text-primary" />
                  Unggah Dokumen Penerimaan Posisi
                </CardTitle>
                <CardDescription className="text-sm">
                  Apabila Saudara menyetujui penawaran ini, silakan membubuhkan tanda tangan pada{" "}
                  <strong>Lembar Penerimaan Posisi</strong>. Jika pada dokumen terdapat kolom materai,
                  Saudara dapat menggunakan materai elektronik atau materai tempel fisik sesuai ketentuan
                  yang berlaku. Setelah dokumen ditandatangani dan dibubuhi materai, silakan unggah kembali
                  dokumen tersebut melalui portal ini sebelum batas waktu konfirmasi offering.
                  <br /><br />
                  <span className="text-slate-500 dark:text-slate-400">
                    Format: PDF, DOC, DOCX, JPG, PNG.
                  </span>
                </CardDescription>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  Pastikan tanda tangan, nama, tanggal, dan materai terlihat jelas sebelum dokumen diunggah.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {offerDocumentUrl && (
                  <Button variant="outline" size="sm" className="w-full" onClick={() =>
                    openOfferingDocument({ offeringId: activeOffering?.id, documentUrl: offerDocumentUrl, documentPath: offerDocumentPath, documentName: offerDocumentName }, "download")
                      .catch((e) => toast({ variant: "destructive", title: "Gagal Mengunduh", description: e.message }))
                  }>
                    <Download className="h-3.5 w-3.5 mr-1.5" />
                    Download Surat Penawaran
                  </Button>
                )}
                <input
                  type="file"
                  accept="application/pdf,image/*,.doc,.docx"
                  onChange={(e) => setSignedFile(e.target.files?.[0] || null)}
                  disabled={isUploading}
                  className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-primary/90"
                />
                {isUploading && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>Mengunggah...</span><span>{uploadProgress}%</span>
                    </div>
                    <Progress value={uploadProgress} className="h-1.5" />
                  </div>
                )}
                <Button type="button" className="w-full" size="lg"
                  disabled={!signedFile || isUploading}
                  onClick={handleSignedDocumentUpload}>
                  <FileUp className="h-4 w-4 mr-2" />
                  {isUploading ? "Mengunggah..." : "Kirim Dokumen Penerimaan"}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Ringkasan info (compact) */}
          {infoItems.length > 0 && (
            <Card className="border-0 shadow-sm bg-slate-50/50 dark:bg-slate-900/30">
              <CardContent className="pt-4 pb-4">
                <InfoGrid />
              </CardContent>
            </Card>
          )}
        </div>
      );
    }

    // ── STEP 1: penawaran aktif, belum diterima kandidat ─────────────────────
    if (isActiveOfferStatus && activeOfferIsAvailable) {
      const offeringDocRef = { offeringId: activeOffering?.id, documentUrl: offerDocumentUrl, documentPath: offerDocumentPath, documentName: offerDocumentName };
      const handlePreview = () => openOfferingDocument(offeringDocRef, "preview").catch((e) => toast({ variant: "destructive", title: "Gagal Membuka", description: e.message }));
      const handleDownload = () => openOfferingDocument(offeringDocRef, "download").catch((e) => toast({ variant: "destructive", title: "Gagal Mengunduh", description: e.message }));

      return (
        <div className="space-y-4">

          {/* 1. Header */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <Badge className="w-fit mb-1 bg-green-100 text-green-700 border-0 dark:bg-green-950/50 dark:text-green-300">
                Penawaran Tersedia
              </Badge>
              <CardTitle className="text-xl">
                Surat Penawaran Kerja: {jobPosition}
              </CardTitle>
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

          {/* 3. Batas Waktu Konfirmasi */}
          {deadline && (
            <Card className={cn(
              "border-0 shadow-sm",
              hasExpired ? "bg-red-50 dark:bg-red-950/20" : "bg-amber-50 dark:bg-amber-950/20"
            )}>
              <CardContent className="pt-4 pb-4">
                <p className={cn(
                  "text-[10px] font-bold uppercase tracking-wider mb-2",
                  hasExpired ? "text-red-500" : "text-amber-600 dark:text-amber-400"
                )}>
                  Batas Waktu Konfirmasi Offering
                </p>
                {hasExpired ? (
                  <p className="text-sm font-semibold text-red-600 dark:text-red-400">
                    Batas waktu konfirmasi telah berakhir.
                    {hcContact && ` Hubungi Tim Human Capital melalui ${hcContact}.`}
                  </p>
                ) : countdownParts ? (
                  <>
                    <div className="flex items-center gap-3 mb-2">
                      {[
                        { v: countdownParts.days, label: "Hari" },
                        { v: countdownParts.hours, label: "Jam" },
                        { v: countdownParts.minutes, label: "Menit" },
                        { v: countdownParts.seconds, label: "Detik" },
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
                ) : null}
              </CardContent>
            </Card>
          )}

          {/* 4. Dokumen Penawaran Resmi */}
          {offerDocumentUrl && (
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Dokumen Penawaran Resmi</CardTitle>
                <CardDescription className="text-xs">
                  Buka Surat Penawaran Kerja untuk membaca detail penawaran secara lengkap.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0 pb-4 space-y-2">
                <Button variant="outline" size="sm" className="w-full" onClick={handlePreview}>
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
              {hasExpired ? (
                <div className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-300">
                  Batas waktu konfirmasi telah berakhir. Hubungi Tim Human Capital
                  {hcContact ? ` melalui ${hcContact}` : ""} untuk informasi lebih lanjut.
                </div>
              ) : (
                <>
                  <Button
                    type="button"
                    size="lg"
                    className="w-full"
                    onClick={async () => {
                      if (!firebaseUser || !application.id) return;
                      try {
                        const appRef = doc(firestore, "applications", application.id);
                        await updateDocumentNonBlocking(appRef, {
                          offerStatus: "accepted_pending_document",
                          candidateVisibleStatus: "offering_document_upload",
                          candidateOfferDecisionAt: serverTimestamp(),
                          updatedAt: serverTimestamp(),
                        });
                        toast({ title: "Penawaran Diterima", description: "Silakan unggah dokumen penerimaan yang telah ditandatangani." });
                      } catch (e: any) {
                        toast({ variant: "destructive", title: "Gagal", description: e.message });
                      }
                    }}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Saya Menerima Penawaran
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

        </div>
      );
    }

    return renderMissingOfferDetails();
  }

  if (isHired) {
    return (
      <Card className="flex flex-col bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4">
            <div>
              <CardTitle className="text-xl text-green-800 dark:text-green-200">
                {application.jobPosition}
              </CardTitle>
              <CardDescription className="flex items-center gap-2 pt-1 text-green-700 dark:text-green-300">
                <Building className="h-4 w-4" /> {application.brandName}
              </CardDescription>
            </div>
            <Badge className="w-fit bg-green-600 hover:bg-green-700">
              Akun Diaktifkan
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex-grow space-y-4">
          <div className="p-4 rounded-md border-dashed border-green-400 bg-green-100 dark:bg-green-900/30 text-green-900 dark:text-green-100">
            <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
              <Award className="h-5 w-5" /> Selamat! Anda sekarang adalah bagian
              dari tim.
            </h3>
            <p className="text-sm">
              Akun Anda telah diaktifkan. Silakan logout, kemudian login kembali
              melalui Portal Karyawan untuk mengakses dasbor internal Anda.
            </p>
          </div>
        </CardContent>
        <CardFooter className="bg-green-100/50 dark:bg-green-900/20 p-4 border-t border-green-200 dark:border-green-800 flex justify-end">
          <Button asChild>
            <Link href="/admin/login">
              Ke Portal Karyawan <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  if (isAssessmentStage) {
    // If candidate already completed the test globally, don't ask them to re-test
    if (hasCompletedTest || application.personalityTestCompleted) {
      // Show "awaiting review" — the test result will be applied automatically
      return (
        <Card className="flex flex-col border-teal-200 dark:border-teal-800">
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4">
              <div>
                <CardTitle className="text-xl">{application.jobPosition}</CardTitle>
                <CardDescription>{application.brandName}</CardDescription>
              </div>
              <Badge className="w-fit bg-teal-600 text-white">Dalam Evaluasi</Badge>
            </div>
          </CardHeader>
          <CardContent className="flex-grow space-y-4">
            <div className="p-4 rounded-lg border border-teal-200 bg-teal-50 dark:border-teal-800 dark:bg-teal-900/20">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-teal-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h3 className="font-semibold text-teal-800 dark:text-teal-200">
                    Tes Kepribadian: Selesai
                  </h3>
                  <p className="text-sm text-teal-700 dark:text-teal-300 leading-relaxed">
                    Lamaran Anda sedang dalam proses evaluasi. Hasil tes kepribadian
                    yang sudah Anda selesaikan akan digunakan dalam proses evaluasi
                    posisi ini.
                  </p>
                </div>
              </div>
            </div>

            {/* 5-stage timeline: desktop horizontal / mobile vertical */}
            {(() => {
              type TState = "done" | "active" | "pending";
              const tStages: { label: string; sublabel: string; state: TState }[] = [
                { label: "Lamaran & Tes Kepribadian", sublabel: "Selesai", state: "done" },
                { label: "Evaluasi HRD", sublabel: "Sedang Berjalan", state: "active" },
                { label: "Wawancara", sublabel: "Menunggu", state: "pending" },
                { label: "Offering", sublabel: "Menunggu", state: "pending" },
                { label: "Keputusan Akhir", sublabel: "Menunggu", state: "pending" },
              ];
              const dot = (state: TState) => cn(
                "flex items-center justify-center rounded-full shrink-0 font-bold h-7 w-7 text-xs",
                state === "done" && "bg-teal-500 text-white",
                state === "active" && "bg-white dark:bg-slate-900 border-2 border-teal-500 text-teal-600 dark:text-teal-400",
                state === "pending" && "bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-300 dark:border-slate-600",
              );
              const lbl = (state: TState) => cn(
                "font-semibold text-[11px] sm:text-xs leading-tight",
                state === "done" && "text-teal-700 dark:text-teal-400",
                state === "active" && "text-slate-900 dark:text-white",
                state === "pending" && "text-slate-400 dark:text-slate-600",
              );
              const sub = (state: TState) => cn(
                "text-[10px] mt-0.5",
                state === "done" && "text-teal-600/80 dark:text-teal-500/80",
                state === "active" && "text-teal-600 dark:text-teal-400 font-semibold",
                state === "pending" && "text-slate-400 dark:text-slate-600",
              );
              const conn = (state: TState) => cn(
                "hidden sm:block h-0.5 flex-1 rounded-full shrink-0",
                state === "done" ? "bg-teal-400 dark:bg-teal-600" : "bg-slate-200 dark:bg-slate-700",
              );
              const mconn = (state: TState) => cn(
                "sm:hidden w-0.5 h-3 rounded-full ml-3",
                state === "done" ? "bg-teal-400 dark:bg-teal-600" : "bg-slate-200 dark:bg-slate-700",
              );
              return (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-4">
                    Tahapan Seleksi
                  </p>
                  {/* Desktop */}
                  <div className="hidden sm:flex items-center gap-0">
                    {tStages.map((s, i) => (
                      <React.Fragment key={i}>
                        <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
                          <div className={dot(s.state)}>
                            {s.state === "done" ? <Check className="h-3.5 w-3.5" /> : i + 1}
                          </div>
                          <span className={cn(lbl(s.state), "text-center px-0.5")}>{s.label}</span>
                          <span className={cn(sub(s.state), "text-center")}>{s.sublabel}</span>
                        </div>
                        {i < tStages.length - 1 && <div className={conn(s.state)} />}
                      </React.Fragment>
                    ))}
                  </div>
                  {/* Mobile */}
                  <ol className="flex flex-col sm:hidden">
                    {tStages.map((s, i) => (
                      <li key={i}>
                        <div className="flex items-start gap-3">
                          <div className={dot(s.state)}>
                            {s.state === "done" ? <Check className="h-3.5 w-3.5" /> : i + 1}
                          </div>
                          <div className="pt-0.5 pb-1">
                            <p className={lbl(s.state)}>{s.label}</p>
                            <p className={sub(s.state)}>{s.sublabel}</p>
                          </div>
                        </div>
                        {i < tStages.length - 1 && <div className={mconn(s.state)} />}
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })()}

            <div className="flex gap-2 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-3">
              <Info className="h-4 w-4 shrink-0 text-blue-500 mt-0.5" />
              <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
                Pembaruan status seleksi akan ditampilkan melalui portal ini. Anda tidak
                perlu mengikuti tes kepribadian kembali.
              </p>
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className="flex flex-col border-yellow-500/50">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4">
            <div>
              <CardTitle className="text-xl">
                Langkah Selanjutnya: {application.jobPosition}
              </CardTitle>
              <CardDescription>
                Anda diundang untuk menyelesaikan tes kepribadian sebagai bagian
                dari proses seleksi.
              </CardDescription>
            </div>
            <Badge className="w-fit bg-yellow-500/80 text-yellow-900">
              Menunggu Tes
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex-grow space-y-4">
          <div className="p-4 rounded-md border-dashed border-yellow-400 bg-yellow-50 dark:bg-yellow-900/30 text-yellow-900 dark:text-yellow-100">
            <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
              <BrainCircuit className="h-5 w-5" /> Tes Kepribadian
            </h3>
            <p className="text-sm">
              Hasil tes ini merupakan bagian penting dari proses seleksi kami.
              Silakan selesaikan tes ini untuk melanjutkan ke tahap berikutnya.
              Tes ini tidak memiliki batas waktu, namun kami sarankan untuk
              menyelesaikannya sesegera mungkin.
            </p>
          </div>
        </CardContent>
        <CardFooter className="bg-muted/50 p-4 border-t flex justify-end">
          <Button asChild>
            <Link
              href={`/careers/portal/assessment/personality?applicationId=${application.id}`}
            >
              Mulai Tes Kepribadian <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  if (isInterviewStage) {
    // ── Shared preparation tips box ───────────────────────────────────────────
    const PrepTips = () => (
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
          Persiapan Sebelum Wawancara
        </p>
        <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
          {[
            "Pastikan koneksi internet Anda stabil sebelum sesi dimulai.",
            "Gunakan perangkat dengan kamera dan mikrofon yang berfungsi dengan baik.",
            "Masuk ke ruang wawancara 5–10 menit sebelum jadwal yang ditentukan.",
            "Siapkan CV, portofolio, dan dokumen pendukung jika diperlukan.",
            "Gunakan nama asli sesuai profil kandidat Anda saat bergabung.",
          ].map((tip, i) => (
            <li key={i} className="flex items-start gap-2">
              <Check className="h-4 w-4 text-teal-500 shrink-0 mt-0.5" />
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      </div>
    );

    // ── Selection timeline — horizontal desktop / vertical mobile ────────────
    const InterviewTimeline = ({ active }: { active: "scheduled" | "done" | "waiting" }) => {
      type StageState = "done" | "active" | "pending";
      const stages: { label: string; sublabel: string; state: StageState }[] = [
        { label: "Lamaran & Tes Kepribadian", sublabel: "Selesai", state: "done" },
        { label: "Evaluasi HRD", sublabel: "Selesai", state: "done" },
        {
          label: "Wawancara",
          sublabel: active === "done" ? "Selesai" : active === "scheduled" ? "Terjadwal" : "Menunggu Jadwal",
          state: active === "done" ? "done" : "active",
        },
        {
          label: "Offering",
          sublabel: "Menunggu",
          state: "pending" as StageState,
        },
        {
          label: "Keputusan Akhir",
          sublabel: "Menunggu",
          state: "pending" as StageState,
        },
      ];

      const dotClass = (state: StageState) =>
        cn(
          "flex items-center justify-center rounded-full shrink-0 font-bold",
          // desktop: smaller dot inline; mobile: slightly bigger
          "h-7 w-7 text-xs sm:h-8 sm:w-8",
          state === "done" && "bg-emerald-500 text-white",
          state === "active" && "bg-white dark:bg-slate-900 border-2 border-indigo-500 text-indigo-600 dark:text-indigo-400",
          state === "pending" && "bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700",
        );

      const labelClass = (state: StageState) =>
        cn(
          "text-sm font-semibold leading-tight",
          state === "done" && "text-emerald-700 dark:text-emerald-400",
          state === "active" && "text-slate-900 dark:text-white",
          state === "pending" && "text-slate-400 dark:text-slate-500",
        );

      const sublabelClass = (state: StageState) =>
        cn(
          "text-[11px] mt-0.5",
          state === "done" && "text-emerald-600/80 dark:text-emerald-500/80",
          state === "active" && "text-indigo-600 dark:text-indigo-400 font-semibold",
          state === "pending" && "text-slate-400 dark:text-slate-600",
        );

      const connectorClass = (prevState: StageState) =>
        cn(
          "shrink-0 rounded-full",
          // vertical connector on mobile, horizontal on desktop
          "hidden sm:block h-0.5 flex-1",
          prevState === "done" ? "bg-emerald-400 dark:bg-emerald-600" : "bg-slate-200 dark:bg-slate-700",
        );

      const mobileConnectorClass = (prevState: StageState) =>
        cn(
          "sm:hidden w-0.5 h-4 rounded-full ml-3.5",
          prevState === "done" ? "bg-emerald-400 dark:bg-emerald-600" : "bg-slate-200 dark:bg-slate-700",
        );

      return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-4">
            Tahapan Seleksi
          </p>

          {/* ── Desktop: horizontal stepper ── */}
          <div className="hidden sm:flex items-center gap-0">
            {stages.map((s, i) => (
              <React.Fragment key={i}>
                <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
                  <div className={dotClass(s.state)}>
                    {s.state === "done" ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </div>
                  <span className={cn(labelClass(s.state), "text-center text-[12px] sm:text-xs leading-tight px-1")}>
                    {s.label}
                  </span>
                  <span className={cn(sublabelClass(s.state), "text-center text-[10px]")}>
                    {s.sublabel}
                  </span>
                </div>
                {i < stages.length - 1 && (
                  <div className={connectorClass(s.state)} />
                )}
              </React.Fragment>
            ))}
          </div>

          {/* ── Mobile: vertical stepper ── */}
          <ol className="flex flex-col sm:hidden">
            {stages.map((s, i) => (
              <li key={i}>
                <div className="flex items-start gap-3">
                  <div className={dotClass(s.state)}>
                    {s.state === "done" ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </div>
                  <div className="pt-0.5 pb-1">
                    <p className={labelClass(s.state)}>{s.label}</p>
                    <p className={sublabelClass(s.state)}>{s.sublabel}</p>
                  </div>
                </div>
                {i < stages.length - 1 && (
                  <div className={mobileConnectorClass(s.state)} />
                )}
              </li>
            ))}
          </ol>
        </div>
      );
    };

    // ── DONE state ────────────────────────────────────────────────────────────
    if (isInterviewActuallyDone) {
      return (
        <div className="space-y-3">
          {/* Status card */}
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 dark:bg-indigo-950/40 dark:border-indigo-800 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-indigo-100 dark:border-indigo-800/50 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-indigo-100 dark:bg-indigo-800/60 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <p className="font-bold text-indigo-900 dark:text-indigo-100 text-base">
                  Evaluasi Setelah Wawancara
                </p>
              </div>
              <Badge className="bg-indigo-600 hover:bg-indigo-600 text-white text-xs font-semibold px-3 py-1">
                Dalam Evaluasi
              </Badge>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-indigo-800 dark:text-indigo-300 leading-relaxed">
                Terima kasih telah mengikuti proses wawancara. Saat ini hasil wawancara Anda sedang dalam proses evaluasi oleh tim rekrutmen. Silakan pantau halaman ini secara berkala.
              </p>
            </div>
          </div>

          {/* Timeline — horizontal desktop / vertical mobile */}
          <InterviewTimeline active="done" />

          {/* Info box */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                <Info className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Status saat ini: Evaluasi Setelah Wawancara.
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                  Seluruh informasi lanjutan akan ditampilkan melalui portal ini. Anda tidak perlu
                  mengirim ulang lamaran selama status masih dalam proses.
                </p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // ── SCHEDULED state ───────────────────────────────────────────────────────
    if (scheduledInterview) {
      const interviewStart = scheduledInterview.startAt.toDate();
      const interviewEnd = scheduledInterview.endAt.toDate();
      const twoHoursInMs = 2 * 60 * 60 * 1000;
      const isActuallyCompleted =
        isPostInterviewEvaluationState ||
        now.getTime() > interviewEnd.getTime() + twoHoursInMs;

      if (isActuallyCompleted) {
        return (
          <div className="space-y-3">
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 dark:bg-indigo-950/40 dark:border-indigo-800 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-indigo-100 dark:border-indigo-800/50 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-indigo-100 dark:bg-indigo-800/60 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <p className="font-bold text-indigo-900 dark:text-indigo-100 text-base">
                    Evaluasi Setelah Wawancara
                  </p>
                </div>
                <Badge className="bg-indigo-600 hover:bg-indigo-600 text-white text-xs font-semibold px-3 py-1">
                  Dalam Evaluasi
                </Badge>
              </div>
              <div className="px-5 py-4">
                <p className="text-sm text-indigo-800 dark:text-indigo-300 leading-relaxed">
                  Terima kasih telah mengikuti proses wawancara. Saat ini hasil wawancara Anda sedang dalam proses evaluasi oleh tim rekrutmen. Silakan pantau halaman ini secara berkala.
                </p>
              </div>
            </div>
            <InterviewTimeline active="done" />
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                  <Info className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    Status saat ini: Evaluasi Setelah Wawancara.
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                    Seluruh informasi lanjutan akan ditampilkan melalui portal ini. Anda tidak perlu
                    mengirim ulang lamaran selama status masih dalam proses.
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
      }

      // Before or during interview
      const isDuring = now >= interviewStart && now < interviewEnd;
      const durationMins = differenceInMinutes(interviewEnd, interviewStart);
      // All interviews for this candidate at this stage
      const allScheduled = (application.interviews || []).filter(i => i.status === "scheduled");

      return (
        <div className="space-y-4">
          {/* Header banner */}
          <div className={cn(
            "rounded-xl border p-5 shadow-sm",
            isDuring
              ? "border-amber-200 bg-amber-50 dark:bg-amber-900/20"
              : "border-teal-200 bg-teal-50 dark:bg-teal-900/20"
          )}>
            <div className="flex items-start gap-3">
              <div className={cn(
                "h-10 w-10 rounded-full flex items-center justify-center shrink-0",
                isDuring
                  ? "bg-amber-100 dark:bg-amber-800/40"
                  : "bg-teal-100 dark:bg-teal-800/40"
              )}>
                {isDuring
                  ? <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400 animate-pulse" />
                  : <Calendar className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className={cn("font-bold text-base",
                    isDuring ? "text-amber-900 dark:text-amber-100" : "text-teal-900 dark:text-teal-100"
                  )}>
                    {isDuring ? "Wawancara Sedang Berlangsung" : "Jadwal Wawancara Anda Telah Tersedia"}
                  </p>
                  <Badge className={cn("text-[10px] px-2 py-0 font-semibold",
                    isDuring
                      ? "bg-amber-200 text-amber-800 dark:bg-amber-800/40 dark:text-amber-200 border-0"
                      : "bg-teal-200 text-teal-800 dark:bg-teal-800/40 dark:text-teal-200 border-0"
                  )}>
                    {isDuring ? "Berlangsung" : "Tahap Wawancara"}
                  </Badge>
                </div>
                <p className={cn("text-sm mt-1 leading-relaxed",
                  isDuring ? "text-amber-800/80 dark:text-amber-200/80" : "text-teal-800/80 dark:text-teal-200/80"
                )}>
                  {isDuring
                    ? "Sesi wawancara Anda sedang berlangsung. Silakan segera bergabung ke ruang wawancara."
                    : "Selamat, Anda telah masuk ke tahap wawancara untuk posisi ini. Silakan periksa detail jadwal berikut dan pastikan Anda hadir sesuai waktu yang telah ditentukan."
                  }
                </p>
              </div>
            </div>
          </div>

          {/* Interview card(s) — one per scheduled slot */}
          {allScheduled.map((iv, idx) => {
            const ivStart = iv.startAt.toDate();
            const ivEnd = iv.endAt.toDate();
            const ivDuration = differenceInMinutes(ivEnd, ivStart);
            const isPublished = iv.meetingPublished !== false;
            return (
              <div key={iv.interviewId || idx} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
                {/* Card header */}
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white">{application.jobPosition}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{application.brandName}</p>
                  </div>
                  <Badge variant="outline" className="border-teal-300 text-teal-700 dark:border-teal-700 dark:text-teal-300 text-[10px] font-semibold">
                    Terjadwal
                  </Badge>
                </div>

                {/* Detail grid */}
                <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                  <div className="flex items-start gap-3">
                    <Calendar className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">Tanggal</p>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        {format(ivStart, "eeee, dd MMMM yyyy", { locale: id })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Clock className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">Waktu (WIB)</p>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        {format(ivStart, "HH.mm")} – {format(ivEnd, "HH.mm")} WIB
                        <span className="ml-1.5 text-slate-400 font-normal">({ivDuration} menit)</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <LinkIcon className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">Metode</p>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Online Meeting</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <MapPin className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">Media</p>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        {iv.meetingLink ? (
                          (() => {
                            try {
                              const host = new URL(iv.meetingLink).hostname.replace("www.", "");
                              if (host.includes("zoom")) return "Zoom Meeting";
                              if (host.includes("meet.google")) return "Google Meet";
                              if (host.includes("teams")) return "Microsoft Teams";
                              return "Online Meeting";
                            } catch {
                              return "Online Meeting";
                            }
                          })()
                        ) : "Online Meeting"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* CTA */}
                <div className="px-5 pb-5">
                  {isPublished && iv.meetingLink ? (
                    <Button asChild className="w-full sm:w-auto bg-teal-600 hover:bg-teal-700 text-white">
                      <a href={iv.meetingLink} target="_blank" rel="noopener noreferrer">
                        <LinkIcon className="mr-2 h-4 w-4" />
                        Masuk ke Ruang Wawancara
                      </a>
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-500 dark:text-slate-400">
                      <Info className="h-4 w-4 shrink-0" />
                      Link wawancara belum tersedia. Silakan pantau portal ini secara berkala.
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Info notice */}
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
            <Info className="h-4 w-4 shrink-0 mt-0.5 text-slate-400" />
            Seluruh pembaruan jadwal dan instruksi wawancara akan ditampilkan melalui portal ini. Silakan pantau halaman ini secara berkala.
          </div>

          {!isDuring && <PrepTips />}
          <InterviewTimeline active="scheduled" />
        </div>
      );
    }

    // ── TEMPLATE date only (no assigned slot) ─────────────────────────────────
    if (job?.interviewTemplate?.defaultStartDate) {
      const template = job.interviewTemplate;
      const templateDate = template.defaultStartDate!.toDate();
      const templateTime = template.workdayStartTime || "—";
      const templateLink = template.meetingLink;

      return (
        <div className="space-y-4">
          <div className="rounded-xl border border-teal-200 bg-teal-50 dark:bg-teal-900/20 p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-teal-100 dark:bg-teal-800/40 flex items-center justify-center shrink-0">
                <Calendar className="h-5 w-5 text-teal-600 dark:text-teal-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-base text-teal-900 dark:text-teal-100">
                    Jadwal Wawancara Anda Telah Tersedia
                  </p>
                  <Badge className="bg-teal-200 text-teal-800 dark:bg-teal-800/40 dark:text-teal-200 border-0 text-[10px] font-semibold">
                    Tahap Wawancara
                  </Badge>
                </div>
                <p className="text-sm mt-1 leading-relaxed text-teal-800/80 dark:text-teal-200/80">
                  Selamat, Anda telah masuk ke tahap wawancara untuk posisi ini. Silakan periksa detail jadwal berikut dan pastikan Anda hadir sesuai waktu yang telah ditentukan.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="font-bold text-slate-900 dark:text-white">{application.jobPosition}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{application.brandName}</p>
              </div>
              <Badge variant="outline" className="border-teal-300 text-teal-700 dark:border-teal-700 dark:text-teal-300 text-[10px] font-semibold">
                Terjadwal
              </Badge>
            </div>
            <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
              <div className="flex items-start gap-3">
                <Calendar className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">Tanggal</p>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    {format(templateDate, "eeee, dd MMMM yyyy", { locale: id })}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Clock className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">Waktu (WIB)</p>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{templateTime} WIB</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <LinkIcon className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">Metode</p>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Online Meeting</p>
                </div>
              </div>
            </div>
            <div className="px-5 pb-5">
              {templateLink ? (
                <Button asChild className="w-full sm:w-auto bg-teal-600 hover:bg-teal-700 text-white">
                  <a href={templateLink} target="_blank" rel="noopener noreferrer">
                    <LinkIcon className="mr-2 h-4 w-4" />
                    Masuk ke Ruang Wawancara
                  </a>
                </Button>
              ) : (
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-500 dark:text-slate-400">
                  <Info className="h-4 w-4 shrink-0" />
                  Link wawancara belum tersedia. Silakan pantau portal ini secara berkala.
                </div>
              )}
            </div>
          </div>

          <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
            <Info className="h-4 w-4 shrink-0 mt-0.5 text-slate-400" />
            Seluruh pembaruan jadwal dan instruksi wawancara akan ditampilkan melalui portal ini. Silakan pantau halaman ini secara berkala.
          </div>

          <PrepTips />
          <InterviewTimeline active="scheduled" />
        </div>
      );
    }

    // ── NO SCHEDULE YET ───────────────────────────────────────────────────────
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 dark:bg-indigo-900/20 p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-indigo-100 dark:bg-indigo-800/40 flex items-center justify-center shrink-0">
              <Calendar className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <p className="font-bold text-indigo-900 dark:text-indigo-100">Anda Lanjut ke Tahap Wawancara</p>
              <p className="text-sm text-indigo-700 dark:text-indigo-300 mt-1 leading-relaxed">
                Selamat, lamaran Anda telah dilanjutkan ke tahap wawancara. Tim rekrutmen sedang
                menyiapkan jadwal wawancara untuk Anda.
              </p>
              <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-100 dark:bg-indigo-800/40 border border-indigo-200 dark:border-indigo-700">
                <Clock className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                  Menunggu Jadwal Wawancara
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
          <Info className="h-4 w-4 shrink-0 mt-0.5 text-slate-400" />
          Seluruh pembaruan jadwal dan instruksi wawancara akan ditampilkan melalui portal ini. Silakan pantau halaman ini secara berkala.
        </div>

        <PrepTips />
        <InterviewTimeline active="waiting" />
      </div>
    );
  }

  // 5-stage recruitment timeline visible to candidates
  const TIMELINE_STAGES = [
    { key: "start",     label: "Lamaran & Tes Kepribadian", icon: FileText },
    { key: "eval",      label: "Evaluasi HRD",              icon: Search  },
    { key: "interview", label: "Wawancara",                 icon: Users   },
    { key: "offering",  label: "Offering",                  icon: FileSignature },
    { key: "decision",  label: "Keputusan Akhir",           icon: Award   },
  ] as const;

  const stageIndex = (status: string): number => {
    if (["submitted", "tes_kepribadian"].includes(status)) return 0;
    if (["screening", "verification", "document_submission"].includes(status)) return 1;
    if (status === "interview") return 2;
    if (status === "offered") return 3;
    // hired → Keputusan Akhir active
    return 4;
  };
  // HRD internal negative decisions: freeze timeline at interview stage (stage 2 active).
  // Never advance to "Keputusan Akhir" just because status flipped to "rejected" internally.
  const currentStageIdx = isHRDInternalRejection
    ? 2
    : (isProcessing && hasCompletedTest)
      ? 1
      : stageIndex(application.status);

  const jobTypeLabel =
    application.jobType === "fulltime" ? "Full-time" :
    application.jobType === "internship" ? "Internship" :
    application.jobType ?? null;

  return (
    <Card className="rounded-xl shadow-sm overflow-hidden">
      {/* ── Always-visible summary row ── */}
      <div className="px-5 py-4">
        <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-3">
          {/* Left: position + meta */}
          <div className="space-y-1 min-w-0">
            <h3 className="font-semibold text-base leading-snug">
              {application.jobPosition}
            </h3>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Building className="h-3.5 w-3.5 shrink-0" />
                {application.brandName}
              </span>
              {application.location && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  {application.location}
                </span>
              )}
              {jobTypeLabel && (
                <span className="flex items-center gap-1.5">
                  <Briefcase className="h-3.5 w-3.5 shrink-0" />
                  {jobTypeLabel}
                </span>
              )}
            </div>
          </div>
          {/* Right: status badge */}
          <Badge className={cn("w-fit shrink-0 self-start", displayStatus.color)}>
            {displayStatus.text}
          </Badge>
        </div>

        {/* Bottom row: submit date + toggle button */}
        <div className="flex items-center justify-between mt-3 gap-2">
          <p className="text-xs text-muted-foreground">
            {application.submittedAt
              ? `Dikirim ${format(application.submittedAt.toDate(), "d MMM yyyy", { locale: id })}`
              : ""}
          </p>
          <button
            onClick={onToggle}
            className="inline-flex items-center gap-1 text-xs font-medium text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300 transition-colors select-none"
          >
            {isOpen ? "Tutup Detail" : "Lihat Detail Lamaran"}
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform duration-300",
                isOpen && "rotate-180",
              )}
            />
          </button>
        </div>
      </div>

      {/* ── Collapsible detail section ── */}
      <div
        className={cn(
          "grid transition-all duration-300 ease-in-out",
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t bg-slate-50 dark:bg-slate-900/40 px-5 py-5 space-y-5">

            {/* Timeline */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">
                Tahapan Rekrutmen
              </p>
              <div className="flex items-start justify-between gap-1">
                {TIMELINE_STAGES.map((stage, idx) => {
                  const isDone = idx < currentStageIdx;
                  const isCurrent = idx === currentStageIdx;
                  const Icon = stage.icon;
                  return (
                    <div
                      key={stage.key}
                      className="flex flex-1 flex-col items-center gap-1.5 min-w-[60px]"
                    >
                      <div className="relative flex items-center w-full justify-center">
                        {idx > 0 && (
                          <div
                            className={cn(
                              "absolute right-1/2 top-3 h-0.5 w-full -translate-y-px",
                              isDone || isCurrent
                                ? "bg-teal-500"
                                : "bg-slate-200 dark:bg-slate-700",
                            )}
                          />
                        )}
                        <div
                          className={cn(
                            "relative z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors",
                            isDone
                              ? "border-teal-500 bg-teal-500 text-white"
                              : isCurrent
                                ? "border-teal-500 bg-white dark:bg-slate-900 text-teal-600"
                                : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-400",
                          )}
                        >
                          {isDone ? (
                            <Check className="h-3 w-3" />
                          ) : (
                            <Icon className="h-3 w-3" />
                          )}
                        </div>
                      </div>
                      <p
                        className={cn(
                          "text-center text-[10px] leading-tight font-medium",
                          isCurrent
                            ? "text-teal-600 dark:text-teal-400"
                            : isDone
                              ? "text-slate-600 dark:text-slate-300"
                              : "text-slate-400 dark:text-slate-600",
                        )}
                      >
                        {stage.label}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            <Separator className="border-slate-200 dark:border-slate-700" />

            {/* Status content block */}
            {isHRDInternalRejection ? (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50 dark:bg-indigo-950/40 dark:border-indigo-800 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-indigo-100 dark:border-indigo-800/50 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    <p className="font-semibold text-sm text-indigo-900 dark:text-indigo-100">
                      Evaluasi Setelah Wawancara
                    </p>
                  </div>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-600 text-white">
                    Dalam Evaluasi
                  </span>
                </div>
                <div className="px-4 py-3">
                  <p className="text-sm text-indigo-800 dark:text-indigo-300 leading-relaxed">
                    Terima kasih, Anda telah menyelesaikan tahap wawancara. Saat ini tim
                    rekrutmen sedang meninjau hasil wawancara dan data pendukung Anda.
                    Seluruh pembaruan status seleksi akan ditampilkan melalui portal ini.
                    Silakan pantau halaman ini secara berkala.
                  </p>
                </div>
              </div>
            ) : isRejected ? (
              <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50">
                <div className="flex items-center gap-2 mb-2">
                  <FileClock className="h-4 w-4 text-slate-500" />
                  <h3 className="font-semibold text-sm">
                    {application.offerStatus === "rejected"
                      ? "Penawaran Ditolak"
                      : "Proses Seleksi Selesai"}
                  </h3>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {application.offerStatus === "rejected"
                    ? "Anda telah menolak penawaran kerja ini. Proses rekrutmen untuk posisi ini telah selesai."
                    : "Terima kasih telah berpartisipasi dalam proses seleksi. Pantau portal ini untuk melihat pembaruan status terbaru dari tim rekrutmen."}
                </p>
              </div>
            ) : hasFinalPositive ? (
              <div className="p-4 rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20">
                <h3 className="font-semibold text-sm flex items-center gap-2 text-emerald-800 dark:text-emerald-100 mb-2">
                  <Check className="h-4 w-4" /> Selamat! Anda lolos ke tahap berikutnya
                </h3>
                <p className="text-sm text-emerald-900/80 dark:text-emerald-200/80 leading-relaxed">
                  Hasil evaluasi wawancara Anda dinyatakan lolos. Pantau portal ini
                  untuk melihat informasi lanjutan mengenai tahap Offering.
                </p>
              </div>
            ) : isProcessing && hasCompletedTest ? (
              <div className="space-y-3">
                <div className="p-4 rounded-lg border border-teal-200 bg-teal-50 dark:border-teal-800 dark:bg-teal-900/20">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-teal-600 shrink-0 mt-0.5" />
                    <div className="space-y-1.5">
                      <h3 className="font-semibold text-sm text-teal-800 dark:text-teal-100">
                        Lamaran &amp; Tes Kepribadian Selesai — Dalam Evaluasi
                      </h3>
                      {application.personalityTestCompleted ? (
                        <p className="text-sm text-teal-700 dark:text-teal-300 leading-relaxed">
                          Lamaran Anda telah diterima. Hasil tes kepribadian yang sudah
                          Anda selesaikan sebelumnya akan digunakan dalam proses evaluasi
                          posisi ini.
                        </p>
                      ) : (
                        <p className="text-sm text-teal-700 dark:text-teal-300 leading-relaxed">
                          Lamaran dan hasil tes kepribadian Anda telah diterima. Saat ini
                          data Anda sedang ditinjau oleh tim rekrutmen melalui sistem HRP.
                        </p>
                      )}
                      <p className="text-sm text-teal-700/80 dark:text-teal-400 leading-relaxed">
                        Pantau portal ini untuk melihat pembaruan status atau jadwal
                        wawancara.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2.5 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-3">
                  <Info className="h-4 w-4 shrink-0 text-blue-500 mt-0.5" />
                  <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
                    Semua informasi seleksi akan ditampilkan di portal ini. Anda tidak
                    perlu mengirim ulang lamaran selama status masih dalam proses.
                    Pastikan data profil Anda tetap akurat agar proses seleksi berjalan
                    lancar.
                  </p>
                </div>
              </div>
            ) : isProcessing && !hasCompletedTest ? (
              <div className="p-4 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
                <div className="flex items-start gap-3">
                  <Clock className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-sm text-amber-800 dark:text-amber-100 mb-1">
                      Langkah Selanjutnya: Selesaikan Tes Kepribadian
                    </h3>
                    <p className="text-sm text-amber-700 dark:text-amber-300 leading-relaxed mb-3">
                      Lamaran Anda telah diterima. Untuk melanjutkan proses seleksi,
                      silakan selesaikan tes kepribadian terlebih dahulu.
                    </p>
                    <Button
                      asChild
                      size="sm"
                      className="bg-teal-600 hover:bg-teal-700 text-white"
                    >
                      <Link href="/careers/portal/assessment/personality">
                        Mulai Tes Kepribadian{" "}
                        <ArrowRight className="ml-2 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Interview schedule (shown inside detail if available) */}
            {isInterviewStage && scheduledInterview && (
              <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 mb-2">
                  <Calendar className="h-3.5 w-3.5" /> Jadwal Wawancara
                </p>
                <p className="text-sm font-semibold">
                  {format(
                    scheduledInterview.startAt.toDate(),
                    "eeee, d MMMM yyyy",
                    { locale: id },
                  )}
                </p>
                <p className="text-sm text-muted-foreground">
                  {format(scheduledInterview.startAt.toDate(), "HH:mm", {
                    locale: id,
                  })}{" "}
                  –{" "}
                  {format(scheduledInterview.endAt.toDate(), "HH:mm")} WIB
                </p>
                {scheduledInterview.meetingLink && (
                  <Button
                    asChild
                    size="sm"
                    className="mt-3 bg-teal-600 hover:bg-teal-700 text-white"
                  >
                    <a
                      href={scheduledInterview.meetingLink}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <LinkIcon className="mr-1.5 h-3.5 w-3.5" /> Lihat Jadwal
                      Wawancara
                    </a>
                  </Button>
                )}
              </div>
            )}

            {/* Secondary actions */}
            <div className="flex flex-wrap gap-2 pt-1">
              {isProcessing && !hasCompletedTest && (
                <Button asChild size="sm" variant="outline">
                  <Link href="/careers/portal/profile">Perbarui Profil</Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

// Wrapper that owns accordion open-state so only one card is expanded at a time
function ApplicationsList({
  applications,
  jobMap,
  hasCompletedTest,
}: {
  applications: JobApplication[];
  jobMap: Map<string, Job>;
  hasCompletedTest: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {applications.map((app) => {
        const job = jobMap.get(app.jobId);
        const id = app.id ?? "";
        return (
          <ApplicationCard
            key={id}
            application={app}
            job={job}
            hasCompletedTest={hasCompletedTest}
            isOpen={openId === id}
            onToggle={() => setOpenId(openId === id ? null : id)}
          />
        );
      })}
    </div>
  );
}

function ApplicationsPageSkeleton() {
  return (
    <div className="space-y-6">
      {[...Array(2)].map((_, i) => (
        <Card key={i}>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-32" />
              </div>
              <Skeleton className="h-6 w-24" />
            </div>
          </CardHeader>
          <CardContent>
            <Skeleton className="h-16 w-full" />
          </CardContent>
          <CardFooter className="bg-muted/50 p-4 border-t flex justify-between items-center">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-9 w-32" />
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}

export default function ApplicationsPage() {
  const { userProfile, loading: authLoading } = useAuth();
  const firestore = useFirestore();
  const uid = userProfile?.uid;

  const applicationsQuery = useMemoFirebase(() => {
    if (!uid) return null;
    return query(
      collection(firestore, "applications"),
      where("candidateUid", "==", uid),
    );
  }, [uid, firestore]);

  const {
    data: applications,
    isLoading: applicationsLoading,
    error,
  } = useCollection<JobApplication>(applicationsQuery);

  const jobIds = useMemo(() => {
    if (!applications) return [];
    return Array.from(new Set(applications.map((app) => app.jobId)));
  }, [applications]);

  const { data: jobs, isLoading: jobsLoading } = useCollection<Job>(
    useMemoFirebase(() => {
      if (jobIds.length === 0) return null;
      // Chunking would be needed for > 30 job applications to different jobs
      return query(
        collection(firestore, "jobs"),
        where("__name__", "in", jobIds.slice(0, 30)),
      );
    }, [firestore, jobIds]),
  );

  const jobMap = useMemo(() => {
    if (!jobs) return new Map<string, Job>();
    return new Map(jobs.map((job) => [job.id!, job]));
  }, [jobs]);

  const sessionsQuery = useMemoFirebase(() => {
    if (!uid) return null;
    return query(
      collection(firestore, "assessment_sessions"),
      where("candidateUid", "==", uid),
      where("status", "in", ["submitted", "completed"]),
    );
  }, [uid, firestore]);
  const { data: submittedSessions, isLoading: sessionsLoading } =
    useCollection<AssessmentSession>(sessionsQuery);

  // Candidate-level personality test record (1 per candidate)
  const candidateTestDocRef = useMemoFirebase(
    () => (uid ? doc(firestore, "candidate_personality_tests", uid) : null),
    [uid, firestore],
  );
  const { data: candidateTestDoc, isLoading: candidateTestLoading } = useDoc<{
    status?: string;
    isCompleted?: boolean;
    completedAt?: any;
    personalityTestCompleted?: boolean;
  }>(candidateTestDocRef);

  const hasCompletedTest = useMemo(() => {
    // Primary: candidate-level test record — check all possible completion signals
    if (candidateTestDoc) {
      if (
        candidateTestDoc.status === "completed" ||
        candidateTestDoc.status === "selesai" ||
        candidateTestDoc.isCompleted === true ||
        candidateTestDoc.personalityTestCompleted === true ||
        candidateTestDoc.completedAt != null
      ) return true;
    }
    // Fallback: any submitted assessment session for this candidate
    if ((submittedSessions?.length ?? 0) > 0) return true;
    // Fallback: any application where test was marked done
    if ((applications || []).some((app) => app.personalityTestCompleted === true)) return true;
    return false;
  }, [candidateTestDoc, submittedSessions, applications]);

  const sortedApplications = useMemo(() => {
    if (!applications) return [];
    return [...applications].sort((a, b) => {
      const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return timeB - timeA;
    });
  }, [applications]);

  const isLoading =
    authLoading || applicationsLoading || sessionsLoading || jobsLoading || candidateTestLoading;

  if (error) {
    return (
      <div className="p-4 border-2 border-dashed border-destructive/50 rounded-lg bg-red-50 text-destructive-foreground">
        <h3 className="font-bold text-lg mb-2 text-destructive">
          Terjadi Kesalahan
        </h3>
        <p>Gagal memuat data lamaran Anda. Silakan coba lagi nanti.</p>
        <pre className="mt-4 text-xs bg-white p-2 rounded overflow-auto text-destructive">
          {error.message}
        </pre>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Lamaran Saya</h1>
        <p className="text-muted-foreground">
          Seluruh perkembangan seleksi akan diperbarui melalui portal ini.
          Silakan tinjau halaman ini secara berkala untuk melihat status
          terbaru, jadwal wawancara, dan informasi lanjutan dari tim
          rekrutmen.
        </p>
      </div>

      {isLoading ? (
        <ApplicationsPageSkeleton />
      ) : sortedApplications && sortedApplications.length > 0 ? (
        <ApplicationsList
          applications={sortedApplications}
          jobMap={jobMap}
          hasCompletedTest={hasCompletedTest}
        />
      ) : (
        <Card className="flex flex-col items-center justify-center py-16 text-center rounded-xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
            <Briefcase className="h-7 w-7 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Belum Ada Lamaran</h3>
          <p className="text-sm text-muted-foreground max-w-xs mb-6">
            Anda belum pernah mengirimkan lamaran. Temukan lowongan yang sesuai
            dan mulai perjalanan karier Anda bersama kami.
          </p>
          <Button asChild className="bg-teal-600 hover:bg-teal-700 text-white">
            <Link href="/careers/portal/jobs">Lihat Lowongan</Link>
          </Button>
        </Card>
      )}
    </div>
  );
}
