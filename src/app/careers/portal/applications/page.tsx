'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from '@/providers/auth-provider';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, orderBy, query, where } from 'firebase/firestore';
import type { JobApplication } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { MapPin } from "lucide-react";

function ApplicationsTableSkeleton() {
    return (
        <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        {[...Array(5)].map((_, i) => <TableHead key={i}><Skeleton className="h-5 w-20" /></TableHead>)}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {[...Array(3)].map((_, i) => (
                        <TableRow key={i}>
                            {[...Array(5)].map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

export default function ApplicationsPage() {
    const { userProfile } = useAuth();
    const firestore = useFirestore();

    const applicationsQuery = useMemoFirebase(() => {
        if (!userProfile) return null;
        return query(
            collection(firestore, 'applications'),
            where('candidateUid', '==', userProfile.uid),
            orderBy('createdAt', 'desc')
        );
    }, [userProfile, firestore]);

    const { data: applications, isLoading } = useCollection<JobApplication>(applicationsQuery);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Lamaran Saya</CardTitle>
                <CardDescription>Riwayat lamaran pekerjaan yang telah Anda kirimkan.</CardDescription>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <ApplicationsTableSkeleton />
                ) : (
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Posisi</TableHead>
                                    <TableHead>Perusahaan</TableHead>
                                    <TableHead>Lokasi</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Tanggal Dibuat</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {applications && applications.length > 0 ? (
                                    applications.map(app => (
                                        <TableRow key={app.id}>
                                            <TableCell className="font-medium">{app.jobPosition}</TableCell>
                                            <TableCell>{app.brandName}</TableCell>
                                            <TableCell className="text-muted-foreground flex items-center gap-1.5">
                                                <MapPin className="h-4 w-4" />
                                                {app.location}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={app.status === 'draft' ? 'secondary' : 'default'} className="capitalize">
                                                    {app.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                {app.createdAt?.toDate ? format(app.createdAt.toDate(), 'dd MMM yyyy') : 'Baru Saja'}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                            Anda belum pernah melamar pekerjaan.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
