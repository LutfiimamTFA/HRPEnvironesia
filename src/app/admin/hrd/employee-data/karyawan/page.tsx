"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { MENU_CONFIG } from "@/lib/menu-config";
import { useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, query, where } from "firebase/firestore";
import type {
  UserProfile,
  Brand,
  EmployeeProfile,
  Division,
} from "@/lib/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Edit,
  Search,
  PlusCircle,
  Upload,
  Download,
  FileSpreadsheet,
  Users,
  MoreHorizontal,
  Trash2,
  Eye,
  Flag,
  Archive,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Info,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { EmployeeAdminFormDialog } from "@/components/dashboard/hrd/EmployeeAdminFormDialog";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ImportDialog } from "@/components/dashboard/hrd/ImportDialog";
import { DeleteConfirmationDialog } from "@/components/dashboard/DeleteConfirmationDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function EmployeeTableSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-10 w-48" />
      </div>
      <Skeleton className="h-96 w-full" />
    </div>
  );
}

export default function KaryawanDataPage() {
  const { userProfile } = useAuth();
  const hasAccess = useRoleGuard(["hrd", "super-admin"]);
  const firestore = useFirestore();
  const { toast } = useToast();

  const menuConfig = useMemo(() => {
    if (!userProfile) return [];
    return MENU_CONFIG[userProfile.role] || [];
  }, [userProfile]);

  const [activeTab, setActiveTab] = useState("active");
  const [brandFilter, setBrandFilter] = useState("all");
  const [completenessFilter, setCompletenessFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUser, setSelectedUser] = useState<EmployeeProfile | null>(
    null,
  );
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<EmployeeProfile | null>(
    null,
  );

  const calculateProfileCompleteness = (profile: EmployeeProfile) => {
    const fields = [
      // Data Diri Identitas
      profile.dataDiriIdentitas?.fullName,
      profile.dataDiriIdentitas?.nickName,
      profile.dataDiriIdentitas?.personalEmail,
      profile.dataDiriIdentitas?.phone,
      profile.dataDiriIdentitas?.gender,
      profile.dataDiriIdentitas?.birthPlace,
      profile.dataDiriIdentitas?.birthDate,
      profile.dataDiriIdentitas?.maritalStatus,
      profile.dataDiriIdentitas?.religion,
      profile.dataDiriIdentitas?.nationality,
      profile.dataDiriIdentitas?.nik,
      profile.dataDiriIdentitas?.profilePhotoUrl,
      profile.dataDiriIdentitas?.ktpPhotoUrl,

      // Alamat
      profile.alamat?.ktp?.street,
      profile.alamat?.ktp?.provinsi?.name,
      profile.alamat?.ktp?.kabupatenKota?.name,
      profile.alamat?.ktp?.kecamatan?.name,
      profile.alamat?.ktp?.kelurahan?.name,
      profile.alamat?.ktp?.kodePos,

      // Dokumen Administratif
      profile.dokumenAdministratif?.npwp,
      profile.dokumenAdministratif?.npwpPhotoUrl,
      profile.dokumenAdministratif?.bpjsKesehatan,
      profile.dokumenAdministratif?.bpjsKesehatanPhotoUrl,
      profile.dokumenAdministratif?.bpjsKetenagakerjaan,
      profile.dokumenAdministratif?.bpjsKetenagakerjaanPhotoUrl,

      // Data Rekening
      profile.dataRekening?.bankName,
      profile.dataRekening?.bankAccountNumber,
      profile.dataRekening?.bankAccountHolderName,
      profile.dataRekening?.bankDocumentUrl,

      // Data Keluarga
      profile.dataKeluarga?.orangTua?.ayah?.name,
      profile.dataKeluarga?.orangTua?.ibu?.name,

      // Kontak Darurat
      profile.kontakDarurat?.[0]?.name,
      profile.kontakDarurat?.[0]?.phone,

      // Pendidikan
      profile.pendidikanDanPengembangan?.pendidikanTerakhir?.jenjang,
      profile.pendidikanDanPengembangan?.pendidikanTerakhir?.namaInstitusi,
    ];

    const filledFields = fields.filter(
      (field) => field && field.trim() !== "",
    ).length;
    const totalFields = fields.length;
    const percentage = Math.round((filledFields / totalFields) * 100);

    return {
      percentage,
      status:
        percentage >= 90
          ? "complete"
          : percentage >= 50
            ? "partial"
            : "incomplete",
      filledFields,
      totalFields,
    };
  };

  const getCompletenessBadge = (status: string) => {
    switch (status) {
      case "complete":
        return (
          <Badge
            variant="default"
            className="bg-green-100 text-green-800 border-green-200"
          >
            <CheckCircle className="w-3 h-3 mr-1" />
            Lengkap
          </Badge>
        );
      case "partial":
        return (
          <Badge
            variant="secondary"
            className="bg-yellow-100 text-yellow-800 border-yellow-200"
          >
            <AlertTriangle className="w-3 h-3 mr-1" />
            Sebagian
          </Badge>
        );
      case "incomplete":
        return (
          <Badge
            variant="destructive"
            className="bg-red-100 text-red-800 border-red-200"
          >
            <XCircle className="w-3 h-3 mr-1" />
            Belum Lengkap
          </Badge>
        );
      default:
        return <Badge variant="outline">Tidak Diketahui</Badge>;
    }
  };

  const QuickPreview = ({ profile }: { profile: EmployeeProfile }) => {
    const addr = profile.alamat || {};
    const pendidikan = profile.pendidikanDanPengembangan?.pendidikanTerakhir;
    const emergencyContact = profile.kontakDarurat?.[0];
    const keluarga = profile.dataKeluarga;

    return (
      <div className="space-y-3 p-2">
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1">
            ALAMAT KTP
          </p>
          <p className="text-sm">
            {addr.ktp?.street ? `Jl. ${addr.ktp.street}` : "Belum diisi"}
          </p>
          {addr.ktp?.kelurahan?.name && (
            <p className="text-xs text-muted-foreground">
              {addr.ktp.kelurahan.name}, {addr.ktp.kecamatan?.name},{" "}
              {addr.ktp.kabupatenKota?.name}
            </p>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1">
            PENDIDIKAN TERAKHIR
          </p>
          <p className="text-sm">
            {pendidikan?.jenjang && pendidikan?.namaInstitusi
              ? `${pendidikan.jenjang} - ${pendidikan.namaInstitusi}`
              : "Belum diisi"}
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1">
            KONTAK DARURAT
          </p>
          <p className="text-sm">
            {emergencyContact?.name
              ? `${emergencyContact.name} (${emergencyContact.relation})`
              : "Belum diisi"}
          </p>
          {emergencyContact?.phone && (
            <p className="text-xs text-muted-foreground">
              {emergencyContact.phone}
            </p>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1">
            STATUS KELUARGA
          </p>
          <p className="text-sm">
            Status: {profile.dataDiriIdentitas?.maritalStatus || "Belum diisi"}
          </p>
          {keluarga?.tanggungan && keluarga.tanggungan.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Tanggungan: {keluarga.tanggungan.length} orang
            </p>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1">
            STATUS DOKUMEN
          </p>
          <div className="flex gap-1 flex-wrap">
            {profile.dokumenAdministratif?.npwp && (
              <Badge variant="outline" className="text-xs">
                NPWP ✓
              </Badge>
            )}
            {profile.dokumenAdministratif?.bpjsKesehatan && (
              <Badge variant="outline" className="text-xs">
                BPJS KS ✓
              </Badge>
            )}
            {profile.dokumenAdministratif?.bpjsKetenagakerjaan && (
              <Badge variant="outline" className="text-xs">
                BPJS TK ✓
              </Badge>
            )}
            {!profile.dokumenAdministratif?.npwp &&
              !profile.dokumenAdministratif?.bpjsKesehatan &&
              !profile.dokumenAdministratif?.bpjsKetenagakerjaan && (
                <span className="text-xs text-muted-foreground">
                  Belum ada dokumen
                </span>
              )}
          </div>
        </div>
      </div>
    );
  };

  const {
    data: employeeProfiles,
    isLoading: profilesLoading,
    mutate,
  } = useCollection<EmployeeProfile>(
    useMemoFirebase(
      () =>
        query(
          collection(firestore, "employee_profiles"),
          where("employmentType", "==", "karyawan"),
        ),
      [firestore],
    ),
  );

  const { data: brands, isLoading: brandsLoading } = useCollection<Brand>(
    useMemoFirebase(() => collection(firestore, "brands"), [firestore]),
  );

  const filteredProfiles = useMemo(() => {
    if (!employeeProfiles) return [];
    return employeeProfiles.filter((profile) => {
      const profileStatus = profile.employmentStatus || "active";
      const brandMatch =
        brandFilter === "all" || profile.brandId === brandFilter;
      const searchMatch =
        searchTerm === "" ||
        profile.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (profile.email &&
          profile.email.toLowerCase().includes(searchTerm.toLowerCase()));
      const completeness = calculateProfileCompleteness(profile);
      const completenessMatch =
        completenessFilter === "all" ||
        (completenessFilter === "complete" &&
          completeness.status === "complete") ||
        (completenessFilter === "partial" &&
          completeness.status === "partial") ||
        (completenessFilter === "incomplete" &&
          completeness.status === "incomplete");
      return (
        profileStatus === activeTab &&
        brandMatch &&
        searchMatch &&
        completenessMatch
      );
    });
  }, [
    employeeProfiles,
    activeTab,
    brandFilter,
    searchTerm,
    completenessFilter,
  ]);

  const handleCreateClick = () => {
    setSelectedUser(null);
    setIsFormOpen(true);
  };

  const handleEditClick = (profile: EmployeeProfile) => {
    setSelectedUser(profile);
    setIsFormOpen(true);
  };

  const handleDeleteClick = (profile: EmployeeProfile) => {
    setUserToDelete(profile);
    setIsDeleteOpen(true);
  };

  const handleViewDetail = (profile: EmployeeProfile) => {
    // For now, open edit form. Later can add separate view modal
    setSelectedUser(profile);
    setIsFormOpen(true);
  };

  const handleMarkForRevision = (profile: EmployeeProfile) => {
    toast({
      title: "Tandai Perlu Revisi",
      description: `Profile ${profile.fullName} telah ditandai untuk revisi.`,
    });
    // TODO: Add logic to mark profile for revision
  };

  const handleArchive = (profile: EmployeeProfile) => {
    toast({
      title: "Arsipkan Profile",
      description: `Profile ${profile.fullName} telah diarsipkan.`,
    });
    // TODO: Add logic to archive profile (soft delete)
  };

  const confirmDelete = () => {
    if (!userToDelete) return;
    console.log("Deleting user:", userToDelete.fullName);
    // Add actual deletion logic here
    toast({
      title: "Aksi Hapus Dikonfirmasi (Logika Belum Diimplementasikan)",
    });
    setIsDeleteOpen(false);
  };

  const handleFormSuccess = () => {
    setIsFormOpen(false);
    mutate();
  };

  const handleExport = () => {
    if (!filteredProfiles || filteredProfiles.length === 0) {
      toast({
        title: "Tidak Ada Data",
        description: "Tidak ada data untuk diekspor pada filter saat ini.",
      });
      return;
    }

    const headers = [
      "fullName",
      "email",
      "phone",
      "employeeNumber",
      "brandName",
      "division",
      "positionTitle",
      "managerName",
      "employmentStatus",
      "joinDate",
    ];
    const csvContent = [
      headers.join(","),
      ...filteredProfiles.map((p) =>
        headers
          .map((header) => {
            let value = (p as any)[header];
            if (header === "joinDate" && value && value.toDate) {
              value = value.toDate().toISOString().split("T")[0];
            }
            value = value ? `"${String(value).replace(/"/g, '""')}"` : '""';
            return value;
          })
          .join(","),
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute(
        "download",
        `karyawan-${activeTab}-${new Date().toISOString().split("T")[0]}.csv`,
      );
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleDownloadTemplate = () => {
    const headers =
      "fullName,email,phone,employeeNumber,positionTitle,division,brandName,joinDate(YYYY-MM-DD),employmentStatus(active/probation/resigned/terminated)";
    const blob = new Blob([headers], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", "template-karyawan.csv");
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  if (!hasAccess) {
    return (
      <DashboardLayout pageTitle="Data Karyawan" menuConfig={menuConfig}>
        <EmployeeTableSkeleton />
      </DashboardLayout>
    );
  }

  return (
    <>
      <DashboardLayout pageTitle="Data Karyawan" menuConfig={menuConfig}>
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2 justify-between">
            <p className="text-sm text-muted-foreground max-w-2xl">
              Kelola data administrasi karyawan perusahaan. Data di sini
              terpisah dari manajemen akun pengguna. Gunakan tombol import untuk
              mengunggah data dari CSV.
            </p>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button variant="outline" onClick={() => setIsImportOpen(true)}>
                <Upload className="mr-2 h-4 w-4" /> Import
              </Button>
              <Button variant="outline" onClick={handleExport}>
                <Download className="mr-2 h-4 w-4" /> Export
              </Button>
              <Button variant="outline" onClick={handleDownloadTemplate}>
                <FileSpreadsheet className="mr-2 h-4 w-4" /> Template
              </Button>
              <Button onClick={handleCreateClick}>
                <PlusCircle className="mr-2 h-4 w-4" /> Tambah Manual
              </Button>
            </div>
          </div>
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center mb-4">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList>
                    <TabsTrigger value="active">Karyawan Aktif</TabsTrigger>
                    <TabsTrigger value="probation">Masa Percobaan</TabsTrigger>
                    <TabsTrigger value="resigned">
                      Resigned/Terminated
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Cari nama atau email..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full sm:w-[250px] pl-8"
                    />
                  </div>
                  <Select
                    value={brandFilter}
                    onValueChange={setBrandFilter}
                    disabled={brandsLoading}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Semua Brand" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua Brand</SelectItem>
                      {brands?.map((b) => (
                        <SelectItem key={b.id!} value={b.id!}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={completenessFilter}
                    onValueChange={setCompletenessFilter}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Semua Kelengkapan" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua Kelengkapan</SelectItem>
                      <SelectItem value="complete">Lengkap</SelectItem>
                      <SelectItem value="partial">Sebagian</SelectItem>
                      <SelectItem value="incomplete">Belum Lengkap</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="rounded-lg border-t">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama</TableHead>
                      <TableHead>Brand</TableHead>
                      <TableHead>Divisi</TableHead>
                      <TableHead>Jabatan</TableHead>
                      <TableHead>Manager Divisi</TableHead>
                      <TableHead>Kelengkapan</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {profilesLoading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-24 text-center">
                          Memuat data karyawan...
                        </TableCell>
                      </TableRow>
                    ) : filteredProfiles.length > 0 ? (
                      filteredProfiles.map((profile) => {
                        const completeness =
                          calculateProfileCompleteness(profile);
                        return (
                          <TableRow key={profile.uid} className="cursor-pointer">
                            <TableCell className="font-medium">
                              <div>{profile.fullName}</div>
                              <div className="text-xs text-muted-foreground">
                                {profile.email}
                              </div>
                            </TableCell>
                            <TableCell>
                              {profile.brandName || "-"}
                            </TableCell>
                            <TableCell>{profile.division || "-"}</TableCell>
                            <TableCell>
                              {profile.positionTitle || "-"}
                            </TableCell>
                            <TableCell>
                              {profile.managerName || "-"}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">
                                  {completeness.percentage}%
                                </span>
                                {getCompletenessBadge(completeness.status)}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onSelect={() =>
                                      handleViewDetail(profile)
                                    }
                                  >
                                    <Eye className="mr-2 h-4 w-4" /> Lihat
                                    Detail
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onSelect={() =>
                                      handleMarkForRevision(profile)
                                    }
                                  >
                                    <AlertTriangle className="mr-2 h-4 w-4" />{" "}
                                    Tandai Perlu Revisi
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onSelect={() => handleArchive(profile)}
                                  >
                                    <Archive className="mr-2 h-4 w-4" />{" "}
                                    Arsipkan
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onSelect={() =>
                                      handleEditClick(profile)
                                    }
                                  >
                                    <Edit className="mr-2 h-4 w-4" /> Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-destructive"
                                    onSelect={() =>
                                      handleDeleteClick(profile)
                                    }
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />{" "}
                                    Hapus
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    ) : (
                      <TableRow>
                        <TableCell colSpan={7} className="h-48 text-center">
                          <div className="flex flex-col items-center gap-3 text-muted-foreground">
                            <Users className="h-10 w-10" />
                            <p className="font-semibold">
                              Belum ada data karyawan.
                            </p>
                            <p className="text-sm">
                              Impor data dari CSV/XLSX atau tambahkan karyawan
                              secara manual.
                            </p>
                            <div className="flex gap-2 mt-2">
                              <Button
                                variant="outline"
                                onClick={() => setIsImportOpen(true)}
                              >
                                Import Data
                              </Button>
                              <Button onClick={handleCreateClick}>
                                Tambah Manual
                              </Button>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
      <EmployeeAdminFormDialog
        profile={selectedUser}
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        onSuccess={handleFormSuccess}
      />
      <ImportDialog
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        onImportSuccess={mutate}
      />
      <DeleteConfirmationDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        onConfirm={confirmDelete}
        itemName={userToDelete?.fullName}
        itemType="Data Karyawan"
      />
    </>
  );
}
