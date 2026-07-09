"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useForm, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save } from "lucide-react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { GoogleDatePicker } from "@/components/ui/google-date-picker";
import { useAuth } from "@/providers/auth-provider";
import {
  useFirestore,
  useCollection,
  useMemoFirebase,
  setDocumentNonBlocking,
  useDoc,
} from "@/firebase";
import {
  doc,
  serverTimestamp,
  Timestamp,
  writeBatch,
  query,
  collection,
  where,
} from "firebase/firestore";
import type {
  EmployeeMasterData,
  Brand,
  UserProfile,
  JobApplication,
  Job,
  Division,
  EmploymentStatus,
} from "@/lib/types";
import {
  EMPLOYMENT_TYPES,
  EMPLOYMENT_STAGES,
  ROLES,
  EMPLOYMENT_STATUSES,
} from "@/lib/types";
import { Separator } from "@/components/ui/separator";
import { useHrdScopedBrands, useHrdScopedCollection } from "@/hooks/useHrdScopedCollection";

const isDirectionLevel = (positionTitle?: string, role?: string) => {
  if (!positionTitle && !role) return false;
  const pos = (positionTitle || "").toLowerCase();
  const r = (role || "").toLowerCase();
  return (
    pos.includes("direksi") ||
    pos.includes("direktur") ||
    pos.includes("director") ||
    r.includes("direksi") ||
    r.includes("direktur") ||
    r.includes("director")
  );
};

const adminFormSchema = z.object({
  fullName: z.string().min(2, "Nama lengkap wajib diisi."),
  email: z.string().email(),
  role: z.enum(ROLES),
  employmentType: z.enum(EMPLOYMENT_TYPES),
  employmentStage: z.enum(EMPLOYMENT_STAGES).optional(),
  employmentStatus: z.enum(EMPLOYMENT_STATUSES).optional(),
  employeeNumber: z.string().optional(),
  positionTitle: z.string().min(3, "Jabatan wajib diisi."),
  division: z.string().optional(), // Optional for all levels
  brandId: z.string().optional(), // Optional for all levels
  joinDate: z.date().optional().nullable(),
  managerUid: z.string().optional().nullable(),
}).refine(
  (data) => {
    // For non-direction staff: brand is mandatory
    if (!isDirectionLevel(data.positionTitle, data.role)) {
      return !!data.brandId && data.brandId.length > 0;
    }
    return true;
  },
  {
    message: "Brand wajib dipilih untuk staff non-Direksi.",
    path: ["brandId"],
  }
);

type AdminFormValues = z.infer<typeof adminFormSchema>;

