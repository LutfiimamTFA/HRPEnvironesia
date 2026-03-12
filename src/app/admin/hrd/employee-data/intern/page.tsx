'use client';

import { useMemo, useState } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { MENU_CONFIG } from '@/lib/menu-config';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import type { EmployeeProfile, UserProfile } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Eye, Search } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { InternProfileDetailDialog } from '@/components/dashboard/hrd/InternProfileDetailDialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
    const [activeTab, setActiveTab] = useState('intern_education');
    const [selectedProfile, setSelectedProfile] = useState<(UserProfile & Partial<EmployeeProfile>) | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);

    const menuConfig = useMemo(() => {
        if (!userProfile) return [];
        return MENU_CONFIG[userProfile.role] || [];
    }, [userProfile]);

    // 1. Fetch all users who are interns (Source of Truth)
    const { data: internUsers, isLoading: usersLoading } = useCollection<UserProfile>(
        useMemoFirebase(() => query(collection(firestore, 'users'), where('employmentType', '==', 'magang')), [firestore])
    );

    // 2. Fetch all employee profiles to merge with
    const { data: employeeProfiles, isLoading: profilesLoading, mutate } = useCollection<EmployeeProfile>(
        useMemoFirebase(() => collection(firestore, 'employee_profiles'), [firestore])
    );
    
    // 3. Merge the two data sources
    const processedProfiles = useMemo(() => {
        if (!internUsers) return [];
        const profilesMap = new Map(employeeProfiles?.map(p => [p.uid, p]));
        
        return internUsers.map(user => {
            const profileData = profilesMap.get(user.uid);
            return {
                ...user, // Base data from 'users'
                ...profileData, // Detailed data from 'employee_profiles' (overwrites if present)
            };
        });
    }, [internUsers, employeeProfiles]);

    const filteredProfiles = useMemo(() => {
        if (!processedProfiles) return [];
        return processedProfiles.filter(profile => {
            const searchMatch = searchTerm === '' || profile.fullName.toLowerCase().includes(searchTerm.toLowerCase()) || profile.email.toLowerCase().includes(searchTerm.toLowerCase());
            // Use employmentStage from the user object as the primary subtype filter
            const subtypeMatch = profile.employmentStage === activeTab;
            return searchMatch && subtypeMatch;
        });
    }, [processedProfiles, searchTerm, activeTab]);

    const handleViewDetails = (profile: UserProfile & Partial<EmployeeProfile>) => {
        setSelectedProfile(profile);
        setIsDetailOpen(true);
    };

    if (!hasAccess) {
        return <DashboardLayout pageTitle="Data Diri Intern" menuConfig={menuConfig}><InternTableSkeleton /></DashboardLayout>;
    }

    return (
        <DashboardLayout pageTitle="Data Diri Intern" menuConfig={menuConfig}>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <div className="flex justify-between items-center mb-4">
                    <TabsList>
                        <TabsTrigger value="intern_education">Terikat Pendidikan</TabsTrigger>
                        <TabsTrigger value="intern_pre_probation">Pra-Probation</TabsTrigger>
                    </TabsList>
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Cari nama atau email..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full sm:w-[250px] pl-8" />
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
                            {usersLoading || profilesLoading ? (
                                <TableRow><TableCell colSpan={7} className="h-24 text-center">Memuat data...</TableCell></TableRow>
                            ) : filteredProfiles.length > 0 ? (
                                filteredProfiles.map(profile => (
                                    <TableRow key={profile.uid}>
                                        <TableCell className="font-medium">{profile.fullName}</TableCell>
                                        <TableCell>{profile.email}</TableCell>
                                        <TableCell>
                                            <Badge variant={profile.employmentStage === 'intern_education' ? 'default' : 'secondary'}>
                                                {subtypeLabels[profile.employmentStage || ''] || 'N/A'}
                                            </Badge>
                                        </TableCell>
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
            </Tabs>
            {selectedProfile && (
                <InternProfileDetailDialog
                    profile={selectedProfile as EmployeeProfile} // Cast for the dialog, which expects the detailed profile
                    open={isDetailOpen}
                    onOpenChange={setIsDetailOpen}
                    onAdminDataChange={mutate}
                />
            )}
        </DashboardLayout>
    );
}
