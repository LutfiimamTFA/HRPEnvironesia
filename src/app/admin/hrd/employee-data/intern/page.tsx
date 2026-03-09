'use client';

import { useMemo, useState } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { MENU_CONFIG } from '@/lib/menu-config';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import type { EmployeeProfile } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Eye, Search } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { InternProfileDetailDialog } from '@/components/dashboard/hrd/InternProfileDetailDialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function InternTableSkeleton() {
    return (
        <div className="space-y-4">
            <div className="flex justify-between">
                <Skeleton className="h-10 w-64" />
            </div>
            <Skeleton className="h-96 w-full" />
        </div>
    )
}

const subtypeLabels: Record<string, string> = {
    'intern_education': 'Terikat Pendidikan',
    'intern_pre_probation': 'Pra-Probation'
}

export default function InternDataPage() {
    const { userProfile } = useAuth();
    const hasAccess = useRoleGuard(['hrd', 'super-admin']);
    const firestore = useFirestore();
    const [searchTerm, setSearchTerm] = useState('');
    const [subtypeFilter, setSubtypeFilter] = useState('all');
    const [selectedProfile, setSelectedProfile] = useState<EmployeeProfile | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);

    const menuConfig = useMemo(() => {
        if (!userProfile) return [];
        return MENU_CONFIG[userProfile.role] || [];
    }, [userProfile]);

    const { data: profiles, isLoading: profilesLoading } = useCollection<EmployeeProfile>(
        useMemoFirebase(() => query(collection(firestore, 'employee_profiles'), where('employmentType', '==', 'magang')), [firestore])
    );
    
    const filteredProfiles = useMemo(() => {
        if (!profiles) return [];
        return profiles.filter(profile => {
            const searchMatch = searchTerm === '' || profile.fullName.toLowerCase().includes(searchTerm.toLowerCase()) || profile.email.toLowerCase().includes(searchTerm.toLowerCase());
            const subtypeMatch = subtypeFilter === 'all' || profile.internSubtype === subtypeFilter;
            return searchMatch && subtypeMatch;
        });
    }, [profiles, searchTerm, subtypeFilter]);

    const handleViewDetails = (profile: EmployeeProfile) => {
        setSelectedProfile(profile);
        setIsDetailOpen(true);
    };

    if (!hasAccess) {
        return <DashboardLayout pageTitle="Data Diri Intern" menuConfig={menuConfig}><InternTableSkeleton /></DashboardLayout>;
    }

    return (
        <DashboardLayout pageTitle="Data Diri Intern" menuConfig={menuConfig}>
            <div className="flex justify-between items-center mb-4">
                 <div className="flex items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Cari nama atau email..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full sm:w-[250px] pl-8" />
                    </div>
                    <Select value={subtypeFilter} onValueChange={setSubtypeFilter}>
                        <SelectTrigger className="w-[200px]">
                            <SelectValue placeholder="Semua Tipe" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Semua Tipe</SelectItem>
                            <SelectItem value="intern_education">Terikat Pendidikan</SelectItem>
                            <SelectItem value="intern_pre_probation">Pra-Probation</SelectItem>
                        </SelectContent>
                    </Select>
                 </div>
            </div>

            <div className="rounded-lg border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Nama</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Tipe Magang</TableHead>
                            <TableHead>Asal Sekolah/Kampus</TableHead>
                            <TableHead>Status Profil</TableHead>
                            <TableHead>Update Terakhir</TableHead>
                            <TableHead className="text-right">Aksi</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {profilesLoading ? (
                            <TableRow><TableCell colSpan={7} className="h-24 text-center">Memuat data...</TableCell></TableRow>
                        ) : filteredProfiles.length > 0 ? (
                            filteredProfiles.map(profile => (
                                <TableRow key={profile.uid}>
                                    <TableCell className="font-medium">{profile.fullName}</TableCell>
                                    <TableCell>{profile.email}</TableCell>
                                    <TableCell>{subtypeLabels[profile.internSubtype!] || profile.internSubtype || '-'}</TableCell>
                                    <TableCell>{profile.schoolOrCampus || '-'}</TableCell>
                                    <TableCell><Badge variant={profile.completeness?.isComplete ? 'default' : 'secondary'}>{profile.completeness?.isComplete ? 'Lengkap' : 'Draf'}</Badge></TableCell>
                                    <TableCell>
                                        {profile.updatedAt ? format(profile.updatedAt.toDate(), 'dd MMM yyyy, HH:mm') : '-'}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="sm" onClick={() => handleViewDetails(profile)}>
                                            <Eye className="mr-2 h-4 w-4" /> Detail
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow><TableCell colSpan={7} className="h-24 text-center">Tidak ada data untuk filter ini.</TableCell></TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
            {selectedProfile && (
                <InternProfileDetailDialog
                    profile={selectedProfile}
                    open={isDetailOpen}
                    onOpenChange={setIsDetailOpen}
                />
            )}
        </DashboardLayout>
    );
}
