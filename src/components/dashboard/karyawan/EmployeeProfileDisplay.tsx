'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Edit, User, Home, BookOpen, Briefcase, Sparkles, Building, Info as InfoIcon, File, Banknote, ShieldAlert, FileText } from 'lucide-react';
import type { UserProfile, EmployeeProfile, Address } from '@/lib/types';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const InfoRow = ({ label, value }: { label: string; value?: string | number | null; className?: string }) => (
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 py-2 border-b">
    <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
    <dd className="text-sm col-span-2 font-semibold">{value || '-'}</dd>
  </div>
);

const SectionTitle = ({ children, icon }: { children: React.ReactNode, icon: React.ReactNode }) => (
    <h3 className="text-lg font-semibold tracking-tight flex items-center gap-3 mb-4 text-primary">
        {icon}
        {children}
    </h3>
);

const AddressView = ({ title, address }: { title: string; address?: Partial<Address> }) => {
    if (!address || !address.street) return <div className="text-sm text-muted-foreground italic">Belum diisi.</div>;
    return (
         <div className="space-y-1 text-sm">
            <p className="font-semibold">{title}</p>
            <div className="text-muted-foreground">
                <p>{address.street}, RT {address.rt}/RW {address.rw}</p>
                <p>{address.village}, {address.district}</p>
                <p>{address.city}, {address.province} {address.postalCode}</p>
            </div>
        </div>
    )
};

export function EmployeeProfileDisplay({
  employeeProfile,
  userProfile,
  onEdit,
}: {
  employeeProfile: EmployeeProfile;
  userProfile: UserProfile;
  onEdit: () => void;
}) {
  const isDataIncomplete = !employeeProfile.managerName || !employeeProfile.division || !employeeProfile.positionTitle;
  const isProfileComplete = employeeProfile?.completeness?.isComplete;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-2xl">{employeeProfile.fullName}</CardTitle>
              <CardDescription className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
                <span>{employeeProfile.email}</span>
                <span className="hidden sm:inline">•</span>
                <span>{employeeProfile.phone}</span>
              </CardDescription>
            </div>
             <div className="flex items-center gap-4">
                <Badge variant={isProfileComplete ? 'default' : 'secondary'}>
                    {isProfileComplete ? 'Profil Lengkap' : 'Profil Belum Lengkap'}
                </Badge>
                <Button onClick={onEdit}><Edit className="mr-2 h-4 w-4" /> Edit Profil</Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {isDataIncomplete && (
        <Alert variant="destructive">
            <InfoIcon className="h-4 w-4" />
            <AlertTitle>Data Kepegawaian Belum Lengkap</AlertTitle>
            <AlertDescription>
                Informasi jabatan, divisi, atau atasan Anda belum diatur. Beberapa fitur seperti pengajuan izin mungkin belum berfungsi. Harap hubungi HRD.
            </AlertDescription>
        </Alert>
      )}
      
      <div className="grid lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-6">
             <Card className="border-primary/20 bg-primary/5">
                <CardHeader>
                    <SectionTitle icon={<Briefcase className="h-5 w-5" />}>Informasi Kepegawaian (Dikelola HRD)</SectionTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                    <InfoRow label="Nomor Induk" value={employeeProfile.employeeNumber} />
                    <InfoRow label="Jabatan" value={employeeProfile.positionTitle} />
                    <InfoRow label="Divisi" value={employeeProfile.division} />
                    <InfoRow label="Brand" value={employeeProfile.brandName} />
                    <InfoRow label="Atasan Langsung" value={employeeProfile.managerName} />
                    <Separator className="my-3"/>
                    <InfoRow label="Tanggal Bergabung" value={employeeProfile.joinDate ? format(employeeProfile.joinDate.toDate(), 'dd MMMM yyyy') : '-'} />
                    <InfoRow label="Tipe Karyawan" value={employeeProfile.employmentType} />
                    <InfoRow label="Status" value={employeeProfile.employmentStatus} />
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <SectionTitle icon={<User className="h-5 w-5" />}>Identitas Pribadi</SectionTitle>
                     <CardDescription>Dapat diubah oleh Anda melalui tombol "Edit Profil".</CardDescription>
                </CardHeader>
                <CardContent className="space-y-1">
                    <InfoRow label="Nama Panggilan" value={employeeProfile.nickName} />
                    <InfoRow label="Tempat, Tgl Lahir" value={`${employeeProfile.birthPlace || '-'}, ${employeeProfile.birthDate ? format(new Date(employeeProfile.birthDate), 'dd MMM yyyy', {locale: idLocale}) : '-'}`} />
                    <InfoRow label="Jenis Kelamin" value={employeeProfile.gender} />
                    <InfoRow label="Status Pernikahan" value={employeeProfile.maritalStatus} />
                    <InfoRow label="Agama" value={employeeProfile.religion} />
                </CardContent>
            </Card>
            
            <Card>
                <CardHeader>
                    <SectionTitle icon={<Banknote className="h-5 w-5" />}>Administrasi & Finansial</SectionTitle>
                    <CardDescription>Dapat diubah oleh Anda melalui tombol "Edit Profil".</CardDescription>
                </CardHeader>
                <CardContent className="space-y-1">
                    <InfoRow label="Nomor KTP (NIK)" value={employeeProfile.nik} />
                    <Separator className="my-3"/>
                    <InfoRow label="NPWP" value={employeeProfile.npwp || (employeeProfile.hasNpwp ? 'Belum diisi' : 'Tidak memiliki')} />
                    <InfoRow label="BPJS Kesehatan" value={employeeProfile.bpjsKesehatan || (employeeProfile.hasBpjsKesehatan ? 'Belum diisi' : 'Tidak memiliki')} />
                    <InfoRow label="BPJS Ketenagakerjaan" value={employeeProfile.bpjsKetenagakerjaan || (employeeProfile.hasBpjsKetenagakerjaan ? 'Belum diisi' : 'Tidak memiliki')} />
                    <Separator className="my-3"/>
                    <InfoRow label="Nama Bank" value={employeeProfile.bankName} />
                    <InfoRow label="No. Rekening" value={employeeProfile.bankAccountNumber} />
                    <InfoRow label="Nama Pemilik Rekening" value={employeeProfile.bankAccountHolderName} />
                </CardContent>
            </Card>

        </div>

        <div className="lg:sticky lg:top-24 space-y-6">
            <Card>
                <CardHeader>
                    <SectionTitle icon={<Home className="h-5 w-5" />}>Alamat</SectionTitle>
                    <CardDescription>Dapat diubah oleh Anda melalui tombol "Edit Profil".</CardDescription>
                </CardHeader>
                <CardContent>
                    <AddressView title="Alamat Sesuai KTP & Domisili" address={employeeProfile.address} />
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <SectionTitle icon={<ShieldAlert className="h-5 w-5" />}>Kontak Darurat</SectionTitle>
                    <CardDescription>Dapat diubah oleh Anda melalui tombol "Edit Profil".</CardDescription>
                </CardHeader>
                <CardContent className="space-y-1">
                    <InfoRow label="Nama" value={employeeProfile.emergencyContactName} />
                    <InfoRow label="Hubungan" value={employeeProfile.emergencyContactRelation} />
                    <InfoRow label="Telepon" value={employeeProfile.emergencyContactPhone} />
                </CardContent>
            </Card>
        </div>
      </div>
    </div>
  );
}
