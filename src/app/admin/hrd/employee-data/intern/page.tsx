'use client';

import { useMemo, useState } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { MENU_CONFIG } from '@/lib/menu-config';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import type { UserProfile, Brand } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from '@/components/ui/badge';
import { Search } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

function InternTableSkeleton() {
    return (
        <div className="space-y-4">
            <div className="flex justify-between">
                <Skeleton className="h-10 w-64" />
                <Skeleton className="h-10 w-48" />
            </div>
            <Skeleton className="h-96 w-full" />
        </div>
    )
}

const stageLabels: Record<string, string> = {
    intern_education: 'Terikat Pendidikan',
    intern_pre_probation: 'Pra-Probation',
};

export default function InternDataPage() {
    const { userProfile } = useAuth();
    const hasAccess = useRoleGuard(['hrd', 'super-admin']);
    const firestore = useFirestore();
    
    const [activeTab, setActiveTab] = useState('intern_education');
    const [brandFilter, setBrandFilter] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');

    const menuConfig = useMemo(() => {
        if (!userProfile) return [];
        return MENU_CONFIG[userProfile.role] || [];
    }, [userProfile]);

    const { data: users, isLoading: usersLoading } = useCollection<UserProfile>(
        useMemoFirebase(() => query(collection(firestore, 'users'), where('employmentType', '==', 'magang')), [firestore])
    );
    
    const { data: brands, isLoading: brandsLoading } = useCollection<Brand>(
        useMemoFirebase(() => collection(firestore, 'brands'), [firestore])
    );

    const brandMap = useMemo(() => {
        if (!brands) return new Map<string, string>();
        return new Map(brands.map(b => [b.id!, b.name]));
    }, [brands]);

    const filteredUsers = useMemo(() => {
        if (!users) return [];
        return users.filter(user => {
            const userStage = user.employmentStage || 'intern_education'; // Fallback for older data
            const brandMatch = brandFilter === 'all' || (Array.isArray(user.brandId) ? user.brandId.includes(brandFilter) : user.brandId === brandFilter);
            const searchMatch = searchTerm === '' || user.fullName.toLowerCase().includes(searchTerm.toLowerCase()) || user.email.toLowerCase().includes(searchTerm.toLowerCase());
            return userStage === activeTab && brandMatch && searchMatch;
        });
    }, [users, activeTab, brandFilter, searchTerm]);

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
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Cari nama atau email..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full sm:w-[250px] pl-8" />
                        </div>
                        <Select value={brandFilter} onValueChange={setBrandFilter} disabled={brandsLoading}>
                            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Semua Brand" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Semua Brand</SelectItem>
                                {brands?.map(b => <SelectItem key={b.id!} value={b.id!}>{b.name}</SelectItem>)}
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
                                <TableHead>Brand</TableHead>
                                <TableHead>Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {usersLoading ? (
                                <TableRow><TableCell colSpan={4} className="h-24 text-center">Memuat data...</TableCell></TableRow>
                            ) : filteredUsers.length > 0 ? (
                                filteredUsers.map(user => (
                                    <TableRow key={user.uid}>
                                        <TableCell className="font-medium">{user.fullName}</TableCell>
                                        <TableCell>{user.email}</TableCell>
                                        <TableCell>{Array.isArray(user.brandId) ? user.brandId.map(id => brandMap.get(id)).join(', ') : brandMap.get(user.brandId as string) || '-'}</TableCell>
                                        <TableCell><Badge variant="secondary">{stageLabels[activeTab]}</Badge></TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow><TableCell colSpan={4} className="h-24 text-center">Tidak ada data untuk filter ini.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </Tabs>
        </DashboardLayout>
    );
}