"use client";

import { useEffect, useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { GoogleDatePicker } from "@/components/ui/google-date-picker";
import type { Job, JobApplication, Offering } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  FileText,
  Send,
  Save,
  Upload,
  Eye,
  X,
  Calendar,
  Clock,
  MapPin,
  User,
  FileCheck,
  RotateCcw,
  CheckCircle,
  XCircle,
  AlertCircle,
  Trash2,
} from "lucide-react";
import {
  addDoc,
  collection,
  serverTimestamp,
  doc,
  getDoc,
  setDoc,
  writeBatch,
  updateDoc,
  deleteDoc,
  deleteField,
  Timestamp,
} from "firebase/firestore";
import { uploadFile } from "@/lib/storage/storage-adapter";
import {
  validateStorageFile,
  compressImage,
} from "@/lib/storage-utils";
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { useFirestore } from "@/firebase";
import { openOfferingDocument, isGoogleDriveUrl } from "@/lib/offering-file-utils";
import { useAuth } from "@/providers/auth-provider";
import { updateDocumentNonBlocking } from "@/firebase";

import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const fileMetadataSchema = z.object({
  url: z.string().url(),
  name: z.string(),
  size: z.number(),
  type: z.string(),
});

const offerSchema = z.object({
  documentFile: z
    .union([z.instanceof(File), fileMetadataSchema])
    .refine((file) => {
      const allowedTypes = [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "image/jpeg",
        "image/png",
      ];
      return allowedTypes.includes(
        file instanceof File ? file.type : file.type,
      );
    }, "File harus berupa dokumen (PDF, Word, DOCX) atau gambar (JPG, PNG)"),
  responseDeadline: z.date({
    required_error: "Batas konfirmasi kandidat diperlukan",
  }),
  responseDeadlineTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Format waktu harus HH:mm"),
  // Informasi penawaran (tanpa gaji)
  startDate: z.string().optional(),
  contractDurationMonths: z.coerce.number().int().min(1).max(60).optional(),
  firstDayTime: z.string().optional(),
  firstDayLocation: z.string().optional(),
  humanCapitalContactName: z.string().optional(),
  humanCapitalContactPhone: z.string().optional(),
  saveContactAsDefault: z.boolean().optional(),
  additionalNotes: z.string().optional(),
});

export type OfferFormData = z.infer<typeof offerSchema>;

interface OfferEditorProps {
  id?: string;
  application: JobApplication;
  job: Job;
  candidateName: string;
  onSaveDraft: (data: any) => Promise<void>;
  onSendOffer: (data: any) => Promise<void>;
  isSavingDraft?: boolean;
  isSendingOffer?: boolean;
  currentOfferingId?: string;
  currentOfferingStatus?: "draft" | "sent" | "viewed" | "accepted" | "rejected";
  offering?: Offering;
  allOfferings?: Offering[];
}

