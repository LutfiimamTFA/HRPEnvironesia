'use client';

import { useState, useMemo } from 'react';
import { useCollection, useFirestore, useMemoFirebase, deleteDocumentNonBlocking, useDoc } from '@/firebase';
import { collection, query, where, doc } from 'firebase/firestore';
import type { OvertimeSubmission, EmployeeProfile, Brand } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, PlusCircle, MoreHorizontal, Eye, Edit, Trash2, Clock, UserCheck, Building, Calendar, Info } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { OvertimeSubmissionForm } from './OvertimeSubmissionForm';
import { DeleteConfirmationDialog } from '../DeleteConfirmationDialog';
import { useToast } from '@/hooks/use-toast';
import { KpiCard } from '@/components/recruitment/KpiCard';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { OvertimeStatusBadge } from './OvertimeStatusBadge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const LatestSubmissionCard = ({ submission, supervisorName, onActionClick }: { submission: OvertimeSubmission | null, supervisorName: string, onActionClick: (action: 'view' | 'edit', sub: OvertimeSubmission) => void }) => {
    if (!submission) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Belum Ada Pengajuan Lembur</CardTitle>
                    <CardDescription>Buat pengajuan lembur pertama Anda untuk memulai.</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    let waitingFor = '-';
    let nextStep = '-';
    let alertVariant: 'default' | 'destructive' | 'warning' = 'default';

    switch (submission.status) {
        case 'pending_manager':
            waitingFor = supervisorName;
            nextStep = 'Menunggu persetujuan Manajer Divisi.';
            alertVariant = 'default';
            break;
        case 'approved_by_manager':
        case 'pending_hrd':
            waitingFor = 'Tim HRD';
            nextStep = 'Menunggu verifikasi dan persetujuan final dari HRD.';
            alertVariant = 'default';
            break;
        case 'revision_manager':
            waitingFor = 'Anda';
            nextStep = `Revisi diperlukan sesuai catatan dari ${submission.managerNotes ? 'Manajer Divisi' : 'Approver'}.`;
            alertVariant = 'warning';
            break;
        case 'revision_hrd':
            waitingFor = 'Anda';
            nextStep = `Revisi diperlukan sesuai catatan dari HRD.`;
            alertVariant = 'warning';
            break;
        case 'approved':
             waitingFor = 'Selesai';
             nextStep = 'Pengajuan lembur Anda telah disetujui sepenuhnya.';
             break;
        case 'rejected_manager':
        case 'rejected_hrd':
            waitingFor = 'Selesai';
            nextStep = `Pengajuan lembur Anda ditolak oleh ${submission.status === 'rejected_manager' ? 'Manajer Divisi' : 'HRD'}.`;
            alertVariant = 'destructive';
            break;
        case 'draft':
            waitingFor = 'Anda';
            nextStep = 'Pengajuan masih dalam bentuk draf dan belum dikirim.';
            alertVariant = 'warning';
            break;
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex justify-between items-start">
                    <div>
                        <CardTitle>Pengajuan Terakhir</CardTitle>
                        <CardDescription>
                            Diajukan {formatDistanceToNow(submission.createdAt.toDate(), { addSuffix: true, locale: idLocale })}
                        </CardDescription>
                    </div>
                     <OvertimeStatusBadge status={submission.status} />
                </div>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                 <div className="flex items-center gap-3">
                    <Calendar className="h-8 w-8 text-primary" />
                    <div>
                        <p className="text-xs text-muted-foreground">Tanggal Lembur</p>
                        <p className="font-semibold">{format(submission.date.toDate(), 'eeee, dd MMM yyyy', { locale: idLocale })}</p>
                    </div>
                </div>
                 <div className="flex items-center gap-3">
                    <Clock className="h-8 w-8 text-primary" />
                    <div>
                        <p className="text-xs text-muted-foreground">Durasi</p>
                        <p className="font-semibold">{submission.totalDurationMinutes} menit</p>
                    </div>
                </div>
                 <div className="flex items-center gap-3">
                    <Building className="h-8 w-8 text-primary" />
                    <div>
                        <p className="text-xs text-muted-foreground">Manajer Anda</p>
                        <p className="font-semibold">{supervisorName}</p>
                    </div>
                </div>
                 <div className="flex items-center gap-3">
                    <UserCheck className="h-8 w-8 text-primary" />
                    <div>
                        <p className="text-xs text-muted-foreground">Menunggu</p>
                        <p className="font-semibold">{waitingFor}</p>
                    </div>
                </div>
            </CardContent>
            <CardFooter>
                 <Alert variant={alertVariant} className="w-full">
                    <Info className="h-4 w-4" />
                    <AlertTitle className="font-semibold">Langkah Selanjutnya</AlertTitle>
                    <AlertDescription>
                        <div className="flex justify-between items-center">
                            <span>{nextStep}</span>
                             <Button size="sm" variant="secondary" onClick={() => onActionClick('view', submission)}>Lihat Detail</Button>
                        </div>
                    </AlertDescription>
                </Alert>
            </CardFooter>
        </Card>
    );
}

