'use client';

import { useState, useMemo } from 'react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import type { OvertimeSubmission, UserProfile, Brand } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { KpiCard } from '@/components/recruitment/KpiCard';
import { ReviewOvertimeDialog } from './ReviewOvertimeDialog';
import { OVERTIME_SUBMISSION_STATUSES } from '@/lib/types';

interface OvertimeApprovalClientProps {
  mode: 'manager' | 'hrd';
}

const statusDisplay: Record<OvertimeSubmission['status'], { label: string; className: string }> = {
    draft: { label: 'Draf', className: 'bg-gray-100 text-gray-800' },
    pending_manager: { label: 'Menunggu Manager', className: 'bg-yellow-100 text-yellow-800' },
    rejected_manager: { label: 'Ditolak Manager', className: 'bg-red-200 text-red-900' },
    revision_manager: { label: 'Revisi dari Manager', className: 'bg-amber-100 text-amber-800' },
    pending_hrd: { label: 'Menunggu HRD', className: 'bg-blue-100 text-blue-800' },
    rejected_hrd: { label: 'Ditolak HRD', className: 'bg-red-200 text-red-900' },
    revision_hrd: { label: 'Revisi dari HRD', className: 'bg-amber-100 text-amber-800' },
    approved: { label: 'Disetujui', className: 'bg-green-100 text-green-800' },
};

export function OvertimeApprovalClient({ mode }: OvertimeApprovalClientProps) {
    const { userProfile } = useAuth();
    const firestore = useFirestore();

    const [brandFilter, setBrandFilter] = useState('all');
    const [divisionFilter, setDivisionFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState<OvertimeSubmission['status'] | 'all'>(mode === 'manager' ? 'pending_manager' : 'all');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedSubmission, setSelectedSubmission] = useState<OvertimeSubmission | null>(null);

    const submissionsQuery = useMemoFirebase(() => {
        if (!userProfile) return null;
        let q = query(collection(firestore, 'overtime_submissions'));

        if (mode === 'manager' && userProfile.isDivisionManager) {
            q = query(q, where('division', '==', userProfile.managedDivision), where('brandId', '==', userProfile.managedBrandId));
        } else if (mode === 'hrd') {
            // HRD can see things approved by manager or submitted by managers directly
            q = query(q, where('status', 'in', ['approved_by_manager', 'pending_hrd']));
        } else {
            // Return no results if a manager isn't a division manager
            return query(collection(firestore, 'overtime_submissions'), where('uid', '==', 'NO_RESULTS'));
        }
        
        return q;
    }, [userProfile, firestore, mode]);

    const { data: submissions, isLoading, mutate } = useCollection<OvertimeSubmission>(submissionsQuery);
    const { data: brands } = useCollection<Brand>(useMemoFirebase(() => collection(firestore, 'brands'), [firestore]));

    const filteredSubmissions = useMemo(() => {
        if (!submissions) return [];
        return submissions.filter(s => {
            if (brandFilter !== 'all' && s.brandId !== brandFilter) return false;
            if (divisionFilter !== 'all' && s.division !== divisionFilter) return false;
            if (statusFilter !== 'all' && s.status !== statusFilter) return false;
            if (searchTerm && !s.fullName.toLowerCase().includes(searchTerm.toLowerCase())) return false;
            return true;
        }).sort((a,b) => b.createdAt.toMillis() - a.createdAt.toMillis());
    }, [submissions, brandFilter, divisionFilter, statusFilter, searchTerm]);

    const divisions = useMemo(() => {
        if (!submissions) return [];
        return Array.from(new Set(submissions.map(s => s.division)));
    }, [submissions]);

    return (
        <div className="space-y-4">
             <div className="flex flex-wrap items-center gap-2">
                 <Select value={brandFilter} onValueChange={setBrandFilter} disabled={mode !== 'hrd'}>
                    <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="All Brands" /></SelectTrigger>
                    <SelectContent><SelectItem value="all">All Brands</SelectItem>{brands?.map(b => <SelectItem key={b.id!} value={b.id!}>{b.name}</SelectItem>)}</SelectContent>
                </Select>
                 <Select value={divisionFilter} onValueChange={setDivisionFilter} disabled={mode !== 'hrd'}>
                    <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="All Divisions" /></SelectTrigger>
                    <SelectContent><SelectItem value="all">All Divisions</SelectItem>{divisions?.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={(val) => setStatusFilter(val as any)}>
                    <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        {OVERTIME_SUBMISSION_STATUSES.map(s => <SelectItem key={s} value={s}>{statusDisplay[s]?.label || s}</SelectItem>)}
                    </SelectContent>
                </Select>
                <div className="relative flex-grow min-w-[200px]"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Cari nama..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-8" /></div>
            </div>
            
            <div className="rounded-lg border">
                <Table>
                    <TableHeader><TableRow><TableHead>Nama Karyawan</TableHead><TableHead>Tanggal Lembur</TableHead><TableHead>Durasi</TableHead><TableHead>Divisi</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Aksi</TableHead></TableRow></TableHeader>
                    <TableBody>
                        {isLoading ? <TableRow><TableCell colSpan={6} className="h-24 text-center">Loading...</TableCell></TableRow>
                        : filteredSubmissions.length > 0 ? filteredSubmissions.map(s => (
                            <TableRow key={s.id}>
                                <TableCell className="font-medium">{s.fullName}</TableCell>
                                <TableCell>{format(s.date.toDate(), 'eeee, dd MMM yyyy', { locale: idLocale })}</TableCell>
                                <TableCell>{s.totalDurationMinutes} menit</TableCell>
                                <TableCell>{s.division}</TableCell>
                                <TableCell><Badge className={statusDisplay[s.status]?.className}>{statusDisplay[s.status]?.label}</Badge></TableCell>
                                <TableCell className="text-right">
                                    <Button variant="outline" size="sm" onClick={() => setSelectedSubmission(s)}>Review</Button>
                                </TableCell>
                            </TableRow>
                        )) : <TableRow><TableCell colSpan={6} className="h-24 text-center">Tidak ada pengajuan yang ditemukan.</TableCell></TableRow>}
                    </TableBody>
                </Table>
            </div>

            {selectedSubmission && (
                <ReviewOvertimeDialog 
                    open={!!selectedSubmission}
                    onOpenChange={(open) => !open && setSelectedSubmission(null)}
                    submission={selectedSubmission}
                    onSuccess={mutate}
                    mode={mode}
                />
            )}
        </div>
    );
}
