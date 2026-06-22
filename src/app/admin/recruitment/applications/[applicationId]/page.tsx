"use client";

import { useMemo, useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import {
  useDoc,
  useFirestore,
  useMemoFirebase,
  updateDocumentNonBlocking,
  useCollection,
} from "@/firebase";
import {
  doc,
  serverTimestamp,
  updateDoc,
  writeBatch,
  Timestamp,
  collection,
  where,
  query,
  orderBy,
  limit,
  getDocs,
  deleteDoc,
} from "firebase/firestore";
import type {
  JobApplication,
  Profile,
  Job,
  ApplicationTimelineEvent,
  ApplicationInterview,
  RescheduleRequest,
  Brand,
  UserProfile,
  AssessmentSession,
  CandidatePersonalityTest,
  Offering,
} from "@/lib/types";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Mail,
  Phone,
  XCircle,
  Calendar,
  Users,
  RefreshCw,
  X,
  MessageSquare,
  AlertTriangle,
  Edit,
  ShieldCheck,
  Lock,
  GraduationCap,
  BrainCircuit,
  Info,
  Loader2,
  FileText,
  DollarSign,
  Clock,
  MapPin,
  Eye,
  ExternalLink,
  ChevronDown,
  CheckCircle2,
  Send,
  RotateCcw,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { MENU_CONFIG } from "@/lib/menu-config";
import { ProfileView } from "@/components/recruitment/ProfileView";
import {
  ApplicationStatusBadge,
  statusDisplayLabels,
} from "@/components/recruitment/ApplicationStatusBadge";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials, cn } from "@/lib/utils";
import { format, differenceInMinutes, add, isBefore } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { ApplicationProgressStepper } from "@/components/recruitment/ApplicationProgressStepper";
import { CandidateDocumentsCard } from "@/components/recruitment/CandidateDocumentsCard";
import { CandidateFitAnalysis } from "@/components/recruitment/CandidateFitAnalysis";
import { ApplicationActionBar } from "@/components/recruitment/ApplicationActionBar";
import { ApplicationNotes } from "@/components/recruitment/ApplicationNotes";
import type { ScheduleInterviewData } from "@/components/recruitment/ScheduleInterviewDialog";
import { ScheduleInterviewDialog } from "@/components/recruitment/ScheduleInterviewDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  extractFileIdFromUrl, 
  openSecureFile 
} from "@/lib/candidate-docs-utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ManagePanelistsDialog } from "@/components/recruitment/ManagePanelistsDialog";
import { ROLES_INTERNAL, ORDERED_RECRUITMENT_STAGES } from "@/lib/types";
import { InternalEvaluationSection } from "@/components/recruitment/InternalEvaluationSection";
import { PostInterviewEvaluationSection } from "@/components/recruitment/PostInterviewEvaluationSection";
import { UnifiedInternalDecision } from "@/components/recruitment/UnifiedInternalDecision";
import {
  OfferEditor,
  type OfferFormData,
} from "@/components/recruitment/OfferEditor";
import {
  CandidateStepNav,
  CandidateStepContent,
} from "@/components/recruitment/CandidateStepView";
import { MultiApplicationAlert } from "@/components/recruitment/MultiApplicationAlert";
import { getApplicationDisplayStage, getApplicationFilterStage } from "@/lib/recruitment/application-stage";

function ApplicationDetailSkeleton() {
  return <Skeleton className="h-[500px] w-full" />;
}