interface EmployeeAdminFormDialogProps {
  profile: EmployeeMasterData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function EmployeeAdminFormDialog({
  open,
  onOpenChange,
  profile,
  onSuccess,
}: EmployeeAdminFormDialogProps) {
  const { userProfile: hrdProfile } = useAuth();
  const firestore = useFirestore();
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const { data: user, isLoading: isLoadingUser } = useDoc<UserProfile>(
    useMemoFirebase(
      () => (profile ? doc(firestore, "users", profile.uid) : null),
      [firestore, profile],
    ),
  );

  const { data: brands, isLoading: isLoadingBrands } = useHrdScopedBrands();

  const form = useForm<AdminFormValues>({
    resolver: zodResolver(adminFormSchema),
    defaultValues: {
      fullName: "",
      email: "",
      role: "karyawan",
      employmentType: "karyawan",
      employmentStage: "probation",
      employmentStatus: "active",
      employeeNumber: "",
      positionTitle: "",
      division: "",
      brandId: "",
      joinDate: new Date(),
      managerUid: "",
    },
  });

  const selectedBrandId = form.watch("brandId");
  const selectedPositionTitle = form.watch("positionTitle");
  const isDirector = isDirectionLevel(selectedPositionTitle, user?.role);
  const supervisorConstraints = useMemo(
    () => [
      where("role", "in", ["manager", "karyawan"]),
      where("isActive", "==", true),
    ],
    [],
  );
  const managementConstraints = useMemo(
    () => [
      where("structuralLevel", "==", "management"),
      where("isActive", "==", true),
    ],
    [],
  );

  // Fetch supervisors: managers, management/directors, and super-admins
  // We'll filter and sort them based on their relevance to the employee's brand/division
  const { data: supervisors, isLoading: isLoadingSupervisors } =
    useHrdScopedCollection<UserProfile>("users", {
      constraints: supervisorConstraints,
    });

  // Also fetch all management-level users for scope matching
  const { data: managementUsers, isLoading: isLoadingManagement } =
    useHrdScopedCollection<UserProfile>("users", {
      constraints: managementConstraints,
    });

  const { data: divisions, isLoading: isLoadingDivisions } =
    useCollection<Division>(
      useMemoFirebase(
        () =>
          selectedBrandId
            ? query(
                collection(firestore, "brands", selectedBrandId, "divisions"),
                where("isActive", "==", true),
              )
            : null,
        [selectedBrandId, firestore],
      ),
    );

  // Build filtered and sorted supervisor list based on employee's brand/division
  const filterSupervisors = useMemo(() => {
    if (!supervisors || !managementUsers || !profile) return [];

    const employeeBrandId = profile.brandId;
    const employeeDivisionId = profile.division;
    const employeeUid = profile.uid;

    const supervisorsList: Array<{
      uid: string;
      fullName: string;
      role: string;
      source: "division_manager" | "management_scope_exact" | "management_scope_brand" | "super_admin";
      sourceLabel: string;
    }> = [];
    const seenUids = new Set<string>();

    // Priority 1: Division Managers from divisions
    if (divisions && employeeBrandId && employeeDivisionId) {
      const div = divisions.find((d) => d.id === employeeDivisionId);
      if (div?.managerId && div.managerId !== employeeUid) {
        const mgr = supervisors.find((s) => s.uid === div.managerId);
        if (mgr && mgr.isActive !== false) {
          supervisorsList.push({
            uid: mgr.uid,
            fullName: mgr.fullName,
            role: mgr.role || "manager",
            source: "division_manager",
            sourceLabel: "Manager Divisi",
          });
          seenUids.add(mgr.uid);
        }
      }
    }

    // Priority 2 & 3: Management users with matching scopes
    const managementCandidates = managementUsers.filter((m) => m.uid !== employeeUid && m.isActive !== false);

    // Check each management user's scopes
    for (const mgmt of managementCandidates) {
      if (seenUids.has(mgmt.uid)) continue;

      const scopes = mgmt.managementScopes || [];
      let matchType: "exact" | "brand" | null = null;

      for (const scope of scopes) {
        // Check exact division match
        if (scope.brandId === employeeBrandId &&
            scope.scopeType === "selected_divisions" &&
            scope.divisionIds?.includes(employeeDivisionId)) {
          matchType = "exact";
          break;
        }
        // Check brand-level scope (seluruh brand/perusahaan within brand)
        if (scope.brandId === employeeBrandId &&
            (scope.scopeType === "brand" || scope.scopeType === "all")) {
          matchType = "brand";
        }
      }

      if (matchType === "exact") {
        supervisorsList.push({
          uid: mgmt.uid,
          fullName: mgmt.fullName,
          role: mgmt.role || "director",
          source: "management_scope_exact",
          sourceLabel: "Direksi / Manajemen (Divisi)",
        });
        seenUids.add(mgmt.uid);
      } else if (matchType === "brand") {
        supervisorsList.push({
          uid: mgmt.uid,
          fullName: mgmt.fullName,
          role: mgmt.role || "director",
          source: "management_scope_brand",
          sourceLabel: "Direksi / Manajemen (Brand)",
        });
        seenUids.add(mgmt.uid);
      }
    }

    // Priority 4: Super Admin as fallback
    const superAdmin = supervisors.find(
      (s) => (s.role === "super-admin" || s.role === "super_admin") && s.uid !== employeeUid && s.isActive !== false
    );
    if (superAdmin) {
      supervisorsList.push({
        uid: superAdmin.uid,
        fullName: superAdmin.fullName,
        role: superAdmin.role,
        source: "super_admin",
        sourceLabel: "Super Admin",
      });
    }

    return supervisorsList;
  }, [supervisors, managementUsers, profile, divisions]);

  useEffect(() => {
    if (open) {
      if (profile) {
        form.reset({
          fullName: profile.fullName,
          email: profile.email,
          role: user?.role || "karyawan",
          employmentType:
            profile.employmentType || user?.employmentType || "karyawan",
          employmentStage: user?.employmentStage || "active",
          employmentStatus: profile.employmentStatus || "active",
          employeeNumber: profile.employeeNumber || "",
          positionTitle: profile.positionTitle || "",
          division: profile.division || "",
          brandId: profile.brandId || (user?.brandId as string) || "",
          joinDate: profile.joinDate?.toDate(),
          managerUid: profile.managerUid || "",
        });
      } else {
        // Reset for create mode
        form.reset({
          fullName: "",
          email: "",
          role: "karyawan",
          employmentType: "karyawan",
          employmentStage: "probation",
          employmentStatus: "probation",
          employeeNumber: "",
          positionTitle: "",
          division: "",
          brandId: "",
          joinDate: new Date(),
          managerUid: "",
        });
      }
    }
  }, [open, profile, user, form]);

  const onSubmit = async (values: AdminFormValues) => {
    if (!hrdProfile || !profile) return;
    setIsSaving(true);

    const batch = writeBatch(firestore);
    const employeeMasterRef = doc(firestore, "employees", profile.uid);
    const userRef = doc(firestore, "users", profile.uid);

    const supervisor = supervisors?.find((s) => s.uid === values.managerUid);
    const brand = brands?.find((b) => b.id === values.brandId);

    const employeePayload = {
      uid: profile.uid,
      fullName: values.fullName,
      email: values.email,
      employmentType: values.employmentType,
      employmentStatus: values.employmentStatus,
      employeeNumber: values.employeeNumber,
      positionTitle: values.positionTitle,
      division: values.division,
      brandId: values.brandId,
      brandName: brand?.name || "",
      startDate: values.joinDate ? Timestamp.fromDate(values.joinDate) : null,
      joinDate: values.joinDate ? Timestamp.fromDate(values.joinDate) : null,
      managerUid: supervisor?.uid || null,
      managerName: supervisor?.fullName || null,
      source: profile.source || "manual",
      updatedAt: serverTimestamp(),
      createdAt: profile?.createdAt || serverTimestamp(),
    };
    batch.set(employeeMasterRef, employeePayload, { merge: true });

    const userPayload = {
      fullName: values.fullName,
      role: values.role,
      employmentType: values.employmentType,
      employmentStage: values.employmentStage,
      brandId: values.brandId,
      division: values.division,
      positionTitle: values.positionTitle,
    };
    batch.update(userRef, userPayload);

    try {
      await batch.commit();
      toast({ title: "Data Karyawan Disimpan" });
      onSuccess();
      onOpenChange(false);
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Gagal Menyimpan Data",
        description: e.message,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white">
        <DialogHeader className="border-b border-slate-200 dark:border-slate-800 pb-4">
          <DialogTitle className="text-slate-950 dark:text-white">Edit Data Administrasi: {profile?.fullName}</DialogTitle>
          <DialogDescription className="text-slate-500 dark:text-slate-400">
            Ubah data kepegawaian dan administrasi untuk pengguna ini. Perubahan
            akan disimpan di master data karyawan.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            id="employee-admin-form"
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4 py-4 max-h-[70vh] overflow-y-auto px-1"
          >
            <h3 className="text-lg font-semibold border-b pb-2">
              Informasi Dasar
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="fullName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nama Lengkap</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input {...field} readOnly />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator className="my-6" />
            <h3 className="text-lg font-semibold border-b pb-2">
              Informasi Kepegawaian
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="employeeNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>NIK (Internal)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value || ""}
                        placeholder="Contoh: 202407001"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="positionTitle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Jabatan</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value || ""}
                        placeholder="Contoh: Staff Keuangan"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="joinDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Tanggal Bergabung</FormLabel>
                    <FormControl>
                      <GoogleDatePicker
                        value={field.value}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="employmentType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipe Karyawan</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {EMPLOYMENT_TYPES.map((t) => (
                          <SelectItem key={t} value={t} className="capitalize">
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="employmentStatus"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status Kerja</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {EMPLOYMENT_STATUSES.map((s) => (
                          <SelectItem key={s} value={s} className="capitalize">
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator className="my-6" />
            <h3 className="text-lg font-semibold border-b pb-2">
              Struktur & Penempatan
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {!isDirector && (
                <FormField
                  control={form.control}
                  name="brandId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Brand <span className="text-red-500">*</span></FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ""}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih brand" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {brands?.map((b) => (
                            <SelectItem key={b.id!} value={b.id!}>
                              {b.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              {isDirector && (
                <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 rounded-lg">
                  <p className="text-sm text-blue-800 dark:text-blue-300 font-medium">
                    <strong>Direksi</strong> tidak memerlukan penempatan Brand/Divisi
                  </p>
                </div>
              )}
              {!isDirector && (
                <FormField
                  control={form.control}
                  name="division"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Divisi</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value || ""}
                        disabled={!selectedBrandId || isLoadingDivisions}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih divisi" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {divisions?.map((d) => (
                            <SelectItem key={d.id!} value={d.name}>
                              {d.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <FormField
                control={form.control}
                name="managerUid"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-700 dark:text-slate-300">
                      Atasan Langsung
                      {!isDirector && <span className="text-red-500"> (opsional)</span>}
                    </FormLabel>
                    {!isDirector && filterSupervisors.length === 0 && (
                      <FormDescription className="text-amber-700 dark:text-amber-400 text-sm bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-lg px-3 py-2">
                        {divisions && divisions.length > 0
                          ? "Manager divisi belum tersedia. Anda dapat memilih Direksi/Manajemen yang menaungi brand/divisi ini."
                          : "Belum ada atasan yang sesuai. Atur Manager Divisi atau Direksi/Manajemen pada Organisasi Perusahaan terlebih dahulu."}
                      </FormDescription>
                    )}
                    {isDirector && (
                      <FormDescription className="text-blue-700 dark:text-blue-400 text-sm bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 rounded-lg px-3 py-2">
                        Untuk level Direksi, atasan langsung bersifat opsional.
                      </FormDescription>
                    )}
                    <Select
                      onValueChange={field.onChange}
                      value={field.value ?? undefined}
                      disabled={filterSupervisors.length === 0}
                    >
                      <FormControl>
                        <SelectTrigger className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white">
                          <SelectValue placeholder={filterSupervisors.length === 0 ? "Tidak ada opsi" : "Pilih atasan"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
                        {filterSupervisors.length > 0 && (
                          <>
                            {filterSupervisors.filter((s) => s.source === "division_manager").length > 0 && (
                              <SelectGroup>
                                <SelectLabel className="text-[10px] uppercase tracking-widest text-slate-400">Manager Divisi</SelectLabel>
                                {filterSupervisors
                                  .filter((s) => s.source === "division_manager")
                                  .map((s) => (
                                    <SelectItem key={s.uid} value={s.uid}>
                                      {s.fullName} — {s.sourceLabel}
                                    </SelectItem>
                                  ))}
                              </SelectGroup>
                            )}
                            {filterSupervisors.filter((s) => s.source === "management_scope_exact").length > 0 && (
                              <SelectGroup>
                                <SelectLabel className="text-[10px] uppercase tracking-widest text-slate-400">Direksi / Manajemen (Divisi ini)</SelectLabel>
                                {filterSupervisors
                                  .filter((s) => s.source === "management_scope_exact")
                                  .map((s) => (
                                    <SelectItem key={s.uid} value={s.uid}>
                                      {s.fullName} — {s.sourceLabel}
                                    </SelectItem>
                                  ))}
                              </SelectGroup>
                            )}
                            {filterSupervisors.filter((s) => s.source === "management_scope_brand").length > 0 && (
                              <SelectGroup>
                                <SelectLabel className="text-[10px] uppercase tracking-widest text-slate-400">Direksi / Manajemen (Brand)</SelectLabel>
                                {filterSupervisors
                                  .filter((s) => s.source === "management_scope_brand")
                                  .map((s) => (
                                    <SelectItem key={s.uid} value={s.uid}>
                                      {s.fullName} — {s.sourceLabel}
                                    </SelectItem>
                                  ))}
                              </SelectGroup>
                            )}
                            {filterSupervisors.filter((s) => s.source === "super_admin").length > 0 && (
                              <SelectGroup>
                                <SelectLabel className="text-[10px] uppercase tracking-widest text-slate-400">Fallback</SelectLabel>
                                {filterSupervisors
                                  .filter((s) => s.source === "super_admin")
                                  .map((s) => (
                                    <SelectItem key={s.uid} value={s.uid}>
                                      {s.fullName} — {s.sourceLabel}
                                    </SelectItem>
                                  ))}
                              </SelectGroup>
                            )}
                          </>
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </form>
        </Form>
        <DialogFooter className="pt-4 mt-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button type="submit" form="employee-admin-form" disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Simpan Data Karyawan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
