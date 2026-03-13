'use client';

import { useState, useMemo } from 'react';
import { useCollection, useFirestore, useMemoFirebase, deleteDocumentNonBlocking, useDoc } from '@/firebase';
import { collection, query, where, doc } from 'firebase/firestore';
import type { PermissionRequest, EmployeeProfile, Brand } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, PlusCircle, MoreHorizontal, Eye, Edit, Trash2 } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { PermissionRequestForm } from './PermissionRequestForm'; 
import { PermissionStatusBadge } from './PermissionStatusBadge';
import { DeleteConfirmationDialog } from '../DeleteConfirmationDialog';
import { useToast } from '@/hooks/use-toast';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export function PermissionSubmissionClient() {
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<PermissionRequest | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const submissionsQuery = useMemoFirebase(() => {
    if (!userProfile?.uid) return null;
    return query(collection(firestore, 'permission_requests'), where('uid', '==', userProfile.uid));
  }, [userProfile?.uid, firestore]);
  
  const { data: submissions, isLoading, mutate } = useCollection<PermissionRequest>(submissionsQuery);

  const { data: employeeProfile, isLoading: isLoadingProfile } = useDoc<EmployeeProfile>(
    useMemoFirebase(() => (userProfile ? doc(firestore, 'employee_profiles', userProfile.uid) : null), [userProfile, firestore])
  );
  
  const { data: brands, isLoading: isLoadingBrands } = useCollection<Brand>(
    useMemoFirebase(() => collection(firestore, 'brands'), [firestore])
  );

  const sortedSubmissions = useMemo(() => {
    if (!submissions) return [];
    return [...submissions].sort((a,b) => (b.createdAt?.toMillis() || Date.now()) - (a.createdAt?.toMillis() || Date.now()));
  }, [submissions]);

  const handleCreate = () => {
    setSelectedRequest(null);
    setIsFormOpen(true);
  };
  
  const handleAction = (action: 'view' | 'edit', request: PermissionRequest) => {
    setSelectedRequest(request);
    setIsFormOpen(true);
  };

  const handleCancel = (request: PermissionRequest) => {
    setSelectedRequest(request);
    setIsDeleteDialogOpen(true);
  };

  const confirmCancel = async () => {
    if (!selectedRequest) return;
    try {
        await deleteDocumentNonBlocking(doc(firestore, 'permission_requests', selectedRequest.id!));
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
            <h1 className="text-2xl font-bold">Pengajuan Izin</h1>
            <p className="text-muted-foreground">Buat dan lacak status pengajuan izin Anda.</p>
          </div>
          <Button onClick={handleCreate}><PlusCircle className="mr-2 h-4 w-4"/> Buat Pengajuan</Button>
        </div>

        <Card>
            <CardHeader><CardTitle>Riwayat Pengajuan</CardTitle></CardHeader>
            <CardContent>
                <div className="rounded-lg border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Jenis Izin</TableHead>
                            <TableHead>Tanggal</TableHead>
                            <TableHead>Durasi</TableHead>
                            <TableHead>Update Terakhir</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Aksi</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sortedSubmissions.length > 0 ? sortedSubmissions.map(s => (
                            <TableRow key={s.id}>
                                <TableCell className="font-medium capitalize">{s.type.replace(/_/g, ' ')}</TableCell>
                                <TableCell>{format(s.startDate.toDate(), 'dd MMM yyyy', { locale: idLocale })}</TableCell>
                                <TableCell>{s.totalDurationMinutes} menit</TableCell>
                                <TableCell>{s.updatedAt?.toDate ? formatDistanceToNow(s.updatedAt.toDate(), { addSuffix: true, locale: idLocale }) : 'Baru saja'}</TableCell>
                                <TableCell><PermissionStatusBadge status={s.status} /></TableCell>
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
                        )) : (<TableRow><TableCell colSpan={6} className="h-24 text-center">Belum ada pengajuan izin.</TableCell></TableRow>)}
                    </TableBody>
                </Table>
                </div>
            </CardContent>
        </Card>
      </div>

      <PermissionRequestForm 
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        submission={selectedRequest}
        employeeProfile={employeeProfile}
        brands={brands || []}
        onSuccess={mutate}
      />
      
      <DeleteConfirmationDialog 
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        onConfirm={confirmCancel}
        itemName="pengajuan izin ini"
        itemType=""
      />
    </>
  );
}
