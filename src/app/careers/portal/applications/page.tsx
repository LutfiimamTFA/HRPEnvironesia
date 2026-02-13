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
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

function ApplicationsTableSkeleton() {
    return (
        <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        {[...Array(5)].map((_, i) => <TableHead key={i}><Skeleton className="h-5 w-full" /></TableHead>)}
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
            orderBy('updatedAt', 'desc')
        );
    }, [userProfile, firestore]);

    const { data: applications, isLoading } = useCollection<JobApplication>(applicationsQuery);

    const getStatusBadge = (app: JobApplication) => {
        const isExpired = app.jobApplyDeadline && app.jobApplyDeadline.toDate() < new Date() && app.status === 'draft';
        if (isExpired) {
            return <Badge variant="destructive">Expired</Badge>;
        }
        
        const variants: Record<JobApplication['status'], 'default' | 'secondary' | 'destructive'> = {
            draft: 'secondary',
            submitted: 'default',
            reviewed: 'default',
            interview: 'default',
            hired: 'default', // Success variant would be better
            rejected: 'destructive',
        };

        return <Badge variant={variants[app.status] || 'secondary'} className="capitalize">{app.status}</Badge>;
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Lamaran Saya</CardTitle>
                <CardDescription>Riwayat lamaran pekerjaan yang telah Anda kirimkan atau simpan sebagai draf.</CardDescription>
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
                                    <TableHead>Status</TableHead>
                                    <TableHead>Batas Waktu</TableHead>
                                    <TableHead className="text-right">Tindakan</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {applications && applications.length > 0 ? (
                                    applications.map(app => {
                                        const isExpired = app.jobApplyDeadline && app.jobApplyDeadline.toDate() < new Date() && app.status === 'draft';
                                        const canContinue = app.status === 'draft' && !isExpired;

                                        return (
                                            <TableRow key={app.id}>
                                                <TableCell className="font-medium">{app.jobPosition}</TableCell>
                                                <TableCell>{app.brandName}</TableCell>
                                                <TableCell>
                                                    {getStatusBadge(app)}
                                                </TableCell>
                                                <TableCell>
                                                    {app.jobApplyDeadline?.toDate ? format(app.jobApplyDeadline.toDate(), 'dd MMM yyyy') : '-'}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {canContinue ? (
                                                        <Button asChild size="sm">
                                                            <Link href={`/careers/jobs/${app.jobSlug}/apply`}>
                                                                Lanjutkan
                                                                <ArrowRight className="ml-2 h-4 w-4" />
                                                            </Link>
                                                        </Button>
                                                    ) : (
                                                         <Button variant="outline" size="sm" disabled>
                                                            Lihat
                                                        </Button>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
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