const InfoRow = ({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) => (
  <div className="flex items-start gap-3 rounded-lg border bg-card p-3">
    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-slate-600">
      {icon}
    </div>
    <div>
      <div className="text-xs font-medium text-slate-600">{label}</div>
      <div className="text-sm font-semibold">{value || "-"}</div>
    </div>
  </div>
);

export default function ApplicationDetailPage() {
  const hasAccess = useRoleGuard([...ROLES_INTERNAL]);
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const params = useParams();
  const { toast } = useToast();
  const applicationId = params.applicationId as string;
  const [hasTriggeredAutoScreen, setHasTriggeredAutoScreen] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isSendingOffer, setIsSendingOffer] = useState(false);
  const [isDeletingDraft, setIsDeletingDraft] = useState(false);
  const [isWithdrawingOfferings, setIsWithdrawingOfferings] = useState(false);
  const [isOfferEditMode, setIsOfferEditMode] = useState(false);
  const [isUpdatingDecision, setIsUpdatingDecision] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [isNegotiationResponseOpen, setIsNegotiationResponseOpen] =
    useState(false);
  const [negotiationResponseType, setNegotiationResponseType] = useState<
    "accepted" | "partially_accepted" | "rejected"
  >("accepted");
  const [negotiationResponseNote, setNegotiationResponseNote] = useState("");
  const [isSubmittingNegotiationResponse, setIsSubmittingNegotiationResponse] =
    useState(false);
  const [loadingDoc, setLoadingDoc] = useState<"cv" | "ijazah" | null>(null);

  const handleViewDocument = async (docType: "cv" | "ijazah") => {
    if (!application) return;
    setLoadingDoc(docType);
    try {
      const fileId =
        docType === "cv"
          ? application.cvFileId ||
            profile?.cvFileId ||
            extractFileIdFromUrl(application.cvUrl) ||
            extractFileIdFromUrl(profile?.cvUrl)
          : application.ijazahFileId ||
            profile?.ijazahFileId ||
            extractFileIdFromUrl(application.ijazahUrl) ||
            extractFileIdFromUrl(profile?.ijazahUrl);

      const fileName =
        docType === "cv"
          ? application.cvFileName || profile?.cvFileName || "CV.pdf"
          : application.ijazahFileName || profile?.ijazahFileName || "Ijazah.pdf";

      if (!fileId) {
        toast({
          variant: "destructive",
          title: "Dokumen tidak tersedia",
          description: "FileId tidak ditemukan untuk dokumen ini.",
        });
        return;
      }

      await openSecureFile(fileId, fileName);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Gagal membuka dokumen",
        description:
          error?.message || "Tidak dapat membuka dokumen. Silakan coba lagi.",
      });
    } finally {
      setLoadingDoc(null);
    }
  };

  const handleNegotiationResponse = async () => {
    if (!application || !applicationRef || !userProfile) return;
    setIsSubmittingNegotiationResponse(true);

    try {
      const isReject = negotiationResponseType === "rejected";
      const isFullAccept = negotiationResponseType === "accepted";
      
      const updatePayload: any = {
        offerStatus: isReject ? "negotiation_rejected" : "offered_final",
        candidateNegotiationResponse: {
          type: negotiationResponseType,
          note: negotiationResponseNote,
          respondedAt: Timestamp.now(),
          respondedBy: userProfile.uid,
        },
        updatedAt: serverTimestamp(),
      };

      // Add to timeline
      const timelineEvent: ApplicationTimelineEvent = {
        type: "stage_changed",
        at: Timestamp.now(),
        by: userProfile.uid,
        meta: { 
          from: "negotiation_requested", 
          to: updatePayload.offerStatus, 
          note: `Respons Negosiasi (${negotiationResponseType}): ${negotiationResponseNote}` 
        },
      };

      updatePayload.timeline = [...(application.timeline || []), timelineEvent];

      await updateDoc(applicationRef, updatePayload);
      mutateApplication();
      if (mutateOfferings) {
        mutateOfferings();
      }
      setIsNegotiationResponseOpen(false);
      setNegotiationResponseNote("");
      
      toast({
        title: "Respons Terkirim",
        description: `Kandidat telah diberikan respons "${negotiationResponseType}".`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setIsSubmittingNegotiationResponse(false);
    }
  };
  const [activeProfileStep, setActiveProfileStep] = useState(1);
  const [evaluationFilter, setEvaluationFilter] = useState<
    "all" | "pra" | "pasca" | "offering"
  >("all");

  const applicationRef = useMemoFirebase(
    () =>
      applicationId ? doc(firestore, "applications", applicationId) : null,
    [firestore, applicationId],
  );
  const {
    data: application,
    isLoading: isLoadingApp,
    mutate: mutateApplication,
  } = useDoc<JobApplication>(applicationRef);

  const profileRef = useMemoFirebase(
    () =>
      application ? doc(firestore, "profiles", application.candidateUid) : null,
    [firestore, application],
  );
  const { data: liveProfile, isLoading: isLoadingProfile } =
    useDoc<Profile>(profileRef);

  // Prefer candidateProfileSnapshot (stable data at submit time) over live profile.
  // Falls back to live profile for applications submitted before snapshot feature was added.
  const profile = useMemo((): Profile | undefined => {
    if (!liveProfile) return undefined;
    const snap = application?.candidateProfileSnapshot;
    if (!snap) return liveProfile;
    return {
      ...liveProfile,
      fullName: snap.fullName || liveProfile.fullName,
      phone: snap.phone || liveProfile.phone,
      nickname: snap.nickname || liveProfile.nickname,
      gender: (snap.gender as any) || liveProfile.gender,
      birthPlace: snap.birthPlace || liveProfile.birthPlace,
      birthDate: (snap.birthDate as any) || liveProfile.birthDate,
      education: snap.education?.length ? (snap.education as any) : liveProfile.education,
      workExperience: snap.workExperience?.length ? (snap.workExperience as any) : liveProfile.workExperience,
      organizationalExperience: snap.organizationExperience?.length ? (snap.organizationExperience as any) : liveProfile.organizationalExperience,
      certifications: snap.certifications?.length ? (snap.certifications as any) : liveProfile.certifications,
      skills: snap.skills?.length ? snap.skills : liveProfile.skills,
      selfDescription: snap.selfDescription || liveProfile.selfDescription,
      cvUrl: snap.cvUrl || liveProfile.cvUrl,
      cvFileId: snap.cvFileId || liveProfile.cvFileId,
      ijazahUrl: snap.ijazahUrl || liveProfile.ijazahUrl,
      ijazahFileId: snap.ijazahFileId || liveProfile.ijazahFileId,
    };
  }, [liveProfile, application?.candidateProfileSnapshot]);

  const hasProfileSnapshot = !!application?.candidateProfileSnapshot;

  const candidateTestRef = useMemoFirebase(
    () =>
      application
        ? doc(firestore, "candidate_personality_tests", application.candidateUid)
        : null,
    [firestore, application],
  );
  const { data: candidatePersonalityTest } =
    useDoc<CandidatePersonalityTest>(candidateTestRef);

  const jobRef = useMemoFirebase(
    () => (application ? doc(firestore, "jobs", application.jobId) : null),
    [firestore, application],
  );
  const { data: job, isLoading: isLoadingJob } = useDoc<Job>(jobRef);

  const isPrivilegedRecruiter =
    userProfile?.role === "super-admin" || userProfile?.role === "hrd";

  const internalUsersQuery = useMemoFirebase(() => {
    // Only privileged users can fetch the full list for assignment purposes.
    if (!userProfile || !isPrivilegedRecruiter) {
      return null;
    }
    return query(
      collection(firestore, "users"),
      where("role", "in", ["hrd", "manager", "karyawan", "super-admin"]),
      where("isActive", "==", true),
    );
  }, [firestore, userProfile, isPrivilegedRecruiter]);

  const { data: internalUsers, isLoading: isLoadingUsers } =
    useCollection<UserProfile>(internalUsersQuery);

  const { data: brands, isLoading: isLoadingBrands } = useCollection<Brand>(
    useMemoFirebase(() => collection(firestore, "brands"), [firestore]),
  );

  const assessmentSessionsQuery = useMemoFirebase(() => {
    if (!application) return null;
    return query(
      collection(firestore, "assessment_sessions"),
      where("candidateUid", "==", application.candidateUid),
    );
  }, [firestore, application]);
  const { data: assessmentSessions, isLoading: isLoadingSessions } =
    useCollection<AssessmentSession>(assessmentSessionsQuery);

  // Query all applications by this candidate (for multi-application indicator)
  const candidateApplicationsQuery = useMemoFirebase(() => {
    if (!application?.candidateUid) return null;
    return query(
      collection(firestore, "applications"),
      where("candidateUid", "==", application.candidateUid),
    );
  }, [firestore, application?.candidateUid]);
  const { data: candidateAllApplications } = useCollection<JobApplication>(candidateApplicationsQuery);

  const otherApplications = useMemo(() => {
    if (!candidateAllApplications || !applicationId) return [];
    return candidateAllApplications.filter(a => a.id !== applicationId);
  }, [candidateAllApplications, applicationId]);

  const offeringsQuery = useMemoFirebase(() => {
    if (!applicationId) return null;
    return query(
      collection(firestore, "offerings"),
      where("applicationId", "==", applicationId),
    );
  }, [firestore, applicationId]);
  const {
    data: offeringsList,
    isLoading: isLoadingOfferings,
    mutate: mutateOfferings,
  } = useCollection<Offering>(offeringsQuery);

  const latestOffering = useMemo(() => {
    if (!offeringsList || offeringsList.length === 0) return null;
    return [...offeringsList].sort(
      (a, b) =>
        (b.updatedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0) -
        (a.updatedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0),
    )[0];
  }, [offeringsList]);

  const activeOffering = useMemo(() => {
    if (
      !offeringsList ||
      offeringsList.length === 0 ||
      !application?.currentOfferingId
    )
      return null;

    // Use currentOfferingId as single source of truth
    const currentOffering = offeringsList.find(
      (offering) =>
        offering.id === application.currentOfferingId &&
        offering.isActive === true,
    );

    return currentOffering || null;
  }, [offeringsList, application?.currentOfferingId]);

  const menuConfig = useMemo(() => {
    if (!userProfile) return [];
    if (userProfile.role === "super-admin") return MENU_CONFIG["super-admin"];
    if (userProfile.role === "hrd") return MENU_CONFIG["hrd"];
    return MENU_CONFIG[userProfile.role] || [];
  }, [userProfile]);

  const isAssigned = useMemo(() => {
    if (!userProfile || !application || !job) return false;
    if (isPrivilegedRecruiter) return true;

    // Check if user is in allPanelistIds
    if (application.allPanelistIds?.includes(userProfile.uid)) return true;

    // Check if user is assigned to the job
    if (job.assignedUserIds?.includes(userProfile.uid)) return true;

    // Last resort check: look into active interviews
    const isPanelist = application.interviews?.some(
      (iv) =>
        iv.status !== "canceled" && iv.panelistIds?.includes(userProfile.uid),
    );
    if (isPanelist) return true;

    // Check if user is assigned as an internal reviewer
    if (
      application.internalReviewConfig?.assignedReviewerUids?.includes(
        userProfile.uid,
      )
    )
      return true;

    return false;
  }, [userProfile, application, job, isPrivilegedRecruiter]);

  const handleStageChange = async (
    newStage: JobApplication["status"],
    reason: string,
  ) => {
    if (!application || !userProfile) return false;

    if (
      application.candidateStatus === "lolos" ||
      application.finalDecisionLocked
    ) {
      toast({
        variant: "destructive",
        title: "Perubahan Dikunci",
        description:
          "Keputusan final telah dikunci dan status tidak dapat diubah secara langsung.",
      });
      return false;
    }

    const timelineEvent: ApplicationTimelineEvent = {
      type: "stage_changed",
      at: Timestamp.now(),
      by: userProfile.uid,
      meta: { from: application.status, to: newStage, note: reason },
    };

    const updatePayload: any = {
      status: newStage,
      updatedAt: serverTimestamp(),
      timeline: [...(application.timeline || []), timelineEvent],
    };

    // Logic to update candidateStatus based on internalStatus change
    switch (newStage as string) {
      case "interview":
        updatePayload.candidateStatus = "interview_scheduled";
        break;
      case "offer":
        updatePayload.candidateStatus = "offer_received";
        break;
      case "hired":
        updatePayload.candidateStatus = "process_complete";
        break;
      // For other internal statuses, keep candidateStatus as 'under_review'
      case "on_hold":
      case "rejected":
      case "screening":
        updatePayload.candidateStatus = "under_review";
        break;
      default:
      // Do not change candidate status for other internal changes
    }

    if (newStage === "rejected") {
      updatePayload.decisionAt = serverTimestamp();
    }

    try {
      await updateDoc(applicationRef!, updatePayload as any);
      mutateApplication();
      toast({
        title: "Status Diperbarui",
        description: `Kandidat dipindahkan ke tahap "${statusDisplayLabels[newStage]}".`,
      });
      return true;
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Gagal Memperbarui",
        description: error.message,
      });
      return false;
    }
  };

  const handleSaveOfferDraft = async (offerData: any) => {
    if (!application) return;
    setIsSavingDraft(true);

    try {
      // Safely combine response deadline date and time
      let responseDeadline: Date | null = null;
      if (offerData.responseDeadline) {
        responseDeadline = new Date(offerData.responseDeadline);
        if (
          offerData.responseDeadlineTime &&
          typeof offerData.responseDeadlineTime === "string"
        ) {
          const [hh, mm] = offerData.responseDeadlineTime
            .split(":")
            .map((x: string) => parseInt(x));
          if (!isNaN(hh) && !isNaN(mm)) {
            responseDeadline.setHours(hh, mm, 0, 0);
          }
        }
      }

      const offeringId = offerData.offeringId as string | undefined;
      const updatePayload: any = {
        currentOfferingId: offeringId || application.currentOfferingId,
        responseDeadline: responseDeadline
          ? Timestamp.fromDate(responseDeadline)
          : null,
        offeringDetails: {
          salary: offerData.salary || "",
          startDate: offerData.startDate || "",
          contractDurationMonths: offerData.contractDurationMonths ? Number(offerData.contractDurationMonths) : null,
          firstDayTime: offerData.firstDayTime || "",
          firstDayLocation: offerData.firstDayLocation || "",
          humanCapitalContactName: offerData.humanCapitalContactName || "",
          humanCapitalContactPhone: offerData.humanCapitalContactPhone || "",
          humanCapitalContact: [offerData.humanCapitalContactName, offerData.humanCapitalContactPhone].filter(Boolean).join(" - ") || offerData.humanCapitalContact || offerData.hrContact || "",
        },
        additionalNotes: offerData.additionalNotes || "",
        updatedAt: serverTimestamp(),
      };

      await updateDoc(applicationRef!, updatePayload);
      mutateApplication();
      if (mutateOfferings) {
        mutateOfferings();
      }
      toast({
        title: "Draf Disimpan",
        description: "Detail penawaran kerja telah disimpan sebagai draf.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Gagal Menyimpan Draf",
        description: error.message,
      });
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleSendOffer = async (offerData: any) => {
    if (!application || !userProfile) return;
    setIsSendingOffer(true);

    try {
      // Safely combine response deadline date and time
      let responseDeadline: Date | null = null;
      if (offerData.responseDeadline) {
        responseDeadline = new Date(offerData.responseDeadline);
        if (
          offerData.responseDeadlineTime &&
          typeof offerData.responseDeadlineTime === "string"
        ) {
          const [hh, mm] = offerData.responseDeadlineTime
            .split(":")
            .map((x: string) => parseInt(x));
          if (!isNaN(hh) && !isNaN(mm)) {
            responseDeadline.setHours(hh, mm, 0, 0);
          }
        }
      }

      const timelineEvent: ApplicationTimelineEvent = {
        type: "offer_sent",
        at: Timestamp.now(),
        by: userProfile.uid,
        meta: {
          note: "Penawaran kerja resmi telah dikirimkan kepada kandidat.",
        },
      };

      const offeringId = offerData.offeringId as string | undefined;
      const updatePayload: any = {
        status: "offered",
        currentOfferingId: offeringId || application.currentOfferingId,
        offerStatus: "sent",
        responseDeadline: responseDeadline
          ? Timestamp.fromDate(responseDeadline)
          : null,
        offeringDetails: {
          salary: offerData.salary || "",
          startDate: offerData.startDate || "",
          contractDurationMonths: offerData.contractDurationMonths ? Number(offerData.contractDurationMonths) : null,
          firstDayTime: offerData.firstDayTime || "",
          firstDayLocation: offerData.firstDayLocation || "",
          humanCapitalContactName: offerData.humanCapitalContactName || "",
          humanCapitalContactPhone: offerData.humanCapitalContactPhone || "",
          humanCapitalContact: [offerData.humanCapitalContactName, offerData.humanCapitalContactPhone].filter(Boolean).join(" - ") || offerData.humanCapitalContact || offerData.hrContact || "",
        },
        additionalNotes: offerData.additionalNotes || "",
        sentAt: Timestamp.now(),
        sentBy: userProfile.uid,
        viewedAtFirst: null,
        viewedAtLast: null,
        viewCount: 0,
        respondedAt: null,
        responseType: null,
        updatedAt: serverTimestamp(),
        timeline: [...(application.timeline || []), timelineEvent],
      };

      await updateDoc(applicationRef!, updatePayload);
      mutateApplication();
      if (mutateOfferings) {
        mutateOfferings();
      }
      toast({
        title: "Penawaran Terkirim",
        description:
          "Kandidat sekarang dapat melihat dan merespons penawaran Anda.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Gagal Mengirim Penawaran",
        description: error.message,
      });
    } finally {
      setIsSendingOffer(false);
    }
  };

  const handleDeleteDraft = async () => {
    if (!activeOffering?.id) return;
    setIsDeletingDraft(true);

    try {
      await deleteDoc(doc(firestore, "offerings", activeOffering.id));
      if (mutateOfferings) {
        mutateOfferings();
      }
      toast({
        title: "Draft Dihapus",
        description: "Draft penawaran berhasil dihapus.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Gagal Menghapus Draft",
        description: error.message,
      });
    } finally {
      setIsDeletingDraft(false);
    }
  };

  const handleWithdrawAllOfferings = async () => {
    if (!applicationId || !offeringsList || offeringsList.length === 0) return;
    setIsWithdrawingOfferings(true);

    try {
      const batch = writeBatch(firestore);

      // Update all offerings to withdrawn and inactive
      offeringsList.forEach((offering) => {
        const offeringRef = doc(firestore, "offerings", offering.id!);
        batch.update(offeringRef, {
          status: "withdrawn",
          isActive: false,
          withdrawnAt: serverTimestamp(),
          withdrawnBy: userProfile?.uid,
          updatedAt: serverTimestamp(),
        });
      });

      // Clear currentOfferingId from application
      const applicationRef = doc(firestore, "applications", applicationId);
      batch.update(applicationRef, {
        currentOfferingId: null,
        offerStatus: null,
        updatedAt: serverTimestamp(),
      });

      await batch.commit();

      if (mutateOfferings) {
        mutateOfferings();
      }
      if (mutateApplication) {
        mutateApplication();
      }

      toast({
        title: "Offering Ditarik",
        description:
          "Semua penawaran sebelumnya telah ditarik. Kandidat tidak akan melihat penawaran aktif.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Gagal Menarik Offering",
        description: error.message,
      });
    } finally {
      setIsWithdrawingOfferings(false);
    }
  };

  useEffect(() => {
    const autoScreening = async () => {
      if (
        isLoadingApp ||
        !application ||
        !userProfile ||
        application.status !== "submitted" ||
        hasTriggeredAutoScreen
      ) {
        return;
      }
      setHasTriggeredAutoScreen(true);

      const timelineEvent: ApplicationTimelineEvent = {
        type: "stage_changed",
        at: Timestamp.now(),
        by: userProfile.uid,
        meta: {
          from: "submitted",
          to: "screening",
          note: "Application automatically moved to screening upon HR review.",
        },
      };

      await updateDocumentNonBlocking(applicationRef!, {
        status: "screening",
        candidateStatus: "under_review",
        timeline: [...(application.timeline || []), timelineEvent],
      });
      mutateApplication();
      toast({
        title: "Lamaran Discreening",
        description: `Status lamaran ini secara otomatis diperbarui menjadi "Screening".`,
      });
    };
    autoScreening().catch(console.error);
  }, [
    application,
    isLoadingApp,
    userProfile,
    hasTriggeredAutoScreen,
    applicationRef,
    mutateApplication,
    toast,
  ]);

  const assessmentInfo = useMemo(() => {
    if (isLoadingSessions) {
      return {
        status: "loading",
        text: "Memuat...",
        result: null,
        color: "text-slate-500",
      };
    }
    if (!assessmentSessions || assessmentSessions.length === 0) {
      return {
        status: "unstarted",
        text: "Belum Dikerjakan",
        result: null,
        color: "text-destructive",
      };
    }

    // Sort sessions on the client to find the most recent one
    const sortedSessions = [...assessmentSessions].sort(
      (a, b) => (b.updatedAt?.toMillis() || 0) - (a.updatedAt?.toMillis() || 0),
    );
    const session = sortedSessions[0];

    if (session.status === "submitted") {
      const resultText =
        session.result?.discType || session.result?.mbtiArchetype?.code;
      return {
        status: "completed",
        text: "Selesai",
        result: resultText,
        color: "text-green-600",
      };
    }
    if (session.status === "draft") {
      return {
        status: "in_progress",
        text: "Sedang Dikerjakan",
        result: null,
        color: "text-amber-600",
      };
    }
    return {
      status: "unstarted",
      text: "Belum Dikerjakan",
      result: null,
      color: "text-destructive",
    };
  }, [assessmentSessions, isLoadingSessions]);

  const shouldShowPostInterview = useMemo(() => {
    if (!application) return false;
    // Show if there are any post-interview reviews submitted
    if (
      application.postInterviewEvaluation &&
      application.postInterviewEvaluation.submissions > 0
    ) {
      return true;
    }
    // Or if the interview stage is complete
    return !!application.interviewCompleted;
  }, [application]);

  const isHRD =
    userProfile?.role === "hrd" || userProfile?.role === "super-admin";

  const canOpenPostInterview = useMemo(() => {
    if (!application) return false;
    const postInterviewStages = [
      "interview",
      "post_interview",
      "offered",
      "offering",
      "hired",
      "offer_sent",
      "offer_accepted",
      "offer_rejected",
      "offer_received",
      "process_complete",
    ];
    return (
      postInterviewStages.includes(application.status) ||
      (application.candidateStatus &&
        postInterviewStages.includes(application.candidateStatus)) ||
      ((application as any).candidateStage &&
        postInterviewStages.includes((application as any).candidateStage)) ||
      ((application as any).currentStage &&
        postInterviewStages.includes((application as any).currentStage))
    );
  }, [application]);

  const canOpenOffering = useMemo(() => {
    if (!application || !isHRD) return false;

    const offeringStages = [
      "offered",
      "offering",
      "offer_sent",
      "offer_accepted",
      "offer_rejected",
      "hired",
      "offer_received",
      "process_complete",
    ];

    return (
      offeringStages.includes(application.status) ||
      (application.candidateStatus &&
        offeringStages.includes(application.candidateStatus)) ||
      (application.offerStatus &&
        offeringStages.includes(application.offerStatus)) ||
      ((application as any).candidateStage &&
        offeringStages.includes((application as any).candidateStage)) ||
      ((application as any).currentStage &&
        offeringStages.includes((application as any).currentStage))
    );
  }, [application, isHRD]);

  const displayStatus = useMemo(() => {
    if (!application) return "draft";

    // Old data: status="rejected" set by internal HRD decision (tidak_lanjut).
    // Show "interview" so the progress stepper and badge don't display "Ditolak".
    if (
      application.status === "rejected" &&
      application.postInterviewDecision?.status === "tidak_lanjut"
    ) {
      return "interview" as typeof application.status;
    }

    const isHrdEvaluated =
      application.postInterviewDecision != null ||
      application.recruitmentInternalDecision != null;

    if (application.status === "interview" && !isHrdEvaluated) {
      const now = new Date();
      const hasPastInterview = application.interviews?.some(
        (iv) => iv.status === "scheduled" && iv.startAt.toDate() < now,
      );
      if (hasPastInterview) return "waiting_evaluation";
    }

    return getApplicationFilterStage(application, candidatePersonalityTest);
  }, [application, candidatePersonalityTest]);

  const displayStage = useMemo(
    () => application ? getApplicationDisplayStage(application, candidatePersonalityTest) : null,
    [application, candidatePersonalityTest],
  );

  // HRD-only decision overlay badge — replaces the raw candidateStatus secondary badge.
  const adminDecisionBadge = useMemo(() => {
    if (!application) return null;
    const hrdDecisionLabel = (application as any).hrdEvaluationDecisionLabel;
    const hrdDecision = (application as any).hrdEvaluationDecision;
    if (hrdDecisionLabel || hrdDecision) {
      const cls =
        hrdDecision === "continue"
          ? "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
          : hrdDecision === "needs_discussion"
            ? "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
            : "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800";
      return {
        text: `Internal: ${hrdDecisionLabel || "Belum diputuskan"}`,
        cls,
      };
    }
    const pasca = application.postInterviewDecision?.status;
    const pra = application.recruitmentInternalDecision?.status;
    if (pasca === "tidak_lanjut")
      return { text: "Tidak Dilanjutkan", cls: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800" };
    if (pasca === "pending")
      return { text: "Butuh Diskusi Lanjutan", cls: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800" };
    if (pasca === "lanjut")
      return { text: "Lanjut ke Offering", cls: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800" };
    if (pra === "pending_internal")
      return { text: "Internal: Butuh diskusi lanjutan", cls: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800" };
    if (pra === "lanjut_ke_tahap_selanjutnya")
      return { text: "Internal: Lanjut ke tahap berikutnya", cls: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800" };
    if (pra === "tidak_dilanjutkan_saat_ini")
      return { text: "Internal: Tidak dilanjutkan", cls: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800" };
    if (application.status === "screening")
      return { text: "Internal: Belum diputuskan", cls: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700" };
    return null;
  }, [application]);

  const showOfferingTab = useMemo(() => {
    if (!application || !isHRD) return false;

    const interviewAndAfterStatuses = [
      "interview",
      "post_interview",
      "offered",
      "offering",
      "offer_sent",
      "offer_accepted",
      "offer_rejected",
      "hired",
      "rejected",
      "offer_received",
      "process_complete",
    ];

    const matchesStatus = interviewAndAfterStatuses.includes(
      application.status,
    );
    const matchesCandidateStatus =
      application.candidateStatus &&
      interviewAndAfterStatuses.includes(application.candidateStatus);
    const matchesOfferStatus =
      application.offerStatus &&
      interviewAndAfterStatuses.includes(application.offerStatus);
    const hasOfferTimeline = application.timeline?.some(
      (event) => event.type === "offer_sent",
    );

    return (
      !!matchesStatus ||
      !!matchesCandidateStatus ||
      !!matchesOfferStatus ||
      !!hasOfferTimeline
    );
  }, [application, isHRD]);

  const isLoading =
    isLoadingApp ||
    isLoadingProfile ||
    isLoadingJob ||
    isLoadingUsers ||
    isLoadingBrands ||
    isLoadingSessions;

  const formatSalary = (value?: number | null) => {
    if (value === undefined || value === null) return "-";
    return value.toLocaleString("id-ID");
  };

  const offerTimeline = useMemo(
    () =>
      (application?.timeline || []).filter(
        (event) => event.type === "offer_sent",
      ),
    [application?.timeline],
  );

  const hasOfferData = useMemo(() => {
    if (!application) return false;
    return (
      !!activeOffering ||
      !!application.offerStatus ||
      !!application.offeredSalary ||
      !!application.contractStartDate ||
      !!application.contractDurationMonths ||
      !!application.offerSections?.length ||
      !!application.offerDescription ||
      !!application.workDays ||
      !!application.offerNotes
    );
  }, [application, activeOffering]);

  if (!hasAccess) {
    return (
      <DashboardLayout pageTitle="Loading..." menuConfig={[]}>
        <ApplicationDetailSkeleton />
      </DashboardLayout>
    );
  }

  // Handle access denied once data is loaded
  if (!isLoading && !isAssigned) {
    return (
      <DashboardLayout pageTitle="Akses Ditolak" menuConfig={menuConfig}>
        <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4">
          <div className="bg-destructive/10 p-4 rounded-full">
            <Lock className="h-10 w-10 text-destructive" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">
              Anda tidak memiliki akses
            </h1>
            <p className="text-slate-700 max-w-md mx-auto">
              Halaman ini hanya dapat diakses oleh HRD, Super Admin, atau
              anggota tim yang ditugaskan untuk rekrutmen ini.
            </p>
          </div>
          <Button variant="outline" onClick={() => window.history.back()}>
            Kembali
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout pageTitle="Application Detail" menuConfig={menuConfig}>
      {isLoading ? (
        <ApplicationDetailSkeleton />
      ) : !application || !profile || !job ? (
        <p>Application, profile, or job details not found.</p>
      ) : (
        <>
          <div className="space-y-6">
            <ApplicationActionBar
              application={application}
              onStageChange={handleStageChange}
              onSendOfferClick={() => setEvaluationFilter("offering")}
              actionsLocked={
                application.candidateStatus === "lolos" ||
                application.finalDecisionLocked
              }
              isPrivilegedRecruiter={isPrivilegedRecruiter}
            />
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <Avatar className="h-16 w-16 border-4 border-background ring-2 ring-primary">
                      <AvatarImage
                        src={
                          (profile as any).photoUrl ||
                          `https://picsum.photos/seed/${application.candidateUid}/100/100`
                        }
                        alt={profile.fullName}
                        data-ai-hint="profile avatar"
                      />
                      <AvatarFallback className="text-xl">
                        {getInitials(profile.fullName)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <CardTitle className="text-2xl">
                        {profile.fullName}
                      </CardTitle>
                      <CardDescription className="text-base flex items-center gap-2 mt-1">
                        Melamar untuk:{" "}
                        <span className="font-semibold text-foreground">
                          {application.jobPosition}
                        </span>
                      </CardDescription>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-700">
                        <span className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-slate-600" />{" "}
                          {application.candidateEmail}
                        </span>
                        <span className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-slate-600" />{" "}
                          {profile.phone}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <ApplicationStatusBadge
                      status={displayStage?.displayStage || displayStatus}
                      className="text-base px-4 py-1"
                    />
                    {activeOffering?.status && (
                      <Badge
                        variant="outline"
                        className={cn("text-[10px] tracking-wide px-2 py-1 border-0", {
                          "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300": activeOffering.status === "draft",
                          "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300": activeOffering.status === "sent",
                          "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300": activeOffering.status === "viewed",
                          "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300": activeOffering.status === "accepted",
                          "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300": activeOffering.status === "rejected",
                          "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400": activeOffering.status === "withdrawn",
                        })}
                      >
                        {{
                          draft:     "Draft Penawaran",
                          sent:      "Menunggu respons kandidat",
                          viewed:    "Kandidat telah melihat penawaran",
                          responded: "Kandidat telah merespons",
                          accepted:  "Kandidat menerima penawaran",
                          rejected:  "Kandidat menolak penawaran",
                          withdrawn: "Penawaran ditarik",
                        }[activeOffering.status] ?? activeOffering.status}
                      </Badge>
                    )}
                    {adminDecisionBadge ? (
                      <Badge
                        variant="outline"
                        className={cn("uppercase text-[10px] tracking-wider px-2 py-1 border", adminDecisionBadge.cls)}
                      >
                        {adminDecisionBadge.text}
                      </Badge>
                    ) : application.candidateStatus &&
                      !["menunggu", "under_review", "dalam_evaluasi", "evaluasi_setelah_wawancara"].includes(application.candidateStatus) ? (
                      <Badge
                        variant="secondary"
                        className="uppercase text-[10px] tracking-wider px-2 py-1"
                      >
                        {application.candidateStatus.replaceAll("_", " ")}
                      </Badge>
                    ) : null}
                    {application.submittedAt && (
                      <p className="text-sm text-slate-700">
                        Applied on{" "}
                        {format(
                          application.submittedAt.toDate(),
                          "dd MMM yyyy",
                        )}
                      </p>
                    )}
                    <div
                      className={cn(
                        "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted mt-1 flex items-center gap-1.5",
                        assessmentInfo.color,
                      )}
                    >
                      <BrainCircuit className="h-3 w-3" />
                      <span>
                        Psikotest: {displayStage?.isPersonalityTestCompleted ? "Selesai" : assessmentInfo.text}{" "}
                        {assessmentInfo.result && `(${assessmentInfo.result})`}
                      </span>
                    </div>
                  </div>
                </div>
              </CardHeader>
            </Card>

            {otherApplications.length > 0 && (
              <MultiApplicationAlert
                currentApplicationId={applicationId}
                currentJobPosition={application.jobPosition}
                otherApplications={otherApplications}
              />
            )}

            <ApplicationProgressStepper currentStatus={displayStatus} />

            <div className="grid gap-3 sm:grid-cols-2">
              <InfoRow
                icon={<BrainCircuit className="h-4 w-4" />}
                label="Tes Kepribadian"
                value={displayStage?.isPersonalityTestCompleted ? "Selesai" : "Menunggu"}
              />
              <InfoRow
                icon={<ShieldCheck className="h-4 w-4" />}
                label="Status Saat Ini"
                value={displayStage?.displayStageLabel || statusDisplayLabels[displayStatus as keyof typeof statusDisplayLabels]}
              />
            </div>

            {/* Interview schedule summary card — visible to all internal users (panelists included) */}
            {application.status === "interview" && (() => {
              const iv = (application.interviews || [])
                .filter(i => i.status === "scheduled")
                .sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis())[0] || null;
              if (!iv) return null;
              const ivStart = iv.startAt.toDate();
              const ivEnd = iv.endAt.toDate();
              const durationMins = differenceInMinutes(ivEnd, ivStart);
              const link = iv.meetingPublished !== false ? iv.meetingLink : null;
              return (
                <Card className="border-teal-200 dark:border-teal-800 bg-teal-50/60 dark:bg-teal-900/20">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2 text-teal-800 dark:text-teal-200">
                      <Calendar className="h-4 w-4" />
                      Jadwal Wawancara
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-teal-600/70 dark:text-teal-400/70 mb-0.5">Tanggal</p>
                      <p className="font-semibold text-teal-900 dark:text-teal-100">
                        {format(ivStart, "dd MMM yyyy", { locale: idLocale })}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-teal-600/70 dark:text-teal-400/70 mb-0.5">Waktu (WIB)</p>
                      <p className="font-semibold text-teal-900 dark:text-teal-100">
                        {format(ivStart, "HH:mm")} – {format(ivEnd, "HH:mm")}
                        <span className="text-teal-600/70 dark:text-teal-400/70 font-normal ml-1">({durationMins} mnt)</span>
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-teal-600/70 dark:text-teal-400/70 mb-0.5">Status</p>
                      <p className="font-semibold text-teal-900 dark:text-teal-100 capitalize">{iv.status.replace("_", " ")}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-teal-600/70 dark:text-teal-400/70 mb-1">Link Meeting</p>
                      {link ? (
                        <a
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 dark:text-teal-300 hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Buka Link Wawancara
                        </a>
                      ) : (
                        <span className="text-xs text-teal-600/60 dark:text-teal-400/60 italic">Link belum tersedia</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })()}

            {/* Keputusan Internal — only for HRD / super-admin */}
            {isPrivilegedRecruiter && (
              <UnifiedInternalDecision
                application={application}
                onStageChange={handleStageChange}
              />
            )}

            <div className="grid grid-cols-1 xl:grid-cols-[200px_1fr] gap-10 items-start pt-4">
              <div className="xl:sticky xl:top-24 hidden xl:block">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500/40 mb-4 px-3">
                  Navigator Profil
                </p>
                <CandidateStepNav
                  activeStep={activeProfileStep}
                  onStepChange={setActiveProfileStep}
                />
              </div>

              <div className="space-y-6">
                {hasProfileSnapshot ? (
                  <div className="flex items-center gap-2 px-1 text-xs text-blue-600 dark:text-blue-400">
                    <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                    <span>Data profil berdasarkan snapshot saat kandidat melamar.</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-1 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    <span>Menampilkan profil terkini (snapshot belum tersedia untuk lamaran ini).</span>
                  </div>
                )}
                <Card className="shadow-2xl border-none p-4 sm:p-8 md:p-12 rounded-[2.5rem] bg-card/60 backdrop-blur-md border-t-8 border-t-primary min-h-[700px]">
                  <CandidateStepContent
                    profile={profile}
                    application={application}
                    activeStep={activeProfileStep}
                    job={job}
                    handleViewDocument={handleViewDocument}
                    loadingDoc={loadingDoc}
                  />
                </Card>
              </div>

              <div className="xl:hidden grid grid-cols-3 gap-2 p-2 bg-muted/30 rounded-2xl">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Button
                    key={i}
                    variant={activeProfileStep === i ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setActiveProfileStep(i)}
                  >
                    Step {i}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-6 pt-10">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="flex flex-wrap gap-1 p-1.5 bg-slate-100 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-2xl">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEvaluationFilter("all")}
                      className={cn(
                        "rounded-xl text-[10px] font-black uppercase tracking-widest px-5 h-9",
                        evaluationFilter === "all"
                          ? "bg-indigo-600 text-white hover:bg-indigo-700 hover:text-white shadow-lg shadow-indigo-600/20"
                          : "text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800",
                      )}
                    >
                      Semua
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEvaluationFilter("pra")}
                      className={cn(
                        "rounded-xl text-[10px] font-black uppercase tracking-widest px-5 h-9",
                        evaluationFilter === "pra"
                          ? "bg-indigo-600 text-white hover:bg-indigo-700 hover:text-white shadow-lg shadow-indigo-600/20"
                          : "text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800",
                      )}
                    >
                      Pra Wawancara
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEvaluationFilter("pasca")}
                      className={cn(
                        "rounded-xl text-[10px] font-black uppercase tracking-widest px-5 h-9",
                        evaluationFilter === "pasca"
                          ? "bg-teal-600 text-white hover:bg-teal-700 hover:text-white shadow-lg shadow-teal-600/20"
                          : "text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800",
                      )}
                    >
                      Pasca Wawancara
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEvaluationFilter("offering")}
                      className={cn(
                        "rounded-xl text-[10px] font-black uppercase tracking-widest px-5 h-9",
                        evaluationFilter === "offering"
                          ? "bg-amber-600 text-white hover:bg-amber-700 hover:text-white shadow-lg shadow-amber-600/20"
                          : "text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800",
                      )}
                    >
                      Offering
                    </Button>
                  </div>
                </div>
              </div>

              {(evaluationFilter === "all" || evaluationFilter === "pra") && (
                <InternalEvaluationSection
                  application={application}
                  job={job}
                  internalUsers={internalUsers}
                />
              )}

              {(evaluationFilter === "all" || evaluationFilter === "pasca") &&
                (canOpenPostInterview ? (
                  <PostInterviewEvaluationSection
                    application={application}
                    job={job}
                    internalUsers={internalUsers}
                  />
                ) : evaluationFilter === "pasca" ? (
                  <Card className="border border-dashed border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950/70">
                    <CardHeader>
                      <CardTitle className="text-xl font-bold text-slate-900 dark:text-slate-100">
                        Kandidat belum mencapai tahap pasca wawancara.
                      </CardTitle>
                      <CardDescription className="text-slate-600 dark:text-slate-400">
                        Tab ini akan aktif setelah kandidat memasuki proses
                        wawancara.
                      </CardDescription>
                    </CardHeader>
                  </Card>
                ) : null)}

              {(evaluationFilter === "all" && showOfferingTab) ||
              evaluationFilter === "offering" ? (
                <div className="space-y-6">
                  {!canOpenOffering ? (
                    <Card className="border border-dashed border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950/70">
                      <CardHeader>
                        <CardTitle className="text-xl font-bold flex items-center gap-2 text-slate-900 dark:text-slate-100">
                          <Lock className="h-5 w-5 text-amber-500" />
                          Kandidat belum mencapai tahap offering.
                        </CardTitle>
                        <CardDescription className="text-slate-600 dark:text-slate-400">
                          Tab ini akan aktif setelah kandidat lolos ke tahap
                          penawaran kerja.
                        </CardDescription>
                      </CardHeader>
                    </Card>
                  ) : (
                    <>
                      {application.offerStatus === "negotiation_requested" && application.candidateCounterOffer && (() => {
                        const counterOffer = application.candidateCounterOffer;
                        return (
                          <Card className="border-2 border-blue-500 bg-blue-50/20 shadow-lg animate-in fade-in slide-in-from-top-4 duration-500">
                            <CardHeader className="bg-blue-600 text-white rounded-t-xl py-4">
                              <div className="flex items-center justify-between">
                                <CardTitle className="text-lg flex items-center gap-2">
                                  <MessageSquare className="h-5 w-5" />
                                  Review Permintaan Negosiasi
                                </CardTitle>
                                <Badge className="bg-white text-blue-700 hover:bg-white/90">MENUNGGU RESPONS</Badge>
                              </div>
                            </CardHeader>
                            <CardContent className="pt-6 space-y-6">
                              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                {counterOffer.requestedAreas.map((area: string) => (
                                  <div key={area} className="p-3 bg-white/50 border border-blue-100 rounded-xl">
                                    <p className="text-[10px] font-black uppercase text-blue-600 mb-1 tracking-widest">{area.replace("_", " ")}</p>
                                    <p className="text-sm font-bold text-slate-900">
                                      {area === "gaji" ? (
                                        `Rp ${counterOffer.requestedSalary?.toLocaleString("id-ID")}`
                                      ) : area === "tanggal_mulai" ? (
                                        counterOffer.requestedStartDate
                                      ) : area === "sistem_kerja" ? (
                                        counterOffer.requestedWorkModel
                                      ) : area === "durasi_kontrak" ? (
                                        `${counterOffer.requestedContractDurationMonths} Bulan`
                                      ) : "Lihat Penjelasan"}
                                    </p>
                                  </div>
                                ))}
                              </div>

                              <div className="space-y-2">
                                <p className="text-xs font-bold uppercase text-slate-500 tracking-widest">Justifikasi Kandidat</p>
                                <div className="p-4 bg-white/80 border border-slate-200 rounded-2xl italic text-slate-700 text-sm leading-relaxed shadow-inner">
                                  "{counterOffer.reason}"
                                </div>
                              </div>


                            <div className="flex justify-end gap-3 pt-2">
                              <Button 
                                variant="outline" 
                                className="border-blue-200 text-blue-700 hover:bg-blue-50"
                                onClick={() => {
                                  setNegotiationResponseType("rejected");
                                  setIsNegotiationResponseOpen(true);
                                }}
                              >
                                Berikan Respons
                              </Button>
                            </div>
                          </CardContent>

                          <Dialog open={isNegotiationResponseOpen} onOpenChange={setIsNegotiationResponseOpen}>
                            <DialogContent className="max-w-xl">
                              <DialogHeader>
                                <DialogTitle>Respons Negosiasi Kandidat</DialogTitle>
                                <DialogDescription>
                                  Pilih keputusan Anda dan berikan pesan profesional kepada kandidat.
                                </DialogDescription>
                              </DialogHeader>
                              <div className="space-y-6 py-4">
                                <div className="space-y-3">
                                  <p className="text-sm font-bold">Keputusan:</p>
                                  <div className="grid grid-cols-3 gap-2">
                                    {[
                                      { id: "accepted", label: "Setujui", color: "bg-green-500", text: "text-green-600", border: "border-green-200" },
                                      { id: "partially_accepted", label: "Sebagian", color: "bg-blue-500", text: "text-blue-600", border: "border-blue-200" },
                                      { id: "rejected", label: "Tolak", color: "bg-red-500", text: "text-red-600", border: "border-red-200" }
                                    ].map((opt) => (
                                      <button
                                        key={opt.id}
                                        onClick={() => setNegotiationResponseType(opt.id as any)}
                                        className={cn(
                                          "px-3 py-4 rounded-xl border text-sm font-bold transition-all",
                                          negotiationResponseType === opt.id 
                                            ? `${opt.color} text-white border-transparent shadow-lg scale-105`
                                            : `bg-white ${opt.text} ${opt.border} hover:bg-slate-50`
                                        )}
                                      >
                                        {opt.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <label className="text-sm font-bold">Pesan Profesional (Dilihat oleh Kandidat):</label>
                                  <Textarea 
                                    className="min-h-[120px] rounded-2xl"
                                    placeholder={
                                      negotiationResponseType === "rejected" 
                                        ? "Jelaskan mengapa usulan belum dapat dipenuhi saat ini..." 
                                        : "Tuliskan detail poin yang disetujui dan langkah selanjutnya..."
                                    }
                                    value={negotiationResponseNote}
                                    onChange={(e) => setNegotiationResponseNote(e.target.value)}
                                  />
                                  <p className="text-[10px] text-slate-500">
                                    *Pesan ini akan tampil langsung di portal kandidat.
                                  </p>
                                </div>
                              </div>
                              <DialogFooter>
                                <Button variant="ghost" onClick={() => setIsNegotiationResponseOpen(false)}>Batal</Button>
                                <Button 
                                  onClick={handleNegotiationResponse} 
                                  disabled={isSubmittingNegotiationResponse || !negotiationResponseNote.trim()}
                                  className={cn(
                                    negotiationResponseType === "accepted" ? "bg-green-600 hover:bg-green-700" :
                                    negotiationResponseType === "rejected" ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"
                                  )}
                                >
                                  {isSubmittingNegotiationResponse && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                  Kirim Respons
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        </Card>
                      )})()}
                      {(() => {
                        const ofStatus = activeOffering?.status;
                        const isSent = ofStatus && ["sent", "viewed", "responded", "accepted", "rejected", "withdrawn"].includes(ofStatus);
                        const showSummary = isSent && !isOfferEditMode;

                        const offerStatusConfig: Record<string, { label: string; cls: string }> = {
                          draft:     { label: "Draft",               cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
                          sent:      { label: "Penawaran Dikirim",   cls: "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300" },
                          viewed:    { label: "Dilihat Kandidat",    cls: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300" },
                          responded: { label: "Kandidat Merespons",  cls: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300" },
                          accepted:  { label: "Diterima Kandidat",   cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" },
                          rejected:  { label: "Ditolak Kandidat",    cls: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300" },
                          withdrawn: { label: "Ditarik",             cls: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" },
                        };
                        const statusCfg = ofStatus ? (offerStatusConfig[ofStatus] ?? offerStatusConfig.sent) : null;

                        const progressSteps = [
                          { key: "draft",    label: "Draft Dibuat",          done: !!ofStatus },
                          { key: "sent",     label: "Penawaran Dikirim",     done: ofStatus ? ["sent","viewed","responded","accepted","rejected"].includes(ofStatus) : false },
                          { key: "viewed",   label: "Kandidat Melihat",      done: ofStatus ? ["viewed","responded","accepted","rejected"].includes(ofStatus) : false },
                          { key: "responded",label: "Kandidat Merespons",    done: ofStatus ? ["responded","accepted","rejected"].includes(ofStatus) : false },
                          { key: "done",     label: "Selesai",               done: ofStatus ? ["accepted","rejected","withdrawn"].includes(ofStatus) : false },
                        ];
                        const activeStep = progressSteps.findLastIndex(s => s.done);

                        const hcContact = [
                          activeOffering?.offeringDetails?.humanCapitalContactName,
                          activeOffering?.offeringDetails?.humanCapitalContactPhone,
                        ].filter(Boolean).join(" - ") || activeOffering?.offeringDetails?.humanCapitalContact || activeOffering?.offeringDetails?.hrContact || "-";

                        return showSummary ? (
                          /* ── MODE RINGKASAN (penawaran aktif / sudah dikirim) ── */
                          <div className="space-y-4">
                            {/* Header Card — Status + Aksi Cepat */}
                            <Card className="border border-slate-200 dark:border-slate-700">
                              <CardHeader className="pb-3">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <CardTitle className="text-lg flex items-center gap-2">
                                      <Send className="h-5 w-5 text-green-600" />
                                      Ringkasan Penawaran Aktif
                                    </CardTitle>
                                    <CardDescription className="mt-0.5">
                                      {activeOffering?.documentName || "Surat Penawaran Kerja"}
                                    </CardDescription>
                                  </div>
                                  {statusCfg && (
                                    <Badge className={cn("text-xs font-semibold border-0", statusCfg.cls)}>
                                      {statusCfg.label}
                                    </Badge>
                                  )}
                                </div>
                              </CardHeader>

                              <CardContent className="space-y-5">
                                {/* Progress timeline */}
                                <div className="relative pt-1 pb-3">
                                  <div className="absolute top-5 left-4 right-4 h-0.5 bg-slate-200 dark:bg-slate-700" />
                                  <div
                                    className="absolute top-5 left-4 h-0.5 bg-teal-500 transition-all duration-500"
                                    style={{ width: activeStep < 0 ? "0%" : `${(activeStep / (progressSteps.length - 1)) * (100 - (8 / progressSteps.length))}%` }}
                                  />
                                  <div className="relative flex justify-between">
                                    {progressSteps.map((step, i) => (
                                      <div key={step.key} className="flex flex-col items-center gap-1.5 z-10" style={{ width: `${100 / progressSteps.length}%` }}>
                                        <div className={cn(
                                          "h-8 w-8 rounded-full border-2 flex items-center justify-center transition-all",
                                          step.done
                                            ? "bg-teal-500 border-teal-500 text-white"
                                            : i === activeStep + 1
                                              ? "bg-white dark:bg-slate-900 border-teal-400 text-teal-500 ring-3 ring-teal-100 dark:ring-teal-900"
                                              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-400"
                                        )}>
                                          {step.done ? <CheckCircle2 className="h-4 w-4" /> : <span className="text-[10px] font-bold">{i + 1}</span>}
                                        </div>
                                        <span className={cn(
                                          "text-[9px] text-center leading-tight max-w-[56px]",
                                          step.done ? "text-teal-600 dark:text-teal-400 font-semibold" : "text-slate-400 dark:text-slate-600"
                                        )}>
                                          {step.label}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                {/* Info grid */}
                                <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 text-sm">
                                  {[
                                    { label: "Tanggal Dikirim", value: activeOffering?.sentAt ? format(activeOffering.sentAt.toDate(), "dd MMM yyyy, HH:mm", { locale: idLocale }) : "-" },
                                    { label: "Batas Konfirmasi Kandidat", value: activeOffering?.responseDeadline ? format(activeOffering.responseDeadline.toDate(), "dd MMM yyyy, HH:mm", { locale: idLocale }) + " WIB" : "-" },
                                    { label: "Tanggal Mulai Kerja", value: activeOffering?.offeringDetails?.startDate || "-" },
                                    { label: "Durasi Kontrak", value: activeOffering?.offeringDetails?.contractDurationMonths ? `${activeOffering.offeringDetails.contractDurationMonths} bulan` : "-" },
                                    { label: "Lokasi Hari Pertama", value: activeOffering?.offeringDetails?.firstDayLocation || "-" },
                                    { label: "Jam Hadir Hari Pertama", value: activeOffering?.offeringDetails?.firstDayTime ? `${activeOffering.offeringDetails.firstDayTime} WIB` : "-" },
                                    { label: "Kontak Human Capital", value: hcContact, span: true },
                                  ].map(({ label, value, span }) => (
                                    <div key={label} className={cn("space-y-0.5", span && "sm:col-span-2")}>
                                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</p>
                                      <p className="font-semibold text-slate-800 dark:text-slate-200">{value}</p>
                                    </div>
                                  ))}
                                </div>
                              </CardContent>

                              {/* Aksi Cepat */}
                              <CardFooter className="flex flex-wrap gap-2 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30 px-4 py-3">
                                {activeOffering?.documentUrl && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      const fileId = extractFileIdFromUrl(activeOffering.documentUrl);
                                      openSecureFile(fileId, activeOffering.documentName || "Offering.pdf");
                                    }}
                                  >
                                    <Eye className="h-4 w-4 mr-1.5" />
                                    Lihat Dokumen
                                  </Button>
                                )}
                                {ofStatus !== "accepted" && ofStatus !== "rejected" && ofStatus !== "withdrawn" && (
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setIsOfferEditMode(true)}
                                  >
                                    <Edit className="h-4 w-4 mr-1.5" />
                                    Edit Penawaran
                                  </Button>
                                )}
                                {ofStatus !== "withdrawn" && offeringsList && offeringsList.length > 0 && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-900 dark:hover:bg-red-950/30"
                                    onClick={handleWithdrawAllOfferings}
                                    disabled={isWithdrawingOfferings}
                                  >
                                    <RotateCcw className="h-4 w-4 mr-1.5" />
                                    {isWithdrawingOfferings ? "Menarik..." : "Tarik Penawaran"}
                                  </Button>
                                )}
                              </CardFooter>
                            </Card>

                            {/* Accordion: Detail tersembunyi */}
                            <Accordion type="multiple" className="space-y-3">
                              <AccordionItem value="detail-form" className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                                <AccordionTrigger className="px-4 py-3 text-sm font-semibold hover:no-underline hover:bg-slate-50 dark:hover:bg-slate-900/40 [&[data-state=open]>svg]:rotate-180">
                                  <span className="flex items-center gap-2">
                                    <FileText className="h-4 w-4 text-slate-500" />
                                    Detail &amp; Edit Penawaran
                                  </span>
                                </AccordionTrigger>
                                <AccordionContent className="px-0 pb-0">
                                  <div className="border-t border-slate-200 dark:border-slate-700">
                                    <OfferEditor
                                      id="offering"
                                      application={application}
                                      job={job}
                                      candidateName={profile.fullName}
                                      onSaveDraft={async (d) => { await handleSaveOfferDraft(d); setIsOfferEditMode(false); }}
                                      onSendOffer={async (d) => { await handleSendOffer(d); setIsOfferEditMode(false); }}
                                      isSavingDraft={isSavingDraft}
                                      isSendingOffer={isSendingOffer}
                                      currentOfferingId={activeOffering?.id}
                                      currentOfferingStatus={activeOffering?.status as any}
                                      offering={activeOffering || undefined}
                                      allOfferings={offeringsList || []}
                                    />
                                  </div>
                                </AccordionContent>
                              </AccordionItem>

                              {activeOffering?.history && activeOffering.history.length > 0 && (
                                <AccordionItem value="history" className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                                  <AccordionTrigger className="px-4 py-3 text-sm font-semibold hover:no-underline hover:bg-slate-50 dark:hover:bg-slate-900/40 [&[data-state=open]>svg]:rotate-180">
                                    <span className="flex items-center gap-2">
                                      <Clock className="h-4 w-4 text-slate-500" />
                                      Riwayat Penawaran ({activeOffering.history.length})
                                    </span>
                                  </AccordionTrigger>
                                  <AccordionContent className="px-4 pb-4">
                                    <div className="space-y-2 pt-3">
                                      {[...activeOffering.history].reverse().map((h: any, i: number) => (
                                        <div key={i} className="flex items-start gap-3 text-sm border-l-2 border-slate-200 dark:border-slate-700 pl-3 py-1">
                                          <div className="flex-1 min-w-0">
                                            <p className="font-medium text-slate-800 dark:text-slate-200">{h.description || h.type}</p>
                                            {h.at && (
                                              <p className="text-xs text-slate-400 mt-0.5">
                                                {format(h.at.toDate?.() || new Date(h.at), "dd MMM yyyy, HH:mm", { locale: idLocale })}
                                              </p>
                                            )}
                                          </div>
                                          <Badge variant="outline" className="text-[10px] shrink-0 capitalize">
                                            {h.type?.replace(/_/g, " ")}
                                          </Badge>
                                        </div>
                                      ))}
                                    </div>
                                  </AccordionContent>
                                </AccordionItem>
                              )}
                            </Accordion>
                          </div>
                        ) : (
                          /* ── MODE FORM (draft / belum ada / mode edit) ── */
                          <div className="space-y-4">
                            {isOfferEditMode && (
                              <div className="flex items-center justify-between p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                                <span className="text-sm font-medium text-amber-800 dark:text-amber-300 flex items-center gap-2">
                                  <Edit className="h-4 w-4" />
                                  Mode Edit Penawaran — perubahan akan diterapkan ke penawaran aktif
                                </span>
                                <Button variant="ghost" size="sm" onClick={() => setIsOfferEditMode(false)} className="text-amber-700 dark:text-amber-300">
                                  Batal
                                </Button>
                              </div>
                            )}
                            {activeOffering?.status === "draft" && !isOfferEditMode && (
                              <div className="flex flex-wrap gap-2">
                                {activeOffering?.documentUrl && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      const fileId = extractFileIdFromUrl(activeOffering.documentUrl);
                                      openSecureFile(fileId, activeOffering.documentName || "Offering.pdf");
                                    }}
                                  >
                                    <Eye className="h-4 w-4 mr-1.5" />
                                    Preview Dokumen
                                  </Button>
                                )}
                                <Button type="button" variant="destructive" size="sm" onClick={handleDeleteDraft} disabled={isDeletingDraft}>
                                  <X className="h-4 w-4 mr-1.5" />
                                  {isDeletingDraft ? "Menghapus..." : "Hapus Draft"}
                                </Button>
                              </div>
                            )}
                            <OfferEditor
                              id="offering"
                              application={application}
                              job={job}
                              candidateName={profile.fullName}
                              onSaveDraft={handleSaveOfferDraft}
                              onSendOffer={async (d) => { await handleSendOffer(d); setIsOfferEditMode(false); }}
                              isSavingDraft={isSavingDraft}
                              isSendingOffer={isSendingOffer}
                              currentOfferingId={activeOffering?.id}
                              currentOfferingStatus={activeOffering?.status as any}
                              offering={activeOffering || undefined}
                              allOfferings={offeringsList || []}
                            />
                          </div>
                        );
                      })()}
                    </>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </>
      )}
    </DashboardLayout>
  );
}
