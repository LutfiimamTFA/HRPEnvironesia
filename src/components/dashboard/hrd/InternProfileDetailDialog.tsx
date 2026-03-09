'use client';

import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import type { EmployeeProfile, JobApplication } from '@/lib/types';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import { Loader2, Edit } from 'lucide-react';
import { InternAdminDataFormDialog } from './InternAdminDataFormDialog';


const InfoRow = ({ label, value }: { label: string; value?: string | number | null }) => (
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 py-1.5">
    <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
    <dd className="text-sm col-span-2">{value || '-'}</dd>
  </div>
);

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <h3 className="text-lg font-semibold tracking-tight border-b pb-2 mb-4">{children}</h3>
);

interface InternProfileDetailDialogProps {
  profile: EmployeeProfile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdminDataChange: () => void;
}

export function InternProfileDetailDialog({ profile, open, onOpenChange, onAdminDataChange }: InternProfileDetailDialogProps) {
  const [isEditAdminOpen, setIsEditAdminOpen] = useState(false);

  if (!profile) return null;

  const firestore = useFirestore();

  const applicationQuery = useMemoFirebase(() => {
    if (!profile) return null;
    return query(
      collection(firestore, 'applications'),
      where('candidateUid', '==', profile.uid),
      where('status', '==', 'hired')
    );
  }, [firestore, profile]);

  const { data: applications, isLoading: isLoadingApplication } = useCollection<JobApplication>(applicationQuery);

  const application = useMemo(() => {
    if (!applications || applications.length === 0) return null;
    const sortedApps = [...applications].sort((a, b) => (b.updatedAt?.toMillis() ?? 0) - (a.updatedAt?.toMillis() ?? 0));
    return sortedApps[0];
  }, [applications]);
  
  const handleAdminFormSuccess = () => {
    onAdminDataChange();
    setIsEditAdminOpen(false);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl h-[90vh] flex flex-col p-0">
          <DialogHeader className="p-6 pb-4 border-b flex-row items-center justify-between">
            <div>
              <DialogTitle>Detail Profil Magang: {profile.fullName}</DialogTitle>
              <DialogDescription>{profile.email}</DialogDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => setIsEditAdminOpen(true)}><Edit className="mr-2 h-4 w-4"/> Edit Data Administrasi</Button>
          </DialogHeader>
          <ScrollArea className="flex-grow pr-6 -mr-6 pl-6">
            <div className="space-y-6 py-4">
              <div>
                <SectionTitle>Identitas</SectionTitle>
                <dl className="space-y-1">
                  <InfoRow label="Nama Lengkap" value={profile.fullName} />
                  <InfoRow label="Nama Panggilan" value={profile.nickName} />
                  <InfoRow label="Telepon" value={profile.phone} />
                  <InfoRow label="Jenis Kelamin" value={profile.gender} />
                  <InfoRow label="Tempat, Tanggal Lahir" value={`${profile.birthPlace || ''}, ${profile.birthDate ? format(new Date(profile.birthDate), 'dd MMMM yyyy', {locale: id}) : '-'}`} />
                </dl>
              </div>
              
              <Separator />
              
              <div>
                  <SectionTitle>Status & Penempatan</SectionTitle>
                   <dl className="space-y-1">
                      <InfoRow label="Penempatan Brand" value={application?.brandName || profile.brandName || '-'} />
                      <InfoRow label="Divisi" value={profile.division || '-'} />
                      <InfoRow label="Supervisor" value={profile.supervisorName || '-'} />
                      <InfoRow label="Tipe Magang" value={profile.internSubtype === 'intern_education' ? 'Terikat Pendidikan' : 'Pra-Probation'} />
                      <InfoRow label="Tipe Pekerja" value={profile.employmentType} />
                  </dl>
               </div>
               
               <Separator />

               <Card>
                  <CardHeader>
                      <CardTitle className="text-lg">Detail Kontrak & Penawaran</CardTitle>
                  </CardHeader>
                  <CardContent>
                      {isLoadingApplication ? (
                          <div className="flex items-center justify-center h-24">
                              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                          </div>
                      ) : (
                           <div className="space-y-4">
                              <div>
                                  <h4 className="text-sm font-semibold mb-2">Periode Magang Resmi</h4>
                                  <dl className="space-y-1 text-sm">
                                      <InfoRow label="Mulai Magang" value={profile.internshipStartDate ? format(profile.internshipStartDate.toDate(), 'dd MMMM yyyy', { locale: id }) : 'Belum diatur'} />
                                      <InfoRow label="Selesai Magang" value={profile.internshipEndDate ? format(profile.internshipEndDate.toDate(), 'dd MMMM yyyy', { locale: id }) : 'Belum diatur'} />
                                      <InfoRow label="Kompensasi" value={profile.compensationAmount ? `Rp ${profile.compensationAmount.toLocaleString('id-ID')}` : '-'} />
                                  </dl>
                              </div>
                              {application && <Separator />}
                              {application && (
                                  <div>
                                      <h4 className="text-sm font-semibold mb-2">Detail Penawaran Awal (dari Rekrutmen)</h4>
                                      <dl className="space-y-1 text-sm">
                                          <InfoRow label="Uang Saku" value={application.offeredSalary ? `Rp ${application.offeredSalary.toLocaleString('id-ID')}` : '-'} />
                                          <InfoRow label="Durasi Kontrak" value={application.contractDurationMonths ? `${application.contractDurationMonths} bulan` : '-'} />
                                          <InfoRow label="Tanggal Mulai (Offer)" value={application.contractStartDate ? format(application.contractStartDate.toDate(), 'dd MMM yyyy, HH:mm') : '-'} />
                                          <InfoRow label="Tanggal Selesai (Offer)" value={application.contractEndDate ? format(application.contractEndDate.toDate(), 'dd MMMM yyyy') : '-'} />
                                          <InfoRow label="Catatan Penawaran" value={application.offerNotes} />
                                      </dl>
                                  </div>
                              )}
                          </div>
                      )}
                  </CardContent>
              </Card>

              <Separator />

              <div>
                  <SectionTitle>Pendidikan</SectionTitle>
                   <dl className="space-y-1">
                      <InfoRow label="Asal Sekolah/Kampus" value={profile.schoolOrCampus} />
                      <InfoRow label="Jurusan" value={profile.major} />
                      <InfoRow label="Jenjang Pendidikan" value={profile.educationLevel} />
                      <InfoRow label="Perkiraan Selesai (Studi)" value={profile.expectedEndDate ? format(new Date(profile.expectedEndDate), 'dd MMMM yyyy', {locale: id}) : '-'} />
                  </dl>
              </div>
              
              <Separator />
              
              <div>
                  <SectionTitle>Domisili & Kontak Darurat</SectionTitle>
                   <dl className="space-y-1">
                      <InfoRow label="Alamat Domisili" value={profile.addressCurrent} />
                      <InfoRow label="Nama Kontak Darurat" value={profile.emergencyContactName} />
                      <InfoRow label="Hubungan" value={profile.emergencyContactRelation} />
                      <InfoRow label="Telepon Darurat" value={profile.emergencyContactPhone} />
                  </dl>
              </div>
            </div>
          </ScrollArea>
          <DialogFooter className="p-6 pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {isEditAdminOpen && (
        <InternAdminDataFormDialog
            open={isEditAdminOpen}
            onOpenChange={setIsEditAdminOpen}
            profile={profile}
            onSuccess={handleAdminFormSuccess}
        />
      )}
    </>
  );
}