function getCurrentTimeString(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function combineDateAndTime(date: Date, time?: string): Date {
  const timeStr = typeof time === "string" ? time : "";

  if (!timeStr || !timeStr.includes(":")) {
    return new Date(date);
  }
  try {
    const [hours, minutes] = timeStr.split(":").map(Number);
    const combined = new Date(date);
    combined.setHours(hours, minutes, 0, 0);
    return combined;
  } catch {
    return new Date(date);
  }
}

export function OfferEditor({
  id,
  application,
  job,
  candidateName,
  onSaveDraft,
  onSendOffer,
  isSavingDraft = false,
  isSendingOffer = false,
  currentOfferingId,
  currentOfferingStatus,
  offering,
  allOfferings = [],
}: OfferEditorProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<z.infer<
    typeof fileMetadataSchema
  > | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const [defaultHcContactName, setDefaultHcContactName] = useState<string>("");
  const [defaultHcContactPhone, setDefaultHcContactPhone] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const firestore = useFirestore();
  const { userProfile } = useAuth();
  const { toast } = useToast();

  // Fetch default Human Capital contact from recruitment_settings/offering
  useEffect(() => {
    const settingsRef = doc(firestore, "recruitment_settings", "offering");
    getDoc(settingsRef)
      .then((snap) => {
        if (snap.exists()) {
          const d = snap.data();
          if (d?.defaultHumanCapitalContactName) setDefaultHcContactName(d.defaultHumanCapitalContactName);
          if (d?.defaultHumanCapitalContactPhone) setDefaultHcContactPhone(d.defaultHumanCapitalContactPhone);
        }
      })
      .catch(() => {});
  }, [firestore]);

  const form = useForm<OfferFormData>({
    resolver: zodResolver(offerSchema),
    defaultValues: {
      responseDeadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      responseDeadlineTime: "17:00",
      startDate: "",
      contractDurationMonths: undefined,
      firstDayTime: "08:00",
      firstDayLocation: "",
      humanCapitalContactName: "",
      humanCapitalContactPhone: "",
      saveContactAsDefault: false,
      additionalNotes:
        "Apabila Saudara menyetujui penawaran ini, silakan membubuhkan tanda tangan pada Lembar Penerimaan Posisi, kemudian mengunggah kembali dokumen yang telah ditandatangani melalui portal ini sebelum batas waktu yang telah ditentukan.",
    },
  });

  useEffect(() => {
    if (!offering) return;

    const documentMetadata = {
      url: offering.documentUrl,
      name: offering.documentName || "Penawaran Kandidat",
      size: 0,
      type: offering.documentType || "application/pdf",
    };

    const deadlineDate = offering.responseDeadline?.toDate
      ? offering.responseDeadline.toDate()
      : new Date();
    const deadlineTime = `${String(deadlineDate.getHours()).padStart(
      2,
      "0",
    )}:${String(deadlineDate.getMinutes()).padStart(2, "0")}`;

    setSelectedFile(null);
    setFilePreview(documentMetadata);
    form.reset({
      documentFile: documentMetadata,
      responseDeadline: deadlineDate,
      responseDeadlineTime: deadlineTime,
      startDate: offering.offeringDetails?.startDate ?? "",
      contractDurationMonths: offering.offeringDetails?.contractDurationMonths
        ? Number(offering.offeringDetails.contractDurationMonths) || undefined
        : undefined,
      firstDayTime: offering.offeringDetails?.firstDayTime ?? "",
      firstDayLocation: offering.offeringDetails?.firstDayLocation ?? "",
      humanCapitalContactName:
        offering.offeringDetails?.humanCapitalContactName ||
        defaultHcContactName ||
        "",
      humanCapitalContactPhone:
        offering.offeringDetails?.humanCapitalContactPhone ||
        // legacy single-field fallback: if old data had "Name - Phone", try to split
        (offering.offeringDetails?.humanCapitalContact || offering.offeringDetails?.hrContact
          ? (offering.offeringDetails?.humanCapitalContact || offering.offeringDetails?.hrContact || "").split(" - ").slice(1).join(" - ") || ""
          : "") ||
        defaultHcContactPhone ||
        "",
      saveContactAsDefault: false,
      additionalNotes:
        offering.additionalNotes ??
        "Apabila Saudara menyetujui penawaran ini, silakan membubuhkan tanda tangan pada Lembar Penerimaan Posisi, kemudian mengunggah kembali dokumen yang telah ditandatangani melalui portal ini sebelum batas waktu yang telah ditentukan.",
    });
  }, [offering, defaultHcContactName, defaultHcContactPhone, form]);

  // When no offering exists and defaults load, pre-fill the fields
  useEffect(() => {
    if (!offering) {
      if (defaultHcContactName && !form.getValues("humanCapitalContactName")) {
        form.setValue("humanCapitalContactName", defaultHcContactName);
      }
      if (defaultHcContactPhone && !form.getValues("humanCapitalContactPhone")) {
        form.setValue("humanCapitalContactPhone", defaultHcContactPhone);
      }
    }
  }, [defaultHcContactName, defaultHcContactPhone, offering, form]);

  // Always uploads to Firebase Storage so candidates can access without Google account.
  const uploadOfferingToStorage = async (
    file: File,
  ): Promise<{ url: string; path: string; name: string; mimeType: string }> => {
    const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `offerings/${application.id}/${Date.now()}-${safeFileName}`;
    const storage = getStorage();
    const storageRef = ref(storage, filePath);
    const task = uploadBytesResumable(storageRef, file, { contentType: file.type });
    await new Promise<void>((resolve, reject) => {
      task.on("state_changed", undefined, reject, resolve);
    });
    const url = await getDownloadURL(task.snapshot.ref);
    return { url, path: filePath, name: file.name, mimeType: file.type };
  };

  const uploadDocument = async (
    fileOrMetadata: File | z.infer<typeof fileMetadataSchema>,
  ): Promise<{ url: string; path: string; name: string; mimeType: string }> => {
    if (fileOrMetadata instanceof File) {
      return uploadOfferingToStorage(fileOrMetadata);
    }
    // Legacy metadata object — url only, no path
    return { url: fileOrMetadata.url, path: "", name: fileOrMetadata.name || "", mimeType: "" };
  };

  const handleFileSelect = (file: File | null) => {
    if (file) {
      const metadata = {
        name: file.name,
        size: file.size,
        type: file.type,
        url: URL.createObjectURL(file),
      };
      setSelectedFile(file);
      setFilePreview(metadata);
      form.setValue("documentFile", file, {
        shouldValidate: true,
        shouldDirty: true,
      });
    } else {
      setSelectedFile(null);
      setFilePreview(null);
      form.setValue("documentFile", null as any, {
        shouldValidate: true,
        shouldDirty: true,
      });
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    const pdfFile = files.find((file) => file.type === "application/pdf");

    if (pdfFile) {
      const validation = validateStorageFile(pdfFile);
      if (!validation.isValid) {
        toast({
          variant: "destructive",
          title: "File Terlalu Besar",
          description: validation.message,
        });
        return;
      }
      handleFileSelect(pdfFile);
    } else {
      toast({
        variant: "destructive",
        title: "Invalid File",
        description: "Please select a PDF file.",
      });
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const validation = validateStorageFile(file);
      if (!validation.isValid) {
        toast({
          variant: "destructive",
          title: "File Terlalu Besar",
          description: validation.message,
        });
        return;
      }
    }
    handleFileSelect(file || null);
  };

  const previewPDF = () => {
    if (selectedFile) {
      window.open(URL.createObjectURL(selectedFile), "_blank");
      return;
    }
    if (filePreview?.url) {
      openOfferingDocument({
        documentUrl: filePreview.url,
        documentPath: (offering as any)?.documentPath,
        documentName: filePreview.name,
      }).catch((e) => toast({ variant: "destructive", title: "Gagal Membuka", description: e.message }));
    }
  };

  const handleSaveDraft = async (data: OfferFormData) => {
    if (!userProfile) return;

    setIsUploading(true);
    try {
      const docResult = await uploadDocument(data.documentFile);
      const responseDeadline = combineDateAndTime(
        data.responseDeadline,
        data.responseDeadlineTime,
      );

      const offeringPayload = {
        applicationId: application.id!,
        candidateName,
        candidateEmail: application.candidateEmail,
        documentUrl: docResult.url,
        documentPath: docResult.path,
        documentName: data.documentFile instanceof File ? data.documentFile.name : (data.documentFile as any).name || "",
        documentType: data.documentFile instanceof File ? data.documentFile.type : (data.documentFile as any).type || "",
        responseDeadline,
        status: "draft" as const,
        isActive: true, // Always active if it's the current draft being edited
        offeringDetails: {
          startDate: data.startDate,
          contractDurationMonths: data.contractDurationMonths,
          firstDayTime: data.firstDayTime,
          firstDayLocation: data.firstDayLocation,
          humanCapitalContactName: data.humanCapitalContactName,
          humanCapitalContactPhone: data.humanCapitalContactPhone,
          humanCapitalContact: [data.humanCapitalContactName, data.humanCapitalContactPhone].filter(Boolean).join(" - "),
        },
        additionalNotes: data.additionalNotes,
        updatedAt: serverTimestamp(),
        candidateUid: application.candidateUid, // Critical for security rules
      };

      const batch = writeBatch(firestore);

      // Save contact as default if requested
      if (data.saveContactAsDefault && (data.humanCapitalContactName || data.humanCapitalContactPhone)) {
        const settingsRef = doc(firestore, "recruitment_settings", "offering");
        batch.set(settingsRef, {
          defaultHumanCapitalContactName: data.humanCapitalContactName || "",
          defaultHumanCapitalContactPhone: data.humanCapitalContactPhone || "",
        }, { merge: true });
        if (data.humanCapitalContactName) setDefaultHcContactName(data.humanCapitalContactName);
        if (data.humanCapitalContactPhone) setDefaultHcContactPhone(data.humanCapitalContactPhone);
      }

      // 1. Deactivate ALL other offerings for this application
      const otherOfferings =
        allOfferings?.filter((o) => o.id !== offering?.id) || [];
      otherOfferings.forEach((o) => {
        if (o.id && o.isActive) {
          const oRef = doc(firestore, "offerings", o.id);
          batch.update(oRef, { isActive: false, updatedAt: serverTimestamp() });
        }
      });

      let finalOfferingId = offering?.id;

      // 2. Prepare/Update the offering document
      if (offering?.id) {
        const offeringRef = doc(firestore, "offerings", offering.id);
        batch.update(offeringRef, {
          ...offeringPayload,
          candidateUid: application.candidateUid,
          applicationId: application.id!,
          candidateEmail: application.candidateEmail,
          status: offeringPayload.status,
          isActive: offeringPayload.isActive,
          history: [
            ...(offering.history || []),
            {
              type: "draft_updated",
              description: "Draft penawaran kerja disimpan",
              at: Timestamp.now(),
              by: userProfile.uid,
            },
          ],
        });
      } else {
        const newOfferingRef = doc(collection(firestore, "offerings"));
        finalOfferingId = newOfferingRef.id;
        batch.set(newOfferingRef, {
          ...offeringPayload,
          history: [
            {
              type: "draft_created",
              description: "Draft penawaran kerja dibuat",
              at: Timestamp.now(),
              by: userProfile.uid,
            },
            {
              type: "document_uploaded",
              description: `Dokumen "${data.documentFile.name}" diunggah`,
              at: Timestamp.now(),
              by: userProfile.uid,
            },
          ],
          createdAt: serverTimestamp(),
          createdBy: userProfile.uid,
        });
      }

      // 3. ATOMICALLY update the application pointer and status
      const appRef = doc(firestore, "applications", application.id!);
      batch.update(appRef, {
        activeOfferingId: finalOfferingId,
        currentOfferingId: finalOfferingId, // Backward compatibility
        offerStatus: "draft" as const,
        responseDeadline: responseDeadline
          ? Timestamp.fromDate(new Date(responseDeadline))
          : null,
        updatedAt: serverTimestamp(),
      });

      await batch.commit();

      toast({
        title: "Draft Tersimpan",
        description: "Draft penawaran berhasil disimpan.",
      });

      await onSaveDraft({ ...data, offeringId: finalOfferingId });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleWithdrawOffer = async (offeringId: string) => {
    if (!userProfile) return;

    try {
      setIsUndoing(true); // Using isUndoing for loading state
      const offeringRef = doc(firestore, "offerings", offeringId);
      // Batch update to keep offering and application in sync
      const batch = writeBatch(firestore);

      batch.update(offeringRef, {
        status: "withdrawn",
        isActive: false,
        withdrawnAt: serverTimestamp(),
        withdrawnBy: userProfile.uid,
        candidateUid: application.candidateUid,
        applicationId: application.id!,
        candidateEmail: application.candidateEmail,
        history: [
          ...(allOfferings?.find((o) => o.id === offeringId)?.history || []),
          {
            type: "withdrawn",
            description: "Penawaran kerja ditarik oleh HRD",
            at: Timestamp.now(),
          },
        ],
        updatedAt: serverTimestamp(),
      });

      // Reset offering fields in application document to prevent ghost offerings
      const appRef = doc(firestore, "applications", application.id!);
      batch.update(appRef, {
        offerStatus: deleteField(),
        offeredSalary: null,
        contractStartDate: null,
        contractDurationMonths: null,
        probationDurationMonths: null,
        offerNotes: null,
        offerDescription: null,
        activeOfferingId: null,
        currentOfferingId: null,
        finalOfferingUrl: null,
        offerSentAt: null,
        offerViewedAt: null,
        offerSections: deleteField(),
        contractEndDate: null,
        workDays: null,
        responseDeadline: null,
        offerRejectionReason: null,
        candidateOfferDecisionAt: null,
        // Also revert status if currently in offered/offering stage
        status:
          application.status === "offered" ? "interview" : application.status,
      });

      await batch.commit();

      toast({
        title: "Penawaran Ditarik",
        description:
          "Penawaran telah dinonaktifkan dan tidak lagi tampil di kandidat.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setIsUndoing(false);
    }
  };

  const handleDeleteOffering = async (offeringId: string) => {
    if (!userProfile) return;

    try {
      setIsUndoing(true);
      const offeringRef = doc(firestore, "offerings", offeringId);

      const batch = writeBatch(firestore);
      batch.delete(offeringRef);

      // If this was the current offering, reset the application fields
      if (application.currentOfferingId === offeringId) {
        const appRef = doc(firestore, "applications", application.id!);
        batch.update(appRef, {
          offerStatus: deleteField(),
          offeredSalary: null,
          contractStartDate: null,
          contractDurationMonths: null,
          probationDurationMonths: null,
          offerNotes: null,
          offerDescription: null,
          activeOfferingId: null,
          currentOfferingId: null,
          finalOfferingUrl: null,
          offerSentAt: null,
          offerViewedAt: null,
          offerSections: deleteField(),
          contractEndDate: null,
          workDays: null,
          responseDeadline: null,
          offerRejectionReason: null,
          candidateOfferDecisionAt: null,
          status:
            application.status === "offered" ? "interview" : application.status,
        });
      }

      await batch.commit();

      toast({
        title: "Riwayat Dihapus",
        description: "Dokumen penawaran telah dihapus secara permanen.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setIsUndoing(false);
    }
  };

  const handleSendOffer = async (data: OfferFormData) => {
    if (!userProfile) return;

    setIsUploading(true);
    try {
      const docResult = await uploadDocument(data.documentFile);
      const responseDeadline = combineDateAndTime(
        data.responseDeadline,
        data.responseDeadlineTime,
      );

      const offeringPayload = {
        applicationId: application.id!,
        candidateName,
        candidateEmail: application.candidateEmail,
        documentUrl: docResult.url,
        documentPath: docResult.path,
        documentName: data.documentFile instanceof File ? data.documentFile.name : (data.documentFile as any).name || "",
        documentType: data.documentFile instanceof File ? data.documentFile.type : (data.documentFile as any).type || "",
        responseDeadline,
        status: "sent" as const,
        isActive: true,
        offeringDetails: {
          startDate: data.startDate,
          contractDurationMonths: data.contractDurationMonths,
          firstDayTime: data.firstDayTime,
          firstDayLocation: data.firstDayLocation,
          humanCapitalContactName: data.humanCapitalContactName,
          humanCapitalContactPhone: data.humanCapitalContactPhone,
          humanCapitalContact: [data.humanCapitalContactName, data.humanCapitalContactPhone].filter(Boolean).join(" - "),
        },
        additionalNotes: data.additionalNotes,
        sentAt: serverTimestamp(),
        sentBy: userProfile.uid,
        viewedAtFirst: null,
        viewedAtLast: null,
        viewCount: 0,
        respondedAt: null,
        responseType: null,
        updatedAt: serverTimestamp(),
        candidateUid: application.candidateUid, // Critical for security rules
      };

      const batch = writeBatch(firestore);

      // Save contact as default if requested
      if (data.saveContactAsDefault && (data.humanCapitalContactName || data.humanCapitalContactPhone)) {
        const settingsRef = doc(firestore, "recruitment_settings", "offering");
        batch.set(settingsRef, {
          defaultHumanCapitalContactName: data.humanCapitalContactName || "",
          defaultHumanCapitalContactPhone: data.humanCapitalContactPhone || "",
        }, { merge: true });
        if (data.humanCapitalContactName) setDefaultHcContactName(data.humanCapitalContactName);
        if (data.humanCapitalContactPhone) setDefaultHcContactPhone(data.humanCapitalContactPhone);
      }

      // 1. Deactivate ALL other offerings for this application
      const otherOfferings =
        allOfferings?.filter((o) => o.id !== offering?.id) || [];
      otherOfferings.forEach((o) => {
        if (o.id && o.isActive) {
          const oRef = doc(firestore, "offerings", o.id);
          batch.update(oRef, {
            isActive: false,
            status:
              o.status === "sent" || o.status === "viewed"
                ? "withdrawn"
                : o.status,
            updatedAt: serverTimestamp(),
          });
        }
      });

      let finalOfferingId = offering?.id;

      // 2. Prepare/Update the offering document
      if (offering?.id) {
        const offeringRef = doc(firestore, "offerings", offering.id);
        batch.update(offeringRef, {
          ...offeringPayload,
          candidateUid: application.candidateUid,
          applicationId: application.id!,
          candidateEmail: application.candidateEmail,
          status: offeringPayload.status,
          isActive: offeringPayload.isActive,
          history: [
            ...(offering?.history || []),
            {
              type: "sent",
              description: "Penawaran kerja dikirim ke kandidat",
              at: Timestamp.now(),
              by: userProfile.uid,
            },
          ],
        });
      } else {
        const newOfferingRef = doc(collection(firestore, "offerings"));
        finalOfferingId = newOfferingRef.id;
        batch.set(newOfferingRef, {
          ...offeringPayload,
          history: [
            {
              type: "draft_created",
              description: "Draft penawaran kerja dibuat",
              at: Timestamp.now(),
              by: userProfile.uid,
            },
            {
              type: "document_uploaded",
              description: `Dokumen "${data.documentFile.name}" diunggah`,
              at: Timestamp.now(),
              by: userProfile.uid,
            },
            {
              type: "sent",
              description: "Penawaran kerja dikirim ke kandidat",
              at: Timestamp.now(),
              by: userProfile.uid,
            },
          ],
          createdAt: serverTimestamp(),
          createdBy: userProfile.uid,
        });
      }

      // 3. ATOMICALLY update the application status and pointer
      const appRef = doc(firestore, "applications", application.id!);
      const timelineEvent = {
        type: "offered" as const,
        status: "offered" as const,
        description: "Penawaran kerja telah dikirim",
        at: Timestamp.now(),
        by: userProfile.uid,
      };

      batch.update(appRef, {
        status: "offered" as const,
        offerStatus: "sent" as const,
        activeOfferingId: finalOfferingId,
        currentOfferingId: finalOfferingId, // Backward compatibility
        responseDeadline: responseDeadline
          ? Timestamp.fromDate(new Date(responseDeadline))
          : null,
        offerSentAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        timeline: [...(application.timeline || []), timelineEvent],
      });

      await batch.commit();

      const offerLink = `${window.location.origin}/offer/${finalOfferingId}`;

      toast({
        title: "Penawaran Dikirim",
        description: `Link penawaran: ${offerLink}`,
      });

      await onSendOffer({ ...data, offeringId: finalOfferingId, offerLink });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Helper functions for activity history display
  const getActivityLabel = (type: string): string => {
    switch (type) {
      case "draft_created":
        return "Draft Dibuat";
      case "draft_updated":
        return "Draft Diperbarui";
      case "document_uploaded":
        return "Dokumen Diunggah";
      case "details_updated":
        return "Detail Penawaran Diubah";
      case "notes_updated":
        return "Catatan Diubah";
      case "deadline_updated":
        return "Batas Waktu Diubah";
      case "sent":
        return "Penawaran Dikirim";
      case "cancelled":
        return "Pengiriman Dibatalkan";
      case "viewed":
        return "Penawaran Dibuka";
      case "accepted":
        return "Penawaran Diterima";
      case "rejected":
        return "Penawaran Ditolak";
      case "expired":
        return "Penawaran Kedaluwarsa";
      default:
        return type;
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "draft_created":
      case "draft_updated":
        return <FileText className="h-5 w-5 text-gray-500" />;
      case "document_uploaded":
        return <Upload className="h-5 w-5 text-blue-500" />;
      case "details_updated":
      case "notes_updated":
      case "deadline_updated":
        return <Calendar className="h-5 w-5 text-purple-500" />;
      case "sent":
        return <Send className="h-5 w-5 text-blue-600" />;
      case "cancelled":
        return <XCircle className="h-5 w-5 text-orange-500" />;
      case "viewed":
        return <Eye className="h-5 w-5 text-yellow-500" />;
      case "accepted":
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case "rejected":
        return <AlertCircle className="h-5 w-5 text-red-600" />;
      case "expired":
        return <Clock className="h-5 w-5 text-gray-500" />;
      default:
        return <FileCheck className="h-5 w-5 text-gray-500" />;
    }
  };

  const getActivityColor = (type: string): string => {
    switch (type) {
      case "draft_created":
      case "draft_updated":
        return "text-gray-600";
      case "document_uploaded":
        return "text-blue-600";
      case "details_updated":
      case "deadline_updated":
        return "text-purple-600";
      case "notes_updated":
        return "text-indigo-600";
      case "sent":
        return "text-blue-600";
      case "cancelled":
        return "text-orange-600";
      case "viewed":
        return "text-yellow-600";
      case "accepted":
        return "text-green-600";
      case "rejected":
        return "text-red-600";
      case "expired":
        return "text-gray-600";
      default:
        return "text-gray-600";
    }
  };

  return (
    <Form {...form}>
      <div className="space-y-6">
        {/* Document Upload Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileCheck className="h-5 w-5" />
              Dokumen Penawaran Resmi
            </CardTitle>
            <CardDescription>
              Upload dokumen penawaran kerja yang sudah final. Ini akan menjadi
              dokumen utama yang diterima kandidat.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="documentFile"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>File Dokumen *</FormLabel>
                  <FormControl>
                    <div className="space-y-4">
                      {/* Drag & Drop Area */}
                      <div
                        className={cn(
                          "border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer",
                          isDragOver
                            ? "border-primary bg-primary/10"
                            : selectedFile
                              ? "border-primary/50 bg-primary/5"
                              : "border-muted-foreground/30 hover:border-muted-foreground/50",
                        )}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                          onChange={handleFileInputChange}
                          className="hidden"
                        />

                        {selectedFile || filePreview ? (
                          <div className="space-y-3">
                            {!selectedFile && filePreview?.url && isGoogleDriveUrl(filePreview.url) && (
                              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                                Dokumen masih menggunakan Google Drive link. Upload ulang dokumen ke portal agar kandidat dapat membuka file tanpa masalah akses akun.
                              </div>
                            )}
                            <div className="flex items-center justify-center gap-2 text-primary">
                              <FileText className="h-8 w-8" />
                              <span className="font-medium">PDF Selected</span>
                            </div>
                            <div className="text-sm text-muted-foreground">
                              <p className="font-medium">
                                {selectedFile?.name ?? filePreview?.name}
                              </p>
                              <p>
                                {(
                                  ((selectedFile?.size ?? filePreview?.size) ||
                                    0) /
                                  1024 /
                                  1024
                                ).toFixed(2)}{" "}
                                MB
                              </p>
                            </div>
                            <div className="flex gap-2 justify-center">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  previewPDF();
                                }}
                              >
                                <Eye className="h-4 w-4 mr-2" />
                                Preview
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleFileSelect(null);
                                }}
                              >
                                <X className="h-4 w-4 mr-2" />
                                Remove
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
                            <div>
                              <p className="font-medium">
                                Seret file ke sini atau klik untuk memilih file
                              </p>
                              <p className="text-sm text-muted-foreground">
                                Hanya mendukung file dokumen (PDF, Word, DOCX)
                                dan gambar (JPG, PNG)
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Informasi Penawaran Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Informasi Penawaran
            </CardTitle>
            <CardDescription>
              Lengkapi informasi penawaran. Detail ini akan ditampilkan kepada
              kandidat dan digunakan dalam template pesan otomatis.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">

            {/* ── Sub-section 1: Batas Waktu Konfirmasi Offering ── */}
            <div className="rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/20 p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold text-orange-800 dark:text-orange-300 flex items-center gap-1.5">
                  <Clock className="h-4 w-4" />
                  Batas Waktu Konfirmasi Offering
                </p>
                <p className="text-xs text-orange-700/80 dark:text-orange-400/80 mt-0.5">
                  Tanggal dan jam terakhir kandidat dapat mengunggah dokumen penerimaan posisi yang sudah ditandatangani.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
                <FormField
                  control={form.control}
                  name="responseDeadline"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground">Tanggal Batas Konfirmasi *</FormLabel>
                      <FormControl>
                        <GoogleDatePicker
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="contoh: 30 Juni 2026"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="responseDeadlineTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground">Jam Batas Konfirmasi *</FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-2">
                          <Input
                            type="time"
                            step="60"
                            {...field}
                            className="flex-1"
                            placeholder="17:00"
                          />
                          <span className="text-sm text-muted-foreground shrink-0">WIB</span>
                        </div>
                      </FormControl>
                      <p className="text-xs text-muted-foreground">contoh: 17:00 WIB</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* ── Sub-section 2: Informasi Hari Pertama ── */}
            <div className="rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50/40 dark:bg-teal-950/20 p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold text-teal-800 dark:text-teal-300 flex items-center gap-1.5">
                  <Calendar className="h-4 w-4" />
                  Informasi Hari Pertama
                </p>
                <p className="text-xs text-teal-700/80 dark:text-teal-400/80 mt-0.5">
                  Jadwal dan lokasi kandidat pada hari pertama kerja/program. Berbeda dari batas konfirmasi offering di atas.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Tanggal Mulai Kerja / Program */}
                <FormField
                  control={form.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        Tanggal Mulai Kerja / Program
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          placeholder="contoh: 1 Juli 2026"
                          {...field}
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        Tanggal rencana kandidat mulai bekerja, magang, atau mengikuti program.
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Durasi Kontrak / Program */}
                <FormField
                  control={form.control}
                  name="contractDurationMonths"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Durasi Kontrak / Program
                      </FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min={1}
                            max={60}
                            placeholder="contoh: 3"
                            {...field}
                            value={field.value ?? ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              field.onChange(v === "" ? undefined : Number(v));
                            }}
                            className="flex-1"
                          />
                          <span className="text-sm text-muted-foreground shrink-0">bulan</span>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Jam Hadir Hari Pertama */}
                <FormField
                  control={form.control}
                  name="firstDayTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Jam Hadir Hari Pertama
                      </FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-2">
                          <Input
                            type="time"
                            step="60"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value)}
                            className="flex-1"
                          />
                          <span className="text-sm text-muted-foreground shrink-0">WIB</span>
                        </div>
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        Jam kedatangan kandidat pada hari pertama kerja/program, bukan jam batas konfirmasi offering.
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Lokasi Hari Pertama */}
                <FormField
                  control={form.control}
                  name="firstDayLocation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        Lokasi Hari Pertama
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="contoh: Kantor Pusat Yogyakarta / Online / Lokasi sesuai penempatan"
                          {...field}
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        Lokasi kandidat hadir pada hari pertama kerja/program.
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Kontak Human Capital */}
            <div className="space-y-3">
              <p className="text-sm font-medium flex items-center gap-2">
                <User className="h-4 w-4" />
                Kontak Human Capital
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="humanCapitalContactName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground">Nama Kontak</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="contoh: Human Capital / Nama HRD"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="humanCapitalContactPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground">Nomor Kontak</FormLabel>
                      <FormControl>
                        <Input
                          type="tel"
                          placeholder="contoh: 08123456789"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Kontak ini akan ditampilkan kepada kandidat jika ada pertanyaan terkait offering.
              </p>
            </div>
            <FormField
              control={form.control}
              name="saveContactAsDefault"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2 space-y-0 -mt-2">
                  <FormControl>
                    <input
                      type="checkbox"
                      id="saveContactAsDefault"
                      checked={!!field.value}
                      onChange={(e) => field.onChange(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-primary accent-primary cursor-pointer"
                    />
                  </FormControl>
                  <FormLabel htmlFor="saveContactAsDefault" className="text-sm font-normal cursor-pointer">
                    Simpan sebagai kontak default untuk offering berikutnya
                  </FormLabel>
                </FormItem>
              )}
            />

            {/* Instruksi untuk Kandidat */}
            <FormField
              control={form.control}
              name="additionalNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <FileCheck className="h-4 w-4" />
                    Instruksi untuk Kandidat
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      rows={4}
                      placeholder="Instruksi kepada kandidat mengenai cara menyetujui penawaran ini..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Template Pesan Offering */}
        {(() => {
          const deadline = form.watch("responseDeadline");
          const deadlineTime = form.watch("responseDeadlineTime");
          const humanCapitalContactName = form.watch("humanCapitalContactName");
          const humanCapitalContactPhone = form.watch("humanCapitalContactPhone");
          const humanCapitalContact = [humanCapitalContactName, humanCapitalContactPhone].filter(Boolean).join(" - ");
          const deadlineDate = deadline
            ? new Intl.DateTimeFormat("id-ID", {
                day: "numeric",
                month: "long",
                year: "numeric",
              }).format(deadline)
            : "[tanggal]";
          const deadlineTimeStr = deadlineTime || "[jam]";

          const message = [
            `Dear ${candidateName},`,
            "",
            `Terimalah salam hangat dari kami ${job.brandName || "[brandName]"}.`,
            "",
            `Berdasarkan hasil proses seleksi dan wawancara yang telah Saudara ikuti bersama tim kami, dengan senang hati kami sampaikan bahwa Saudara telah sesuai dengan kualifikasi yang dibutuhkan oleh perusahaan untuk posisi ${application.jobPosition || "[posisi]"}.`,
            "",
            `Berikut kami kirimkan Surat Penawaran Kerja yang dapat Saudara pertimbangkan. Apabila Saudara menyetujui penawaran tersebut, silakan membubuhkan tanda tangan pada Lembar Penerimaan Posisi, kemudian mengunggah kembali dokumen yang telah ditandatangani melalui portal ini maksimal ${deadlineDate} pukul ${deadlineTimeStr} WIB untuk melanjutkan tahap berikutnya, yaitu penandatanganan kontrak.`,
            "",
            `Kami sangat berharap Saudara dapat mempertimbangkan dan bergabung dengan perusahaan kami. Apabila terdapat hal-hal yang perlu didiskusikan lebih lanjut, mohon jangan ragu untuk menghubungi tim Human Capital${humanCapitalContact ? ` melalui ${humanCapitalContact}` : ""}.`,
            "",
            "Demikian surat penawaran ini kami sampaikan. Atas perhatian dan kerja sama yang baik, kami ucapkan terima kasih.",
            "",
            "Regards,",
            "Human Capital",
            job.brandName || "[brandName]",
          ].join("\n");

          return (
            <Card className="border-teal-200 dark:border-teal-800 bg-teal-50/30 dark:bg-teal-950/20">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-teal-700 dark:text-teal-400">
                  <FileText className="h-5 w-5" />
                  Template Pesan Offering
                </CardTitle>
                <CardDescription>
                  Pesan ini otomatis dibuat berdasarkan data kandidat, posisi, dan batas konfirmasi di atas.
                  Isi ini akan ditampilkan kepada kandidat bersama dokumen penawaran.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border rounded-lg p-4 leading-relaxed font-sans">
                  {message}
                </pre>
              </CardContent>
            </Card>
          );
        })()}

        {/* Action Buttons — rendered based on current offering status */}
        {(() => {
          const s = currentOfferingStatus;
          const isDraft  = !s || s === "draft";
          const isSent   = s === "sent" || s === "viewed";
          const isAccepted  = s === "accepted";
          const isRejected  = s === "rejected";
          const isWithdrawn = s === "withdrawn";

          if (isAccepted) {
            return (
              <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-950/10">
                <CardContent className="pt-5 pb-5 flex flex-wrap gap-3 items-center">
                  <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0" />
                  <span className="text-sm font-medium text-emerald-800 dark:text-emerald-300 flex-1">
                    Kandidat telah menerima penawaran ini.
                  </span>
                  {filePreview?.url && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        openOfferingDocument({ documentUrl: filePreview.url, documentPath: (offering as any)?.documentPath, documentName: filePreview.name }).catch((e) => toast({ variant: "destructive", title: "Gagal Membuka", description: e.message }));
                      }}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Lihat Dokumen
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          }

          if (isRejected) {
            return (
              <Card className="border-red-200 dark:border-red-900 bg-red-50/30 dark:bg-red-950/10">
                <CardContent className="pt-5 pb-5 flex flex-wrap gap-3 items-center">
                  <XCircle className="h-5 w-5 text-red-500 shrink-0" />
                  <span className="text-sm font-medium text-red-800 dark:text-red-300 flex-1">
                    Kandidat menolak penawaran ini.
                  </span>
                  {filePreview?.url && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        openOfferingDocument({ documentUrl: filePreview.url, documentPath: (offering as any)?.documentPath, documentName: filePreview.name }).catch((e) => toast({ variant: "destructive", title: "Gagal Membuka", description: e.message }));
                      }}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Lihat Dokumen
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={form.handleSubmit(handleSendOffer)}
                    disabled={isSendingOffer || isUploading}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    {isSendingOffer || isUploading ? "Mengirim..." : "Buat Penawaran Baru"}
                  </Button>
                </CardContent>
              </Card>
            );
          }

          if (isWithdrawn) {
            return (
              <Card className="border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30">
                <CardContent className="pt-5 pb-5 flex flex-wrap gap-3 items-center">
                  <RotateCcw className="h-5 w-5 text-slate-400 shrink-0" />
                  <span className="text-sm font-medium text-slate-600 dark:text-slate-400 flex-1">
                    Penawaran ini telah ditarik.
                  </span>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={form.handleSubmit(handleSendOffer)}
                    disabled={isSendingOffer || isUploading}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    {isSendingOffer || isUploading ? "Mengirim..." : "Buat Penawaran Baru"}
                  </Button>
                </CardContent>
              </Card>
            );
          }

          if (isSent) {
            return (
              <Card>
                <CardContent className="pt-5 pb-5">
                  {s === "viewed" && (
                    <p className="text-xs text-blue-600 dark:text-blue-400 mb-3 flex items-center gap-1.5">
                      <Eye className="h-3.5 w-3.5" />
                      Kandidat telah melihat penawaran ini.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-3">
                    {filePreview?.url && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => openOfferingDocument({ documentUrl: filePreview.url, documentPath: (offering as any)?.documentPath, documentName: filePreview.name }).catch((e) => toast({ variant: "destructive", title: "Gagal Membuka", description: e.message }))}
                        className="flex-1 min-w-[140px]"
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        Lihat Dokumen
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={form.handleSubmit(handleSaveDraft)}
                      disabled={isSavingDraft || isUploading}
                      className="flex-1 min-w-[140px]"
                    >
                      <Save className="h-4 w-4 mr-2" />
                      {isSavingDraft || isUploading ? "Menyimpan..." : "Simpan Perubahan"}
                    </Button>
                    {currentOfferingId && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleWithdrawOffer(currentOfferingId)}
                        disabled={isUndoing}
                        className="flex-1 min-w-[140px] text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-900 dark:hover:bg-red-950/30"
                      >
                        <RotateCcw className="h-4 w-4 mr-2" />
                        {isUndoing ? "Menarik..." : "Tarik Penawaran"}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          }

          // isDraft (default — belum pernah dikirim atau status draft)
          return (
            <Card>
              <CardContent className="pt-5 pb-5">
                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={form.handleSubmit(handleSaveDraft)}
                    disabled={isSavingDraft || isUploading}
                    className="flex-1 min-w-[140px]"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {isSavingDraft || isUploading ? "Menyimpan..." : "Simpan Draft"}
                  </Button>
                  <Button
                    type="button"
                    onClick={form.handleSubmit(handleSendOffer)}
                    disabled={isSendingOffer || isUploading}
                    className="flex-1 min-w-[140px]"
                  >
                    <Send className="h-4 w-4 mr-2" />
                    {isSendingOffer || isUploading ? "Mengirim..." : "Kirim Penawaran"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })()}

        {/* Offering List Section (Active and History) */}
        {allOfferings && allOfferings.length > 0 && (
          <div className="space-y-6">
            <div className="flex items-center gap-2 border-b pb-2">
              <FileCheck className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-bold">Semua Penawaran (Audit Log)</h3>
            </div>

            {/* SECTION 1: OFFERING AKTIF */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                  Offering Aktif
                </h4>
                <Badge
                  variant="outline"
                  className="bg-green-50/50 text-green-700 border-green-200"
                >
                  {allOfferings.filter((o: Offering) => o.isActive).length}{" "}
                  Aktif
                </Badge>
              </div>

              <div className="grid gap-4">
                {allOfferings
                  .filter((o: Offering) => o.isActive)
                  .map((offeringItem: Offering) => (
                    <OfferingAuditCard
                      key={offeringItem.id}
                      offering={offeringItem}
                      isActive
                    />
                  ))}
                {allOfferings.filter((o: Offering) => o.isActive).length ===
                  0 && (
                  <p className="text-sm text-muted-foreground italic p-4 border border-dashed rounded-md text-center">
                    Tidak ada penawaran aktif saat ini.
                  </p>
                )}
              </div>
            </div>

            {/* SECTION 2: RIWAYAT OFFERING */}
            <div className="space-y-4 pt-4">
              <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <RotateCcw className="h-3 w-3" />
                Riwayat Offering / Nonaktif
              </h4>
              <div className="grid gap-4">
                {allOfferings
                  .filter((o: Offering) => !o.isActive)
                  .sort((a: Offering, b: Offering) => {
                    const dateA = a.updatedAt?.toDate?.() || new Date(0);
                    const dateB = b.updatedAt?.toDate?.() || new Date(0);
                    return dateB.getTime() - dateA.getTime();
                  })
                  .map((offeringItem: Offering) => (
                    <OfferingAuditCard
                      key={offeringItem.id}
                      offering={offeringItem}
                      onDelete={() => handleDeleteOffering(offeringItem.id!)}
                    />
                  ))}
                {allOfferings.filter((o: Offering) => !o.isActive).length ===
                  0 && (
                  <p className="text-sm text-muted-foreground italic">
                    Belum ada riwayat penawaran lainnya.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Form>
  );
}

interface OfferingAuditCardProps {
  offering: Offering;
  isActive?: boolean;
  onDelete?: () => void;
}

function OfferingAuditCard({
  offering,
  isActive = false,
  onDelete,
}: OfferingAuditCardProps) {
  const formatDate = (ts: any) => {
    if (!ts) return "-";
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return format(date, "dd MMM yyyy, HH:mm", { locale: idLocale });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return (
          <Badge variant="outline" className="bg-gray-100">
            Draft
          </Badge>
        );
      case "sent":
        return (
          <Badge
            variant="outline"
            className="bg-blue-100 text-blue-700 border-blue-200"
          >
            Dikirim
          </Badge>
        );
      case "viewed":
        return (
          <Badge
            variant="outline"
            className="bg-yellow-100 text-yellow-700 border-yellow-200"
          >
            Dilihat
          </Badge>
        );
      case "accepted":
        return (
          <Badge
            variant="outline"
            className="bg-green-100 text-green-700 border-green-200"
          >
            Diterima
          </Badge>
        );
      case "rejected":
        return (
          <Badge
            variant="outline"
            className="bg-red-100 text-red-700 border-red-200"
          >
            Ditolak
          </Badge>
        );
      case "withdrawn":
        return (
          <Badge
            variant="outline"
            className="bg-orange-100 text-orange-700 border-orange-200"
          >
            Ditarik
          </Badge>
        );
      case "expired":
        return (
          <Badge variant="outline" className="bg-gray-200 text-gray-700">
            Kedaluwarsa
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Card
      className={cn(
        "overflow-hidden transition-all border-l-4",
        isActive
          ? "border-l-green-500 shadow-sm"
          : "border-l-muted opacity-80 grayscale-[0.3]",
      )}
    >
      <CardHeader className="py-3 px-4 bg-muted/20">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                {offering.documentName || "Penawaran Kerja"}
                {getStatusBadge(offering.status)}
              </CardTitle>
              <CardDescription className="text-xs truncate max-w-[200px]">
                ID: {offering.id}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs gap-1"
              onClick={() => openOfferingDocument({
                offeringId: offering.id,
                documentUrl: offering.documentUrl,
                documentPath: (offering as any).documentPath,
                documentName: offering.documentName,
              }).catch((e) => toast({ variant: "destructive", title: "Gagal Membuka", description: e.message }))}
            >
              <Eye className="h-3 w-3" />
              Lihat File
            </Button>

            {onDelete && !isActive && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3 w-3" />
                    Hapus
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Hapus Riwayat Offering?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Tindakan ini tidak dapat dibatalkan. Dokumen penawaran "
                      {offering.documentName}" akan dihapus secara permanen dari
                      sistem.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Batal</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={onDelete}
                      className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                    >
                      Hapus Permanen
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <TimelineInfo
            label="Dibuat"
            value={formatDate(offering.createdAt)}
            icon={<Calendar className="h-3 w-3" />}
          />
          <TimelineInfo
            label="Dikirim"
            value={formatDate(offering.sentAt)}
            icon={<Send className="h-3 w-3" />}
          />
          <TimelineInfo
            label="Pertama Dibuka"
            value={formatDate(offering.viewedAtFirst)}
            icon={<Eye className="h-3 w-3" />}
          />
          <TimelineInfo
            label="Terakhir Dibuka"
            value={formatDate(offering.viewedAtLast)}
            icon={<Clock className="h-3 w-3" />}
          />

          <TimelineInfo
            label="Total Dibuka"
            value={offering.viewCount?.toString() || "0"}
            icon={<Eye className="h-3 w-3" />}
          />
          <TimelineInfo
            label="Respons"
            value={
              offering.respondedAt ? formatDate(offering.respondedAt) : "-"
            }
            subValue={
              offering.responseType === "accepted"
                ? "Diterima"
                : offering.responseType === "rejected"
                  ? "Ditolak"
                  : undefined
            }
            icon={<CheckCircle className="h-3 w-3" />}
          />
          {offering.withdrawnAt && (
            <TimelineInfo
              label="Ditarik"
              value={formatDate(offering.withdrawnAt)}
              icon={<XCircle className="h-3 w-3 text-red-500" />}
            />
          )}
          {offering.expiredAt && (
            <TimelineInfo
              label="Kedaluwarsa"
              value={formatDate(offering.expiredAt)}
              icon={<AlertCircle className="h-3 w-3" />}
            />
          )}
        </div>

        {offering.history && offering.history.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <h5 className="text-[10px] font-bold uppercase text-muted-foreground mb-2 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Timeline Audit
            </h5>
            <div className="flex flex-wrap gap-2">
              {offering.history.slice(0, 8).map((h, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1 text-[10px] bg-muted px-1.5 py-0.5 rounded border border-muted-foreground/10"
                  title={h.description}
                >
                  <span className="font-bold">
                    {format(
                      h.at.toDate ? h.at.toDate() : new Date(h.at as any),
                      "HH:mm",
                    )}
                  </span>
                  <span className="text-muted-foreground">{h.type}</span>
                </div>
              ))}
              {offering.history.length > 8 && (
                <span className="text-[10px] text-muted-foreground">
                  +{offering.history.length - 8} lainnya
                </span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TimelineInfo({
  label,
  value,
  subValue,
  icon,
}: {
  label: string;
  value: string;
  subValue?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase font-semibold text-muted-foreground flex items-center gap-1">
        {icon}
        {label}
      </p>
      <p className="text-xs font-medium leading-none">{value}</p>
      {subValue && (
        <Badge variant="secondary" className="text-[9px] h-4 py-0 px-1 mt-1">
          {subValue}
        </Badge>
      )}
    </div>
  );
}
