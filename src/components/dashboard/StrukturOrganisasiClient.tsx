"use client";

import { useMemo, useState, useEffect } from "react";
import {
  collection,
  query,
  where,
  doc,
  updateDoc,
  getDocs,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import {
  UserProfile,
  Brand,
  Division,
  StructuralLevel,
  ManagementScope,
} from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/providers/auth-provider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users,
  Network,
  ShieldCheck,
  Plus,
  Pencil,
  ChevronRight,
  Building2,
  UserCheck,
  AlertCircle,
  Info,
  Search,
  Loader2,
  Trash2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

export function StrukturOrganisasiClient() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const { userProfile } = useAuth();
  const [activeTab, setActiveTab] = useState("management");

  // Data fetching
  const usersRef = useMemoFirebase(
    () => collection(firestore, "users"),
    [firestore],
  );
  const { data: users, isLoading: isLoadingUsers } =
    useCollection<UserProfile>(usersRef);

  const brandsRef = useMemoFirebase(
    () => collection(firestore, "brands"),
    [firestore],
  );
  const { data: brands, isLoading: isLoadingBrands } =
    useCollection<Brand>(brandsRef);

  const isLoading = isLoadingUsers || isLoadingBrands;

  // Derived data
  const managementUsers = useMemo(
    () =>
      users?.filter(
        (u) =>
          u.structuralLevel === "management" ||
          (u.role === "manager" && !u.structuralLevel),
      ) || [],
    [users],
  );

  const divisionManagers = useMemo(
    () => users?.filter((u) => u.structuralLevel === "division_manager") || [],
    [users],
  );

  const staffUsers = useMemo(
    () =>
      users?.filter(
        (u) =>
          u.structuralLevel === "staff" ||
          (!u.structuralLevel && u.role === "karyawan"),
      ) || [],
    [users],
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-[400px]" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-[200px]" />
          <Skeleton className="h-[200px]" />
          <Skeleton className="h-[200px]" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground">
          Kelola hubungan kerja antar direktur/manajemen, manager divisi, staff,
          brand, divisi, dan atasan langsung.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 lg:w-[600px]">
          <TabsTrigger value="management" className="flex gap-2">
            <ShieldCheck className="h-4 w-4" />
            Direktur / Manajemen
          </TabsTrigger>
          <TabsTrigger value="division_manager" className="flex gap-2">
            <UserCheck className="h-4 w-4" />
            Manager Divisi
          </TabsTrigger>
          <TabsTrigger value="hierarchy" className="flex gap-2">
            <Network className="h-4 w-4" />
            Struktur Tim
          </TabsTrigger>
        </TabsList>

        <TabsContent value="management" className="space-y-4 pt-4">
          <div className="flex justify-end">
            <SyncRelationshipsButton
              users={users || []}
              brands={brands || []}
            />
          </div>
          <ManagementTab
            users={users || []}
            brands={brands || []}
            isSuperAdmin={userProfile?.role === "super-admin"}
          />
        </TabsContent>

        <TabsContent value="division_manager" className="space-y-4 pt-4">
          <div className="flex justify-end">
            <SyncRelationshipsButton
              users={users || []}
              brands={brands || []}
            />
          </div>
          <DivisionManagerTab
            users={users || []}
            brands={brands || []}
            managementUsers={managementUsers}
          />
        </TabsContent>

        <TabsContent value="hierarchy" className="space-y-4 pt-4">
          <div className="flex justify-end">
            <SyncRelationshipsButton
              users={users || []}
              brands={brands || []}
            />
          </div>
          <HierarchyTab users={users || []} brands={brands || []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// --- UTILITY: SYNC BUTTON ---
function SyncRelationshipsButton({
  users,
  brands,
}: {
  users: UserProfile[];
  brands: Brand[];
}) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    updated: number;
    skipped: number;
    problems: string[];
  } | null>(null);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      let updatedCount = 0;
      let skippedCount = 0;
      let problems: string[] = [];

      // Read all divisions to act as master organization
      const divisionsMaster = new Map<string, any>();
      for (const brand of brands) {
        const snap = await getDocs(
          query(
            collection(firestore, "brands", brand.id!, "divisions"),
            where("isActive", "==", true),
          ),
        );
        for (const d of snap.docs) {
          divisionsMaster.set(`${brand.id}_${d.id}`, d.data());
        }
      }

      // Iterate over all staff users
      const staffUsers = users.filter(
        (u) =>
          u.role === "karyawan" &&
          u.structuralLevel !== "management" &&
          u.structuralLevel !== "division_manager",
      );

      for (const staff of staffUsers) {
        const staffBrandId = Array.isArray(staff.brandId)
          ? staff.brandId[0]
          : staff.brandId;
        const staffDivisionId = staff.divisionId;

        if (!staffBrandId || !staffDivisionId) {
          skippedCount++;
          continue;
        }

        const masterDiv = divisionsMaster.get(
          `${staffBrandId}_${staffDivisionId}`,
        );
        if (!masterDiv) {
          skippedCount++;
          problems.push(
            `${staff.fullName} - Divisi tidak ditemukan di master data.`,
          );
          continue;
        }

        if (!masterDiv.managerId) {
          skippedCount++;
          problems.push(
            `${staff.fullName} - Divisinya belum memiliki Manager Divisi aktif.`,
          );
          continue;
        }

        if (masterDiv.managerId === staff.uid) {
          skippedCount++;
          problems.push(
            `${staff.fullName} - Terdaftar sebagai manager di master, tapi level akun staff.`,
          );
          continue;
        }

        const isCurrentlyCorrect =
          staff.directSupervisorUid === masterDiv.managerId &&
          (staff as any).directManagerId === masterDiv.managerId;

        if (!isCurrentlyCorrect) {
          const updateData = {
            directSupervisorUid: masterDiv.managerId,
            directSupervisorName: masterDiv.managerName,
            directManagerId: masterDiv.managerId,
            directManagerName: masterDiv.managerName,
            managerUid: masterDiv.managerId,
            managerName: masterDiv.managerName,
            hrdEmploymentInfo: {
              directSupervisorUid: masterDiv.managerId,
              directSupervisorName: masterDiv.managerName,
              directManagerId: masterDiv.managerId,
              directManagerName: masterDiv.managerName,
              managerUid: masterDiv.managerId,
              managerName: masterDiv.managerName,
              brandId: staffBrandId,
              divisionId: staffDivisionId,
              divisionName: masterDiv.name || masterDiv.divisionName || null,
            },
            updatedAt: serverTimestamp(),
          };

          await updateDoc(doc(firestore, "users", staff.uid), updateData);
          await setDoc(
            doc(firestore, "employee_profiles", staff.uid),
            updateData,
            { merge: true },
          );
          updatedCount++;
        } else {
          skippedCount++;
        }
      }

      // Iterate over all division managers
      const divisionManagers = users.filter(
        (u) =>
          u.role === "karyawan" && u.structuralLevel === "division_manager",
      );

      for (const manager of divisionManagers) {
        const managerBrandId = Array.isArray(manager.brandId)
          ? manager.brandId[0]
          : manager.brandId;
        const managerDivisionId = manager.divisionId;

        if (!managerBrandId || !managerDivisionId) {
          skippedCount++;
          problems.push(
            `${manager.fullName} - Brand/divisi manager belum lengkap.`,
          );
          continue;
        }

        const masterDiv = divisionsMaster.get(
          `${managerBrandId}_${managerDivisionId}`,
        );
        if (!masterDiv) {
          skippedCount++;
          problems.push(
            `${manager.fullName} - Divisi tidak ditemukan di master data.`,
          );
          continue;
        }

        if (!masterDiv.managerDirectSupervisorId) {
          skippedCount++;
          problems.push(
            `${manager.fullName} adalah Manager Divisi, tetapi Direktur/Manajemen belum diatur.`,
          );
          continue;
        }

        if (masterDiv.managerDirectSupervisorId === manager.uid) {
          skippedCount++;
          problems.push(
            `${manager.fullName} - Atasan langsung Manager Divisi tidak boleh mengarah ke diri sendiri.`,
          );
          continue;
        }

        const isCurrentlyCorrect =
          manager.directSupervisorUid === masterDiv.managerDirectSupervisorId &&
          (manager as any).directManagerId ===
            masterDiv.managerDirectSupervisorId;

        if (!isCurrentlyCorrect) {
          const updateData = {
            directSupervisorUid: masterDiv.managerDirectSupervisorId,
            directSupervisorName: masterDiv.managerDirectSupervisorName,
            directManagerId: masterDiv.managerDirectSupervisorId,
            directManagerName: masterDiv.managerDirectSupervisorName,
            managerUid: masterDiv.managerDirectSupervisorId,
            managerName: masterDiv.managerDirectSupervisorName,
            hrdEmploymentInfo: {
              directSupervisorUid: masterDiv.managerDirectSupervisorId,
              directSupervisorName: masterDiv.managerDirectSupervisorName,
              directManagerId: masterDiv.managerDirectSupervisorId,
              directManagerName: masterDiv.managerDirectSupervisorName,
              managerUid: masterDiv.managerDirectSupervisorId,
              managerName: masterDiv.managerDirectSupervisorName,
              brandId: managerBrandId,
              divisionId: managerDivisionId,
              divisionName: masterDiv.name || masterDiv.divisionName || null,
            },
            directManagerTitle: masterDiv.managerDirectSupervisorTitle || null,
            updatedAt: serverTimestamp(),
          };

          await updateDoc(
            doc(firestore, "users", manager.uid),
            updateData as any,
          );
          await setDoc(
            doc(firestore, "employee_profiles", manager.uid),
            updateData,
            { merge: true },
          );
          updatedCount++;
        } else {
          skippedCount++;
        }
      }

      setSyncResult({ updated: updatedCount, skipped: skippedCount, problems });
      toast({
        title: "Selesai",
        description: "Sinkronisasi selesai diproses.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Gagal",
        description: error.message,
      });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleSync}
        disabled={isSyncing}
        className="gap-2 rounded-xl border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        {isSyncing ? "Menyinkronkan..." : "Sinkronisasi Atasan Staff"}
      </Button>
      <Dialog
        open={!!syncResult}
        onOpenChange={(open) => !open && setSyncResult(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ringkasan Sinkronisasi</DialogTitle>
            <DialogDescription>
              Hasil sinkronisasi atasan langsung dari master Organisasi.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                <p className="text-3xl font-black text-emerald-500">
                  {syncResult?.updated}
                </p>
                <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest">
                  Berhasil Update
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                <p className="text-3xl font-black text-slate-700 dark:text-slate-300">
                  {syncResult?.skipped}
                </p>
                <p className="mt-1 text-xs uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  Dilewati / Benar
                </p>
              </div>
            </div>
            {syncResult?.problems && syncResult.problems.length > 0 && (
              <div className="space-y-2">
                <Label className="text-red-400 font-bold flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" /> Daftar Bermasalah
                </Label>
                <ScrollArea className="h-32 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 p-3">
                  <ul className="list-disc pl-4 space-y-1">
                    {syncResult.problems.map((prob, i) => (
                      <li key={i} className="text-xs text-slate-400">
                        {prob}
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// --- HELPER: HIERARCHY PREVIEW ---
function HierarchyPreview({
  selectedUser,
  selectedWorkRole,
  currentScopes,
  users,
}: {
  selectedUser: UserProfile | null;
  selectedWorkRole: string;
  currentScopes: ManagementScope[];
  users: UserProfile[];
}) {
  if (!selectedUser && currentScopes.length === 0) return null;

  return (
    <div className="mt-8 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-teal-900/50 dark:bg-slate-950">
      <div className="flex items-center gap-2 border-b border-slate-200 pb-4 text-sm font-bold uppercase tracking-wide text-slate-700 dark:border-slate-800 dark:text-white">
        <Network className="h-4 w-4 text-teal-500" />
        <h4>Preview Hirarki Baru</h4>
      </div>

      <div className="space-y-6">
        {/* Director Node */}
        <div className="mt-2 rounded-2xl border border-teal-200 bg-teal-50 p-4 dark:border-teal-900/60 dark:bg-teal-950/30">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500 text-sm font-bold text-white">
              {selectedUser?.fullName?.charAt(0) || "?"}
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-teal-700 dark:text-teal-300">
                {selectedWorkRole || "Jabatan Belum Dipilih"}
              </p>
              <h5 className="text-base font-semibold text-slate-950 dark:text-white">
                {selectedUser?.fullName || "User Belum Dipilih"}
              </h5>
            </div>
          </div>
        </div>

        {/* Scopes Mapping */}
        <div className="ml-5 mt-5 space-y-4 border-l border-slate-200 pl-5 dark:border-slate-700">
          {currentScopes.map((scope, sIdx) => {
            const managersInScope = users.filter(
              (u) =>
                u.structuralLevel === "division_manager" &&
                u.brandId === scope.brandId &&
                (scope.divisionIds.includes("all") ||
                  scope.divisionIds.includes(u.divisionId!)),
            );

            return (
              <div key={sIdx} className="space-y-3">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-slate-400" />
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {scope.brandName}
                  </span>
                  <Badge
                    variant="outline"
                    className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                  >
                    {scope.divisionIds.includes("all")
                      ? "Seluruh Divisi"
                      : scope.divisionNames.join(", ")}
                  </Badge>
                </div>

                <div className="space-y-3 pl-4">
                  {managersInScope.length > 0 ? (
                    managersInScope.map((dm) => {
                      const staffUnderDm = users.filter(
                        (u) =>
                          u.structuralLevel === "staff" &&
                          u.directSupervisorUid === dm.uid,
                      );

                      return (
                        <div key={dm.uid} className="space-y-2">
                          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                            <p className="text-xs font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-300">
                              {dm.divisionName || "Manager Divisi"}
                            </p>
                            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                              {dm.fullName}
                            </p>
                          </div>

                          {/* Staff Under Manager */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-6">
                            {staffUnderDm.length > 0 ? (
                              staffUnderDm.map((s) => (
                                <div
                                  key={s.uid}
                                  className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-900/50"
                                >
                                  <div className="flex h-5 w-5 items-center justify-center rounded bg-slate-200 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-500">
                                    {s.fullName.charAt(0)}
                                  </div>
                                  <span className="text-xs text-slate-700 dark:text-slate-400">
                                    {s.fullName}
                                  </span>
                                </div>
                              ))
                            ) : (
                              <p className="mt-2 text-xs italic text-slate-500 dark:text-slate-400">
                                Belum ada staff di bawah manager ini
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="mt-2 rounded border border-slate-200 bg-slate-50 p-2 text-xs italic text-slate-500 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
                      Tidak ditemukan Manager Divisi aktif dalam scope{" "}
                      {scope.brandName} ini.
                    </p>
                  )}
                </div>
              </div>
            );
          })}
          {currentScopes.length === 0 && (
            <p className="text-xs italic text-slate-500 dark:text-slate-400">
              Belum ada scope brand/divisi yang ditambahkan.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// --- TAB 1: MANAGEMENT ---
function ManagementTab({
  users,
  brands,
  isSuperAdmin,
}: {
  users: UserProfile[];
  brands: Brand[];
  isSuperAdmin: boolean;
}) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [selectedWorkRole, setSelectedWorkRole] = useState<string>("");
  const [selectedBrand, setSelectedBrand] = useState<string>("");
  const [selectedDivisions, setSelectedDivisions] = useState<string[]>([]);
  const [isBrandScope, setIsBrandScope] = useState(false);
  const [currentScopes, setCurrentScopes] = useState<ManagementScope[]>([]);

  // Dynamic divisions for current brand selection
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [isLoadingDivisions, setIsLoadingDivisions] = useState(false);

  useEffect(() => {
    const fetchDivisions = async () => {
      if (!selectedBrand || selectedBrand === "all") {
        setDivisions([]);
        setSelectedDivisions([]);
        setIsBrandScope(false);
        return;
      }
      setDivisions([]);
      setSelectedDivisions([]);
      setIsBrandScope(false);
      setIsLoadingDivisions(true);
      try {
        const divRef = collection(
          firestore,
          "brands",
          selectedBrand,
          "divisions",
        );
        const q = query(divRef, where("isActive", "==", true));
        const snap = await getDocs(q);
        const fetchedDivs = snap.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as Division,
        );
        setDivisions(fetchedDivs);
      } catch (err) {
        console.error("Error fetching divisions:", err);
      } finally {
        setIsLoadingDivisions(false);
      }
    };
    fetchDivisions();
  }, [selectedBrand, firestore]);

  const managementUsers = users.filter(
    (u) => u.structuralLevel === "management",
  );

  // Filter for users who can be managers (role === 'manager' and active)
  const potentialManagers = users.filter(
    (u) =>
      u.role === "manager" &&
      u.isActive !== false &&
      u.structuralLevel !== "management",
  );

  const WORK_ROLES = [
    "Director of Operational Environesia",
    "Director of Business Development Environesia",
    "Director of Corporate Services and Innovation Environesia",
  ];

  const handleEditScope = (user: UserProfile) => {
    setSelectedUser(user);
    setSelectedWorkRole(user.workRole || "");
    setCurrentScopes(user.managementScopes || []);
    setSelectedBrand("");
    setSelectedDivisions([]);
    setIsBrandScope(false);
    setIsDialogOpen(true);
  };

  const resetAddForm = () => {
    setSelectedUser(null);
    setSelectedWorkRole("");
    setSelectedBrand("");
    setSelectedDivisions([]);
    setIsBrandScope(false);
    setCurrentScopes([]);
  };

  const handleAddScope = () => {
    if (!selectedBrand) return;
    const brand = brands.find((b) => b.id === selectedBrand);
    if (!brand) return;

    // Check for duplicates
    if (currentScopes.some((s) => s.brandId === selectedBrand)) {
      toast({
        variant: "destructive",
        title: "Gagal",
        description:
          "Brand ini sudah ada dalam scope. Silakan hapus dulu jika ingin mengubah divisi.",
      });
      return;
    }

    const isAllBrands = selectedBrand === "all";
    const hasNoDivisions = selectedBrand !== "all" && divisions.length === 0;
    const isBrandLevel =
      isAllBrands ||
      isBrandScope ||
      hasNoDivisions ||
      selectedDivisions.length === 0;

    const finalDivisionIds = isBrandLevel ? ["all"] : selectedDivisions;
    const finalDivisionNames = isAllBrands
      ? ["Semua Brand / Perusahaan"]
      : isBrandLevel
        ? ["Seluruh Brand / Perusahaan"]
        : divisions
            .filter((d: Division) => selectedDivisions.includes(d.id!))
            .map((d: Division) => d.name);

    const newScope: ManagementScope = {
      brandId: selectedBrand,
      brandName:
        selectedBrand === "all" ? "Semua Brand" : brand?.name || "Unknown",
      divisionIds: finalDivisionIds,
      divisionNames: finalDivisionNames,
      divisionId: isBrandLevel ? null : selectedDivisions[0] || null,
      divisionName: isBrandLevel
        ? null
        : divisions.find((d) => d.id === selectedDivisions[0])?.name || null,
      isWholeBrandScope: isBrandLevel,
      scopeType: isAllBrands
        ? "multi_brand"
        : isBrandLevel
          ? "seluruh_brand"
          : "divisi_tertentu",
      scopeLabel: isAllBrands
        ? "Seluruh Brand"
        : isBrandLevel
          ? "Seluruh Brand / Unit"
          : "Divisi Tertentu",
    };

    setCurrentScopes([...currentScopes, newScope]);
    setSelectedBrand("");
    setSelectedDivisions([]);
  };

  const handleRemoveScope = (index: number) => {
    if (!window.confirm("Hapus scope kewenangan ini?")) return;
    setCurrentScopes(currentScopes.filter((_, i) => i !== index));
  };

  const handleSaveScopes = async () => {
    if (!selectedUser) return;
    try {
      const userRef = doc(firestore, "users", selectedUser.uid);
      const updateData = {
        managementScopes: currentScopes,
        managementRole: selectedWorkRole,
        workRole: selectedWorkRole,
        jobTitle: selectedWorkRole,
        positionTitle: selectedWorkRole,
        structuralLevel: "management",
        updatedAt: serverTimestamp(),
      };

      await updateDoc(userRef, updateData);

      // Derive primary brand/division from first scope for employee_profiles sync
      const primaryScope = currentScopes[0] || null;
      const empProfilePatch: Record<string, any> = {
        ...updateData,
        uid: selectedUser.uid,
        fullName: selectedUser.fullName,
        email: selectedUser.email || "",
        employmentStatus: "active",
        isEmployee: true,
        canRequestOvertime: false,
      };

      if (primaryScope) {
        const isAllBrands = primaryScope.scopeType === "all" || primaryScope.brandId === "all";
        const isSelectedDivisions = primaryScope.scopeType === "selected_divisions";

        if (!isAllBrands) {
          empProfilePatch.brandId = primaryScope.brandId;
          empProfilePatch.brandName = primaryScope.brandName;
        } else {
          empProfilePatch.brandId = null;
          empProfilePatch.brandName = "Semua Brand / Perusahaan";
        }

        if (isSelectedDivisions && (primaryScope.divisionIds?.length ?? 0) > 0 && primaryScope.divisionIds![0] !== "all") {
          empProfilePatch.divisionId = primaryScope.divisionIds![0];
          empProfilePatch.divisionName = primaryScope.divisionNames?.[0] || "Divisi";
        } else {
          empProfilePatch.divisionId = null;
          empProfilePatch.divisionName = isAllBrands ? "Semua Brand / Perusahaan" : "Seluruh Brand / Perusahaan";
        }
      }

      const empRef = doc(firestore, "employee_profiles", selectedUser.uid);
      await setDoc(empRef, empProfilePatch, { merge: true });

      toast({
        title: "Berhasil",
        description: "Data manajemen dan profil karyawan telah diperbarui.",
      });
      setIsDialogOpen(false);
      setIsAddDialogOpen(false);
      resetAddForm();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Gagal",
        description: error.message,
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="mb-5 flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-950 dark:text-white">
            <ShieldCheck className="h-5 w-5 text-teal-500" />
            Daftar Direktur & Manajemen
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Kelola pejabat struktural tingkat manajemen dan area kewenangannya.
          </p>
        </div>
        {isSuperAdmin && (
          <Dialog
            open={isAddDialogOpen}
            onOpenChange={(open) => {
              setIsAddDialogOpen(open);
              if (!open) resetAddForm();
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2 rounded-xl bg-teal-500 px-4 text-sm font-semibold text-white shadow-sm hover:bg-teal-600">
                <Plus className="h-4 w-4" />
                Tetapkan Management Baru
              </Button>
            </DialogTrigger>
            <DialogContent className="flex max-h-[90vh] max-w-5xl flex-col overflow-hidden border-slate-200 bg-white p-0 shadow-xl dark:border-slate-800 dark:bg-slate-950">
              <DialogHeader className="sticky top-0 z-10 border-b border-slate-200 bg-white px-8 py-6 dark:border-slate-800 dark:bg-slate-950">
                <DialogTitle className="text-2xl font-bold text-slate-950 dark:text-white">
                  Tetapkan Level Management
                </DialogTitle>
                <DialogDescription className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Pilih user manager dan tentukan scope kewenangannya secara
                  mendetail.
                </DialogDescription>
              </DialogHeader>

              <div className="flex-1 overflow-y-auto bg-white px-8 py-8 custom-scrollbar dark:bg-slate-950">
                <div className="space-y-12 pb-12">
                  {/* Section 1 & 2 */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div className="space-y-4">
                      <Label className="mb-1 flex items-center gap-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-teal-500 text-sm font-bold text-white">
                          1
                        </div>
                        Pilih User Manager
                      </Label>
                      <Select
                        value={selectedUser?.uid || ""}
                        onValueChange={(uid) =>
                          setSelectedUser(
                            users.find((u) => u.uid === uid) || null,
                          )
                        }
                      >
                        <SelectTrigger className="h-12 border-slate-200 bg-white text-sm text-slate-900 focus:border-teal-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                          <SelectValue placeholder="Cari user dengan role manager..." />
                        </SelectTrigger>
                        <SelectContent>
                          {potentialManagers.map((u) => (
                            <SelectItem key={u.uid} value={u.uid}>
                              <div className="flex flex-col py-1">
                                <span className="font-bold text-base">
                                  {u.fullName}
                                </span>
                                <span className="text-xs opacity-60">
                                  {u.email}
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-slate-500 italic px-1">
                        Hanya menampilkan user dengan role sistem "Manager" yang
                        berstatus aktif.
                      </p>
                    </div>

                    <div className="space-y-4">
                      <Label className="mb-1 flex items-center gap-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-teal-500 text-sm font-bold text-white">
                          2
                        </div>
                        Jabatan Manajemen / Work Role
                      </Label>
                      <Select
                        value={selectedWorkRole}
                        onValueChange={setSelectedWorkRole}
                      >
                        <SelectTrigger className="h-12 border-slate-200 bg-white text-sm text-slate-900 focus:border-teal-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                          <SelectValue placeholder="Pilih jabatan resmi..." />
                        </SelectTrigger>
                        <SelectContent>
                          {WORK_ROLES.map((role) => (
                            <SelectItem key={role} value={role}>
                              {role}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Separator className="bg-slate-200 dark:bg-slate-800" />

                  {/* Section 3 */}
                  <div className="space-y-8">
                    <div className="flex items-center justify-between">
                      <Label className="mb-1 flex items-center gap-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-teal-500 text-sm font-bold text-white">
                          3
                        </div>
                        Scope Kewenangan Direktur
                      </Label>
                      <Badge
                        variant="outline"
                        className="border-teal-200 bg-teal-50 px-3 py-1 font-semibold text-teal-700 dark:border-teal-900/50 dark:bg-teal-950/30 dark:text-teal-300"
                      >
                        {currentScopes.length} Scope Ditambahkan
                      </Badge>
                    </div>

                    <div className="flex gap-4 items-start rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 dark:border-blue-900/50 dark:bg-blue-950/30">
                      <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5 dark:text-blue-400" />
                      <div className="space-y-1">
                        <p className="text-sm font-semibold leading-relaxed text-blue-800 dark:text-blue-200">
                          Info Scope Kewenangan
                        </p>
                        <p className="text-xs leading-relaxed text-blue-700/80 dark:text-blue-300/70">
                          Direktur dapat membawahi seluruh brand ini secara
                          default. Pilih divisi hanya jika kewenangan ingin
                          dibatasi ke unit kerja tertentu saja.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
                      {/* Scope Picker */}
                      <div className="lg:col-span-5 space-y-5 rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900">
                        <div className="space-y-3">
                          <Label className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                            Pilih Brand / Perusahaan
                          </Label>
                          <Select
                            value={selectedBrand}
                            onValueChange={setSelectedBrand}
                          >
                            <SelectTrigger className="h-11 border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
                              <SelectValue placeholder="Pilih Brand" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Semua Brand</SelectItem>
                              {brands.map((b) => (
                                <SelectItem key={b.id} value={b.id!}>
                                  {b.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-3">
                          <Label className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                            Pilih Divisi
                          </Label>
                          <ScrollArea className="h-56 rounded-2xl border border-slate-200 bg-white p-4 shadow-inner dark:border-slate-700 dark:bg-slate-950/50">
                            <div className="space-y-3">
                              {isLoadingDivisions ? (
                                <div className="flex flex-col items-center justify-center h-40 gap-3">
                                  <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
                                  <p className="text-xs text-slate-500">
                                    Memuat divisi...
                                  </p>
                                </div>
                              ) : selectedBrand === "all" ? (
                                <div className="p-6 text-center">
                                  <Badge className="rounded-full bg-teal-100 px-4 py-1.5 font-semibold text-teal-700 dark:bg-teal-900/50 dark:text-teal-200">
                                    Akses Seluruh Brand & Divisi
                                  </Badge>
                                  <p className="text-[10px] text-slate-500 mt-3 italic leading-relaxed">
                                    User ini akan memiliki akses manajemen penuh
                                    ke semua unit bisnis yang terdaftar.
                                  </p>
                                </div>
                              ) : divisions.length > 0 ? (
                                <>
                                  <div className="mb-3 flex items-center space-x-3 border-b border-slate-200 pb-3 dark:border-slate-700">
                                    <Checkbox
                                      id="add-brand-scope"
                                      className="h-5 w-5 border-teal-400/50 data-[state=checked]:bg-teal-500 dark:border-teal-500/50"
                                      checked={isBrandScope}
                                      onCheckedChange={(checked) => {
                                        const enabled = Boolean(checked);
                                        setIsBrandScope(enabled);
                                        if (enabled) setSelectedDivisions([]);
                                      }}
                                    />
                                    <label
                                      htmlFor="add-brand-scope"
                                      className="cursor-pointer text-sm font-semibold leading-none text-teal-600 dark:text-teal-400"
                                    >
                                      Seluruh Brand / Perusahaan
                                    </label>
                                  </div>
                                  {divisions.map((div: Division) => (
                                    <div
                                      key={div.id}
                                      className="flex items-center space-x-3 rounded-lg px-1 py-2 transition-colors hover:bg-slate-100 dark:hover:bg-slate-900/50"
                                    >
                                      <Checkbox
                                        id={`add-div-${div.id}`}
                                        className="h-5 w-5 border-slate-300 data-[state=checked]:bg-teal-500 dark:border-slate-700"
                                        checked={selectedDivisions.includes(
                                          div.id!,
                                        )}
                                        onCheckedChange={(checked) => {
                                          setIsBrandScope(false);
                                          if (checked)
                                            setSelectedDivisions([
                                              ...selectedDivisions,
                                              div.id!,
                                            ]);
                                          else
                                            setSelectedDivisions(
                                              selectedDivisions.filter(
                                                (id) => id !== div.id,
                                              ),
                                            );
                                        }}
                                      />
                                      <label
                                        htmlFor={`add-div-${div.id}`}
                                        className="cursor-pointer text-sm leading-none text-slate-700 dark:text-slate-300"
                                      >
                                        {div.name}
                                      </label>
                                    </div>
                                  ))}
                                </>
                              ) : selectedBrand ? (
                                <div className="flex flex-col items-center justify-center h-40 p-4 text-center">
                                  <Info className="h-8 w-8 text-slate-600 mb-2" />
                                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">
                                    Brand Tanpa Divisi
                                  </p>
                                  <p className="text-[10px] text-slate-600 italic leading-relaxed">
                                    Brand ini belum memiliki divisi. Scope tetap
                                    bisa ditambahkan untuk seluruh brand.
                                  </p>
                                </div>
                              ) : selectedBrand ? (
                                <div className="flex flex-col items-center justify-center h-40 p-4 text-center">
                                  <Info className="h-8 w-8 text-slate-600 mb-2" />
                                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">
                                    Brand Tanpa Divisi
                                  </p>
                                  <p className="text-[10px] text-slate-600 italic leading-relaxed">
                                    Brand ini belum memiliki divisi. Scope akan
                                    berlaku untuk seluruh brand.
                                  </p>
                                </div>
                              ) : (
                                <div className="flex flex-col items-center justify-center h-40 p-4 text-center">
                                  <Info className="h-8 w-8 text-slate-600 mb-2" />
                                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">
                                    Brand Tanpa Divisi
                                  </p>
                                  <p className="text-[10px] text-slate-600 italic leading-relaxed">
                                    Brand ini belum memiliki divisi. Scope akan
                                    berlaku untuk seluruh brand.
                                  </p>
                                </div>
                              )}
                            </div>
                          </ScrollArea>
                        </div>

                        <Button
                          size="lg"
                          className="h-12 w-full gap-2 rounded-xl bg-teal-500 font-semibold hover:bg-teal-600"
                          onClick={handleAddScope}
                          disabled={!selectedBrand}
                        >
                          <Plus className="h-5 w-5 mr-3" />
                          Tambahkan Scope
                        </Button>
                      </div>

                      {/* Selected Scopes List */}
                      <div className="lg:col-span-7 space-y-4">
                        <Label className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                          Daftar Scope Ditambahkan:
                        </Label>
                        <div className="grid grid-cols-1 gap-4 max-h-[500px] overflow-y-auto pr-3 custom-scrollbar">
                          {currentScopes.map((scope, idx) => (
                            <div
                              key={idx}
                              className="group relative flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-teal-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-teal-500/50"
                            >
                              <div className="flex justify-between items-start mb-3">
                                <div className="flex items-center gap-3">
                                  <div className="rounded-lg bg-teal-50 p-2 dark:bg-teal-900/30">
                                    <Building2 className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                                  </div>
                                  <span className="text-base font-semibold text-slate-900 dark:text-white">
                                    {scope.brandName}
                                  </span>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-10 w-10 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 dark:text-slate-500 dark:hover:bg-red-950/30 dark:hover:text-red-300"
                                  onClick={() => handleRemoveScope(idx)}
                                >
                                  <Trash2 className="h-5 w-5" />
                                </Button>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {scope.divisionIds.includes("all") ? (
                                  <Badge className="rounded-full bg-teal-100 px-3 py-1 text-xs font-semibold text-teal-700 dark:bg-teal-900/50 dark:text-teal-200">
                                    Seluruh Brand / Perusahaan
                                  </Badge>
                                ) : (
                                  <div className="flex flex-wrap gap-2 items-center">
                                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                                      Divisi:
                                    </span>
                                    {scope.divisionNames.map((dn, i) => (
                                      <Badge
                                        key={i}
                                        variant="secondary"
                                        className="border-slate-200 bg-slate-100 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                      >
                                        {dn}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                          {currentScopes.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-dashed border-slate-200 text-slate-400 dark:border-slate-700 dark:text-slate-500">
                              <Network className="h-10 w-10 mb-3" />
                              <p className="text-sm font-semibold uppercase tracking-widest">
                                Belum Ada Scope
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Hierarchy Preview */}
                  <HierarchyPreview
                    selectedUser={selectedUser}
                    selectedWorkRole={selectedWorkRole}
                    currentScopes={currentScopes}
                    users={users}
                  />
                </div>
              </div>

              <DialogFooter className="sticky bottom-0 z-10 border-t border-slate-200 bg-white px-8 py-5 dark:border-slate-800 dark:bg-slate-950">
                <Button
                  variant="outline"
                  size="lg"
                  className="h-12 border-slate-200 bg-white px-8 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  onClick={() => setIsAddDialogOpen(false)}
                >
                  Batal
                </Button>
                <Button
                  size="lg"
                  className="h-12 px-10 bg-teal-500 font-semibold hover:bg-teal-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
                  onClick={handleSaveScopes}
                  disabled={
                    !selectedUser ||
                    !selectedWorkRole ||
                    currentScopes.length === 0
                  }
                >
                  <ShieldCheck className="h-6 w-6 mr-3" />
                  Tetapkan Direktur Baru
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4">
        {managementUsers.map((user) => (
          <div
            key={user.uid}
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
              <div className="flex-1">
                <p className="text-base font-semibold text-slate-950 dark:text-white">
                  {user.fullName}
                </p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {user.workRole || "Direktur / Manajemen"}
                </p>
                <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  Scope Manajemen
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  {user.managementScopes && user.managementScopes.length > 0 ? (
                    user.managementScopes.map((scope, idx) => (
                      <div
                        key={idx}
                        className="inline-flex min-w-[220px] gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 dark:border-teal-900/60 dark:bg-teal-950/40"
                      >
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-teal-500" />
                        <div>
                          <p className="text-sm font-medium text-teal-700 dark:text-teal-300">
                            {scope.brandName}
                          </p>
                          <p className="mt-1 text-xs text-teal-600/80 dark:text-teal-300/70">
                            {scope.divisionIds.includes("all")
                              ? "Seluruh Brand / Perusahaan"
                              : scope.divisionNames.join(", ")}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="rounded-xl border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                      Belum ada scope manajemen
                    </p>
                  )}
                </div>
              </div>
              {isSuperAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleEditScope(user)}
                  className="shrink-0 gap-2 rounded-xl border-slate-200 bg-white text-slate-700 shadow-sm hover:border-teal-300 hover:text-teal-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-teal-600 dark:hover:text-teal-300"
                >
                  <Pencil className="h-3 w-3" />
                  Atur Scope
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Scope Dialog (Edit) */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="flex max-h-[90vh] max-w-5xl flex-col overflow-hidden border-slate-200 bg-white p-0 shadow-xl dark:border-slate-800 dark:bg-slate-950">
          <DialogHeader className="sticky top-0 z-10 border-b border-slate-200 bg-white px-8 py-6 dark:border-slate-800 dark:bg-slate-950">
            <DialogTitle className="text-2xl font-bold text-slate-950 dark:text-white">
              Pengaturan Management: {selectedUser?.fullName}
            </DialogTitle>
            <DialogDescription className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Perbarui jabatan dan scope kewenangan secara mendetail.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto bg-white px-8 py-8 custom-scrollbar dark:bg-slate-950">
            <div className="space-y-12 pb-12">
              <div className="space-y-4">
                <Label className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Jabatan Manajemen / Work Role
                </Label>
                <Select
                  value={selectedWorkRole}
                  onValueChange={setSelectedWorkRole}
                >
                  <SelectTrigger className="h-12 border-slate-200 bg-white text-sm text-slate-900 focus:border-teal-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                    <SelectValue placeholder="Pilih jabatan resmi..." />
                  </SelectTrigger>
                  <SelectContent>
                    {WORK_ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Separator className="bg-slate-200 dark:bg-slate-800" />

              <div className="space-y-8">
                <div className="flex items-center justify-between">
                  <Label className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Scope Kewenangan Direktur
                  </Label>
                  <Badge
                    variant="outline"
                    className="border-teal-200 bg-teal-50 px-3 py-1 font-semibold text-teal-700 dark:border-teal-900/50 dark:bg-teal-950/30 dark:text-teal-300"
                  >
                    {currentScopes.length} Scope Aktif
                  </Badge>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
                  {/* Scope Picker */}
                  <div className="lg:col-span-5 space-y-5 rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900">
                    <div className="space-y-3">
                      <Label className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                        Pilih Brand / Perusahaan
                      </Label>
                      <Select
                        value={selectedBrand}
                        onValueChange={setSelectedBrand}
                      >
                        <SelectTrigger className="h-11 border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
                          <SelectValue placeholder="Pilih Brand" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Semua Brand</SelectItem>
                          {brands.map((b) => (
                            <SelectItem key={b.id} value={b.id!}>
                              {b.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-3">
                      <Label className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                        Pilih Divisi
                      </Label>
                      <ScrollArea className="h-56 rounded-2xl border border-slate-200 bg-white p-4 shadow-inner dark:border-slate-700 dark:bg-slate-950/50">
                        <div className="space-y-3">
                          {isLoadingDivisions ? (
                            <div className="flex flex-col items-center justify-center h-40 gap-3">
                              <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
                              <p className="text-xs text-slate-500">
                                Memuat divisi...
                              </p>
                            </div>
                          ) : selectedBrand === "all" ? (
                            <div className="p-6 text-center">
                              <Badge className="rounded-full bg-teal-100 px-4 py-1.5 font-semibold text-teal-700 dark:bg-teal-900/50 dark:text-teal-200">
                                Otomatis Semua Divisi
                              </Badge>
                            </div>
                          ) : divisions.length > 0 ? (
                            <>
                              <div className="mb-3 flex items-center space-x-3 border-b border-slate-200 pb-3 dark:border-slate-700">
                                <Checkbox
                                  id="edit-brand-scope"
                                  className="h-5 w-5 border-teal-400/50 data-[state=checked]:bg-teal-500 dark:border-teal-500/50"
                                  checked={isBrandScope}
                                  onCheckedChange={(checked) => {
                                    const enabled = Boolean(checked);
                                    setIsBrandScope(enabled);
                                    if (enabled) setSelectedDivisions([]);
                                  }}
                                />
                                <label
                                  htmlFor="edit-brand-scope"
                                  className="cursor-pointer text-sm font-semibold leading-none text-teal-600 dark:text-teal-400"
                                >
                                  Seluruh Brand / Perusahaan
                                </label>
                              </div>
                              {divisions.map((div: Division) => (
                                <div
                                  key={div.id}
                                  className="flex items-center space-x-3 rounded-lg px-1 py-2 transition-colors hover:bg-slate-100 dark:hover:bg-slate-900/50"
                                >
                                  <Checkbox
                                    id={`edit-div-${div.id}`}
                                    className="h-5 w-5 border-slate-300 data-[state=checked]:bg-teal-500 dark:border-slate-700"
                                    checked={selectedDivisions.includes(
                                      div.id!,
                                    )}
                                    onCheckedChange={(checked) => {
                                      setIsBrandScope(false);
                                      if (checked)
                                        setSelectedDivisions([
                                          ...selectedDivisions,
                                          div.id!,
                                        ]);
                                      else
                                        setSelectedDivisions(
                                          selectedDivisions.filter(
                                            (id: string) => id !== div.id,
                                          ),
                                        );
                                    }}
                                  />
                                  <label
                                    htmlFor={`edit-div-${div.id}`}
                                    className="cursor-pointer text-sm leading-none text-slate-700 dark:text-slate-300"
                                  >
                                    {div.name}
                                  </label>
                                </div>
                              ))}
                            </>
                          ) : (
                            <div className="flex flex-col items-center justify-center h-40 opacity-40">
                              <Search className="h-10 w-10 mb-3" />
                              <p className="text-xs font-bold uppercase tracking-widest">
                                Pilih brand
                              </p>
                            </div>
                          )}
                        </div>
                      </ScrollArea>
                    </div>

                    <Button
                      size="lg"
                      className="h-12 w-full gap-2 rounded-xl bg-teal-500 font-semibold hover:bg-teal-600"
                      onClick={handleAddScope}
                      disabled={
                        !selectedBrand ||
                        (selectedBrand !== "all" &&
                          divisions.length > 0 &&
                          !isBrandScope &&
                          selectedDivisions.length === 0)
                      }
                    >
                      <Plus className="h-5 w-5 mr-3" />
                      Perbarui Scope
                    </Button>
                  </div>

                  {/* Selected Scopes List */}
                  <div className="lg:col-span-7 space-y-4">
                    <Label className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                      Scope Terpilih:
                    </Label>
                    <div className="grid grid-cols-1 gap-4 max-h-[500px] overflow-y-auto pr-3 custom-scrollbar">
                      {currentScopes.length > 0 ? (
                        currentScopes.map((scope, idx) => {
                          return (
                            <div
                              key={idx}
                              className="group relative flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-teal-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-teal-500/50"
                            >
                              <div className="flex justify-between items-start mb-3">
                                <div className="flex items-center gap-3">
                                  <div className="rounded-lg bg-teal-50 p-2 dark:bg-teal-900/30">
                                    <Building2 className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                                  </div>
                                  <span className="text-base font-semibold text-slate-900 dark:text-white">
                                    {scope.brandName}
                                  </span>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="gap-1 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-red-50 hover:text-red-600 dark:text-slate-500 dark:hover:bg-red-950/30 dark:hover:text-red-300"
                                  onClick={() => handleRemoveScope(idx)}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Hapus Scope
                                </Button>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {scope.divisionIds.includes("all") ? (
                                  <Badge className="rounded-full bg-teal-100 px-3 py-1 text-xs font-semibold text-teal-700 dark:bg-teal-900/50 dark:text-teal-200">
                                    Seluruh Unit Kerja / Divisi
                                  </Badge>
                                ) : (
                                  scope.divisionNames.map((dn, i) => (
                                    <Badge
                                      key={i}
                                      variant="secondary"
                                      className="border-slate-200 bg-slate-100 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                    >
                                      {dn}
                                    </Badge>
                                  ))
                                )}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="w-full rounded-xl border border-dashed border-slate-200 p-6 text-center dark:border-slate-700">
                          <p className="text-sm italic text-slate-400 dark:text-slate-500">Belum ada scope aktif.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Hierarchy Preview */}
              <HierarchyPreview
                selectedUser={selectedUser}
                selectedWorkRole={selectedWorkRole}
                currentScopes={currentScopes}
                users={users}
              />
            </div>
          </div>

          <DialogFooter className="sticky bottom-0 z-10 border-t border-slate-200 bg-white px-8 py-5 dark:border-slate-800 dark:bg-slate-950">
            <Button
              variant="outline"
              size="lg"
              className="h-12 border-slate-200 bg-white px-8 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              onClick={() => setIsDialogOpen(false)}
            >
              Batal
            </Button>
            <Button
              size="lg"
              className="h-12 px-10 bg-teal-500 font-semibold hover:bg-teal-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
              onClick={handleSaveScopes}
              disabled={
                !selectedUser || !selectedWorkRole || currentScopes.length === 0
              }
            >
              <ShieldCheck className="h-6 w-6 mr-3" />
              Simpan Perubahan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// --- TAB 2: DIVISION MANAGER ---
function DivisionManagerTab({
  users,
  brands,
  managementUsers,
}: {
  users: UserProfile[];
  brands: Brand[];
  managementUsers: UserProfile[];
}) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [selectedBrand, setSelectedBrand] = useState<string>("");
  const [selectedDivision, setSelectedDivision] = useState<string>("");
  const [isPlacementOpen, setIsPlacementOpen] = useState(false);
  // Filter only active employees (role == 'karyawan')
  const activeEmployees = useMemo(() => {
    return users.filter((u) => {
      // Role must be 'karyawan'
      if (u.role !== "karyawan") return false;

      // Level must NOT be management (Director already set)
      if (u.structuralLevel === "management") return false;

      // Status checks (robust check for multiple field possibilities)
      const isStatusActive =
        u.isActive === true ||
        (u as any).status?.toLowerCase() === "active" ||
        (u as any).status?.toLowerCase() === "aktif" ||
        (u as any).employmentStatus?.toLowerCase() === "active" ||
        (u as any).employmentStatus?.toLowerCase() === "aktif" ||
        (u as any).employeeStatus?.toLowerCase() === "active";

      return isStatusActive;
    });
  }, [users]);

  const [potentialDirectors, setPotentialDirectors] = useState<UserProfile[]>(
    [],
  );
  const [selectedDirectorUid, setSelectedDirectorUid] = useState<string>("");
  const [selectedManagerUid, setSelectedManagerUid] = useState<string>("");
  const [tempDivisions, setTempDivisions] = useState<Division[]>([]);

  const handleOpenPlacement = (
    brandId: string,
    divId: string,
    brandDivs: Division[],
  ) => {
    setSelectedBrand(brandId);
    setSelectedDivision(divId);
    setTempDivisions(brandDivs);

    // Find matching Management (Directors) for this brand/division
    const matches = managementUsers.filter((dir) =>
      dir.managementScopes?.some(
        (s) =>
          (s.brandId === brandId || s.brandId === "all") &&
          (s.divisionIds.includes(divId) || s.divisionIds.includes("all")),
      ),
    );

    setPotentialDirectors(matches);
    if (matches.length === 1) setSelectedDirectorUid(matches[0].uid);
    else setSelectedDirectorUid("");

    // Find current manager if any
    const current = users.find(
      (u) =>
        u.structuralLevel === "division_manager" &&
        u.brandId === brandId &&
        u.divisionId === divId,
    );
    setSelectedManagerUid(current?.uid || "");

    setIsPlacementOpen(true);
  };

  const handleSavePlacement = async () => {
    if (!selectedManagerUid || !selectedBrand || !selectedDivision) return;

    try {
      const manager = users.find((u) => u.uid === selectedManagerUid);
      const brand = brands.find((b) => b.id === selectedBrand);
      const division = tempDivisions.find((d) => d.id === selectedDivision);
      const director = potentialDirectors.find(
        (d) => d.uid === selectedDirectorUid,
      );

      if (!manager || !brand || !division) return;

      const oldManager = users.find(
        (u) =>
          u.structuralLevel === "division_manager" &&
          u.brandId === selectedBrand &&
          u.divisionId === selectedDivision,
      );

      // 1. Update Master Organization (Division Doc)
      const divDocRef = doc(
        firestore,
        "brands",
        selectedBrand,
        "divisions",
        selectedDivision,
      );
      await setDoc(
        divDocRef,
        {
          managerId: manager.uid,
          managerName: manager.fullName,
          managerEmployeeId: (manager as any).employeeId || "",
          managerDirectSupervisorId: director?.uid || null,
          managerDirectSupervisorName: director?.fullName || null,
          managerDirectSupervisorTitle: director?.workRole || null,
          brandId: selectedBrand,
          divisionId: selectedDivision,
          divisionName: division.name,
        },
        { merge: true },
      );

      // 2. Clear old manager if different
      if (oldManager && oldManager.uid !== selectedManagerUid) {
        const oldResetData = {
          isDivisionManager: false,
          structuralLevel: "staff",
          structuralPosition: "staff",
          workRole: "Staff",
          updatedAt: serverTimestamp(),
        };
        await updateDoc(doc(firestore, "users", oldManager.uid), oldResetData);
        await setDoc(
          doc(firestore, "employee_profiles", oldManager.uid),
          oldResetData,
          { merge: true },
        );
      }

      // 3. Set new manager
      const updateData = {
        structuralLevel: "division_manager",
        structuralPosition: "division_manager",
        isDivisionManager: true,
        brandId: selectedBrand,
        brandName: brand.name,
        divisionId: selectedDivision,
        divisionName: division.name,
        workRole: `Manager Divisi ${division.name}`,
        position: `Manager Divisi ${division.name}`,
        directSupervisorUid: director?.uid || null,
        directSupervisorName: director?.fullName || null,
        directManagerId: director?.uid || null,
        directManagerName: director?.fullName || null,
        directManagerTitle: director?.workRole || null,
        updatedAt: serverTimestamp(),
      };

      await updateDoc(
        doc(firestore, "users", selectedManagerUid),
        updateData as any,
      );
      // Also write comprehensive HRD employment info and manager fields
      await setDoc(
        doc(firestore, "employee_profiles", selectedManagerUid),
        {
          ...updateData,
          managerUid: manager.uid,
          managerName: manager.fullName,
          hrdEmploymentInfo: {
            brandId: selectedBrand,
            brandName: brand.name,
            divisionId: selectedDivision,
            divisionName: division.name,
            structuralLevel: "division_manager",
            structuralPosition: "division_manager",
            isDivisionManager: true,
            workRole: `Manager Divisi ${division.name}`,
            position: `Manager Divisi ${division.name}`,
            directSupervisorUid: director?.uid || null,
            directSupervisorName: director?.fullName || null,
            directManagerId: director?.uid || null,
            directManagerName: director?.fullName || null,
            managerUid: manager.uid,
            managerName: manager.fullName,
          },
        },
        { merge: true },
      );

      // Ensure users/{uid} also has nested hrdEmploymentInfo for consistency
      await updateDoc(doc(firestore, "users", selectedManagerUid), {
        hrdEmploymentInfo: {
          brandId: selectedBrand,
          brandName: brand.name,
          divisionId: selectedDivision,
          divisionName: division.name,
          structuralLevel: "division_manager",
          structuralPosition: "division_manager",
          isDivisionManager: true,
          workRole: `Manager Divisi ${division.name}`,
          position: `Manager Divisi ${division.name}`,
          directSupervisorUid: director?.uid || null,
          directSupervisorName: director?.fullName || null,
          directManagerId: director?.uid || null,
          directManagerName: director?.fullName || null,
          managerUid: manager.uid,
          managerName: manager.fullName,
        },
      });

      toast({
        title: "Berhasil",
        description: `Manager Divisi ${division.name} telah ditetapkan.`,
      });
      setIsPlacementOpen(false);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Gagal",
        description: error.message,
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600 dark:bg-teal-950/50 dark:text-teal-400">
          <UserCheck className="h-6 w-6" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-slate-950 dark:text-white">Penempatan Manager Divisi</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Tentukan penanggung jawab untuk setiap divisi di masing-masing
            brand.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {brands.map((brand) => (
          <BrandDivisionCard
            key={brand.id}
            brand={brand}
            users={users}
            onOpenPlacement={handleOpenPlacement}
          />
        ))}
      </div>

      {/* Placement Dialog */}
      <Dialog open={isPlacementOpen} onOpenChange={setIsPlacementOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pilih Manager Divisi</DialogTitle>
            <DialogDescription>
              Tentukan siapa yang akan menjabat sebagai Manager Divisi untuk
              unit ini.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label>User / Karyawan</Label>
              <Select
                value={selectedManagerUid}
                onValueChange={setSelectedManagerUid}
              >
                <SelectTrigger className="h-14 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-base text-slate-900 dark:text-white">
                  <SelectValue placeholder="Pilih karyawan aktif..." />
                </SelectTrigger>
                <SelectContent>
                  {activeEmployees.map((u) => (
                    <SelectItem key={u.uid} value={u.uid}>
                      <div className="flex flex-col py-1">
                        <span className="font-bold text-base">
                          {u.fullName} ({u.email})
                        </span>
                        {(u.brandName || u.divisionName) && (
                          <span className="text-[10px] text-slate-500 font-bold uppercase">
                            {u.brandName || "Tanpa Brand"} —{" "}
                            {u.divisionName || "Tanpa Divisi"}
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                  {activeEmployees.length === 0 && (
                    <div className="p-4 text-center text-xs text-slate-500 italic">
                      Tidak ada karyawan aktif yang tersedia.
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Atasan Langsung (Direktur/Manajemen)</Label>
              {potentialDirectors.length > 0 ? (
                <Select
                  value={selectedDirectorUid}
                  onValueChange={setSelectedDirectorUid}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih Direktur..." />
                  </SelectTrigger>
                  <SelectContent>
                    {potentialDirectors.map((d) => (
                      <SelectItem key={d.uid} value={d.uid}>
                        {d.fullName} ({d.workRole})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-amber-500 text-xs flex gap-2 items-center">
                  <AlertCircle className="h-4 w-4" />
                  Belum ada Direktur/Manajemen yang membawahi divisi ini.
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPlacementOpen(false)}>
              Batal
            </Button>
            <Button
              onClick={handleSavePlacement}
              disabled={!selectedManagerUid}
            >
              Simpan Penempatan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Sub-component for Brand Card in Tab 2
function BrandDivisionCard({
  brand,
  users,
  onOpenPlacement,
}: {
  brand: Brand;
  users: UserProfile[];
  onOpenPlacement: (
    brandId: string,
    divId: string,
    brandDivs: Division[],
  ) => void;
}) {
  const firestore = useFirestore();
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDivs = async () => {
      if (!brand.id) return;
      try {
        const q = query(
          collection(firestore, "brands", brand.id, "divisions"),
          where("isActive", "==", true),
        );
        const snap = await getDocs(q);
        setDivisions(
          snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Division),
        );
      } finally {
        setLoading(false);
      }
    };
    fetchDivs();
  }, [brand.id, firestore]);

  return (
    <Card className="h-fit border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <CardHeader className="bg-slate-50/50 pb-4 dark:bg-slate-900/50">
        <CardTitle className="text-md flex items-center gap-2">
          <Building2 className="h-4 w-4 text-teal-500" />
          {brand.name}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : divisions.length > 0 ? (
          divisions.map((div) => {
            const currentManager = users.find(
              (u) =>
                u.structuralLevel === "division_manager" &&
                u.brandId === brand.id &&
                u.divisionId === div.id,
            );

            return (
              <div
                key={div.id}
                className="flex flex-col gap-2 p-3 rounded-lg border border-slate-800 bg-slate-950/50"
              >
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold">{div.name}</span>
                  {!currentManager && (
                    <Badge
                      variant="outline"
                      className="text-[9px] text-amber-500 border-amber-500/30 bg-amber-500/5"
                    >
                      Kosong
                    </Badge>
                  )}
                </div>

                {currentManager ? (
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-500 text-xs">
                        {currentManager.fullName.charAt(0)}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">
                          {currentManager.fullName}
                        </span>
                        <span className="text-[10px] text-slate-500 truncate max-w-[120px]">
                          Supervisor:{" "}
                          {currentManager.directSupervisorName || "Belum Ada"}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() =>
                        onOpenPlacement(brand.id!, div.id!, divisions)
                      }
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs h-8"
                    onClick={() =>
                      onOpenPlacement(brand.id!, div.id!, divisions)
                    }
                  >
                    Pilih Manager
                  </Button>
                )}
              </div>
            );
          })
        ) : (
          <p className="text-xs text-slate-500 italic text-center p-4">
            Belum ada divisi di brand ini.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// --- TAB 3: HIERARCHY VIEW ---
function HierarchyTab({
  users,
  brands,
}: {
  users: UserProfile[];
  brands: Brand[];
}) {
  const managementUsers = users.filter(
    (u) => u.structuralLevel === "management",
  );
  const divisionManagers = users.filter(
    (u) => u.structuralLevel === "division_manager",
  );
  const staffUsers = users.filter(
    (u) =>
      u.structuralLevel === "staff" ||
      (!u.structuralLevel && u.role === "karyawan"),
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Network className="h-6 w-6 text-emerald-500" />
        <h3 className="text-xl font-bold">Hirarki Struktur Organisasi</h3>
      </div>

      <div className="space-y-12">
        {managementUsers.map((manager) => (
          <div key={manager.uid} className="space-y-6">
            {/* Management Node */}
            <div className="relative flex justify-center">
              <div className="z-10 bg-emerald-500/10 border-2 border-emerald-500/50 p-4 rounded-2xl min-w-[280px] shadow-lg shadow-emerald-500/10">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-xl bg-emerald-500 flex items-center justify-center text-white font-bold text-xl">
                    {manager.fullName.charAt(0)}
                  </div>
                  <div>
                    <h4 className="font-black text-white">
                      {manager.fullName}
                    </h4>
                    <p className="text-xs text-emerald-400 uppercase tracking-widest font-bold">
                      {manager.workRole || "Management"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Connection Line */}
            <div className="flex justify-center -mt-6">
              <div className="w-px h-12 bg-emerald-500/30"></div>
            </div>

            {/* Division Managers membawahi... */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 px-4">
              {divisionManagers
                .filter((dm) => dm.directSupervisorUid === manager.uid)
                .map((dm) => (
                  <div
                    key={dm.uid}
                    className="flex flex-col items-center gap-4"
                  >
                    <div className="bg-blue-500/10 border border-blue-500/30 p-4 rounded-xl w-full shadow-md">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-blue-500 flex items-center justify-center text-white font-bold">
                          {dm.fullName.charAt(0)}
                        </div>
                        <div>
                          <h5 className="font-bold text-sm">{dm.fullName}</h5>
                          <p className="text-[10px] text-blue-400 font-bold uppercase">
                            {dm.divisionName || "Manager Divisi"}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Connection to Staff */}
                    <div className="w-px h-6 bg-slate-700"></div>

                    {/* Staff list */}
                    <div className="w-full space-y-2">
                      {staffUsers
                        .filter(
                          (s) =>
                            s.brandId === dm.brandId &&
                            s.divisionId === dm.divisionId,
                        )
                        .map((s) => (
                          <div
                            key={s.uid}
                            className="flex items-center gap-3 p-2 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-lg ml-4"
                          >
                            <div className="h-6 w-6 rounded bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-[10px] text-slate-600 dark:text-slate-400">
                              {s.fullName.charAt(0)}
                            </div>
                            <div className="flex flex-col">
                              <span className="text-xs font-medium">
                                {s.fullName}
                              </span>
                              <span className="text-[9px] text-slate-500">
                                {s.workRole || "Staff"}
                              </span>
                            </div>
                          </div>
                        ))}
                      {staffUsers.filter(
                        (s) =>
                          s.brandId === dm.brandId &&
                          s.divisionId === dm.divisionId,
                      ).length === 0 && (
                        <p className="text-[10px] text-slate-600 italic text-center">
                          Belum ada staff
                        </p>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ))}

        {/* Orphan Division Managers (No Director assigned) */}
        {divisionManagers.filter((dm) => !dm.directSupervisorUid).length >
          0 && (
          <div className="space-y-6 pt-10 border-t border-slate-800/50">
            <div className="flex items-center gap-2 justify-center text-amber-500">
              <AlertCircle className="h-4 w-4" />
              <span className="text-xs font-bold uppercase tracking-widest">
                Manager Divisi Tanpa Direktur
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {divisionManagers
                .filter((dm) => !dm.directSupervisorUid)
                .map((dm) => (
                  <div
                    key={dm.uid}
                    className="bg-amber-500/5 border border-amber-500/20 p-4 rounded-xl shadow-md"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-500 font-bold">
                        {dm.fullName.charAt(0)}
                      </div>
                      <div>
                        <h5 className="font-bold text-sm">{dm.fullName}</h5>
                        <p className="text-[10px] text-amber-500/70 font-bold uppercase">
                          {dm.divisionName || "Manager Divisi"}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