export function PengajuanLemburClient() {
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState<OvertimeSubmission | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const submissionsQuery = useMemoFirebase(() => {
    if (!userProfile?.uid) return null;
    return query(collection(firestore, 'overtime_submissions'), where('uid', '==', userProfile.uid));
  }, [userProfile?.uid, firestore]);
  
  const { data: submissions, isLoading, mutate } = useCollection<OvertimeSubmission>(submissionsQuery);

  const { data: employeeProfile, isLoading: isLoadingProfile } = useDoc<EmployeeProfile>(
    useMemoFirebase(() => (userProfile ? doc(firestore, 'employee_profiles', userProfile.uid) : null), [userProfile, firestore])
  );
  
  const { data: brands, isLoading: isLoadingBrands } = useCollection<Brand>(
    useMemoFirebase(() => collection(firestore, 'brands'), [firestore])
  );

  const latestSubmission = useMemo(() => {
    if (!submissions || submissions.length === 0) return null;
    return [...submissions].sort((a,b) => b.createdAt.toMillis() - a.createdAt.toMillis())[0];
  }, [submissions]);

  const summary = useMemo(() => {
    const kpis = { draft: 0, pending: 0, approved: 0, revision: 0, rejected: 0 };
    if (!submissions) return kpis;
    submissions.forEach(s => {
        if (s.status.startsWith('pending')) kpis.pending++;
        else if (s.status.startsWith('revision')) kpis.revision++;
        else if (s.status.startsWith('rejected')) kpis.rejected++;
        else if (s.status === 'approved') kpis.approved++;
        else if (s.status === 'draft') kpis.draft++;
    });
    return kpis;
  }, [submissions]);
  
  const sortedSubmissions = useMemo(() => {
    if (!submissions) return [];
    return [...submissions].sort((a,b) => b.createdAt.toMillis() - a.createdAt.toMillis());
  }, [submissions]);
  
  const handleCreate = () => {
    setSelectedSubmission(null);
    setIsFormOpen(true);
  };
  
  const handleAction = (action: 'view' | 'edit', submission: OvertimeSubmission) => {
    setSelectedSubmission(submission);
    setIsFormOpen(true);
  };

  const handleCancel = (submission: OvertimeSubmission) => {
    setSelectedSubmission(submission);
    setIsDeleteDialogOpen(true);
  };

  const confirmCancel = async () => {
    if (!selectedSubmission) return;
    try {
        await deleteDocumentNonBlocking(doc(firestore, 'overtime_submissions', selectedSubmission.id!));
        toast({ title: "Pengajuan Dibatalkan" });
        mutate();
    } catch(e: any) {
        toast({ variant: 'destructive', title: "Gagal Membatalkan", description: e.message });
    } finally {
        setIsDeleteDialogOpen(false);
    }
  };

  if (isLoading || isLoadingProfile || isLoadingBrands) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Pengajuan Lembur</h1>
            <p className="text-muted-foreground">Buat dan lacak status pengajuan lembur Anda.</p>
          </div>
          <Button onClick={handleCreate}><PlusCircle className="mr-2 h-4 w-4"/> Buat Pengajuan</Button>
        </div>

        <LatestSubmissionCard 
            submission={latestSubmission} 
            supervisorName={employeeProfile?.supervisorName || 'Manajer Divisi'}
            onActionClick={handleAction}
        />

        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
            <KpiCard title="Draft" value={summary.draft} />
            <KpiCard title="Menunggu" value={summary.pending} />
            <KpiCard title="Perlu Revisi" value={summary.revision} deltaType="inverse" />
            <KpiCard title="Disetujui" value={summary.approved} />
            <KpiCard title="Ditolak" value={summary.rejected} deltaType="inverse" />
        </div>

        <Card>
            <CardHeader><CardTitle>Riwayat Pengajuan</CardTitle></CardHeader>
            <CardContent>
                <div className="rounded-lg border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Tanggal Lembur</TableHead>
                            <TableHead>Durasi</TableHead>
                            <TableHead>Tipe</TableHead>
                            <TableHead>Manajer Divisi</TableHead>
                            <TableHead>Update Terakhir</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Aksi</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sortedSubmissions.length > 0 ? sortedSubmissions.map(s => (
                            <TableRow key={s.id}>
                                <TableCell className="font-medium">{format(s.date.toDate(), 'dd MMM yyyy', { locale: idLocale })}</TableCell>
                                <TableCell>{s.totalDurationMinutes} menit</TableCell>
                                <TableCell className="capitalize">{s.overtimeType.replace('_', ' ')}</TableCell>
                                <TableCell>{employeeProfile?.supervisorName || '-'}</TableCell>
                                <TableCell>{formatDistanceToNow(s.updatedAt.toDate(), { addSuffix: true, locale: idLocale })}</TableCell>
                                <TableCell><OvertimeStatusBadge status={s.status} /></TableCell>
                                <TableCell className="text-right">
                                     <DropdownMenu>
                                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onSelect={() => handleAction('view', s)}><Eye className="mr-2 h-4 w-4"/> Lihat Detail</DropdownMenuItem>
                                            {(s.status === 'draft' || s.status.startsWith('revision')) && <DropdownMenuItem onSelect={() => handleAction('edit', s)}><Edit className="mr-2 h-4 w-4"/> Edit</DropdownMenuItem>}
                                            {s.status === 'draft' && <DropdownMenuItem onSelect={() => handleCancel(s)} className="text-destructive"><Trash2 className="mr-2 h-4 w-4"/> Batalkan</DropdownMenuItem>}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        )) : (<TableRow><TableCell colSpan={7} className="h-24 text-center">Belum ada pengajuan lembur.</TableCell></TableRow>)}
                    </TableBody>
                </Table>
                </div>
            </CardContent>
        </Card>
      </div>

      <OvertimeSubmissionForm 
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        submission={selectedSubmission}
        employeeProfile={employeeProfile}
        brands={brands || []}
        onSuccess={mutate}
      />
      
      <DeleteConfirmationDialog 
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        onConfirm={confirmCancel}
        itemName="pengajuan lembur ini"
        itemType=""
      />
    </>
  );
}
