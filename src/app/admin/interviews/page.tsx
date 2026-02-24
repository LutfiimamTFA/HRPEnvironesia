'use client';

import { useMemo, useState } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import type { JobApplication, ApplicationInterview, UserProfile, Brand } from '@/lib/types';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { MENU_CONFIG } from '@/lib/menu-config';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, Link as LinkIcon, Video, Users, MoreHorizontal, Briefcase } from 'lucide-react';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { ManagePanelistsDialog } from '@/components/recruitment/ManagePanelistsDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';


// Interface to hold processed interview data for display
interface EnrichedInterview extends ApplicationInterview {
  application: JobApplication;
}

// Reusable Interview Card Component
function InterviewCard({ interview, allUsers, allBrands, currentUser, onMutate }: { interview: EnrichedInterview; allUsers: UserProfile[]; allBrands: Brand[]; currentUser: UserProfile; onMutate: () => void }) {
    const isUpcoming = interview.startAt.toDate() > new Date();
    const [isManagePanelistsOpen, setIsManagePanelistsOpen] = useState(false);

    const currentInterviewInApp = interview.application.interviews?.find(iv => iv.interviewId === interview.interviewId);

    return (
        <>
            <Card className="flex flex-col">
                <CardHeader>
                    <div className="flex justify-between items-start gap-4">
                        <div>
                            <CardTitle className="text-lg">{interview.application.candidateName}</CardTitle>
                            <CardDescription>{interview.application.jobPosition}</CardDescription>
                        </div>
                        {isUpcoming ? (
                            <Badge>Akan Datang</Badge>
                        ) : (
                            <Badge variant="secondary">Telah Lewat</Badge>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm flex-grow">
                    <div className="flex items-start gap-3">
                        <Calendar className="h-5 w-5 mt-0.5 text-primary" />
                        <div>
                            <p className="font-semibold">{format(interview.startAt.toDate(), 'eeee, dd MMMM yyyy', { locale: id })}</p>
                            <p>{format(interview.startAt.toDate(), 'HH:mm')} - {format(interview.endAt.toDate(), 'HH:mm')} WIB</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-3">
                        <Users className="h-5 w-5 mt-0.5 text-primary" />
                        <div>
                            <p className="font-semibold">Pewawancara</p>
                            <p>{(interview.panelistNames || interview.interviewerNames || []).join(', ')}</p>
                        </div>
                    </div>
                </CardContent>
                <CardFooter className="flex flex-row justify-end items-center gap-2 pt-4 border-t">
                    {isUpcoming && (
                        <Button asChild size="sm" className="flex-grow sm:flex-grow-0">
                            <a href={interview.meetingLink} target="_blank" rel="noopener noreferrer">
                                <LinkIcon className="mr-2 h-4 w-4" />
                                Buka Link
                            </a>
                        </Button>
                    )}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-9 w-9">
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            {['super-admin', 'hrd'].includes(currentUser.role) && (
                                <DropdownMenuItem onSelect={() => setIsManagePanelistsOpen(true)}>
                                    <Users className="mr-2 h-4 w-4" />
                                    <span>Kelola Panelis</span>
                                </DropdownMenuItem>
                            )}
                            <DropdownMenuItem asChild>
                                <Link href={`/admin/interviews/${interview.application.id}`}>
                                    <Briefcase className="mr-2 h-4 w-4" />
                                    <span>Buka Interview Kit</span>
                                </Link>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </CardFooter>
            </Card>
            {currentInterviewInApp && currentUser && (
                 <ManagePanelistsDialog
                    open={isManagePanelistsOpen}
                    onOpenChange={setIsManagePanelistsOpen}
                    application={interview.application}
                    interview={currentInterviewInApp}
                    currentUser={currentUser}
                    allUsers={allUsers}
                    allBrands={allBrands}
                    onSuccess={onMutate}
                />
            )}
        </>
    );
}

// Skeleton for loading state
function InterviewsPageSkeleton() {
    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-5 w-80" />
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-48 w-full" />
            </div>
        </div>
    );
}

// Main page component
export default function MyInterviewsPage() {
    const hasAccess = useRoleGuard(['super-admin', 'hrd', 'manager', 'karyawan']);
    const { userProfile, loading: authLoading } = useAuth();
    const firestore = useFirestore();

    const interviewsQuery = useMemoFirebase(() => {
        if (!userProfile) return null;
        // HRD and Super Admins see all interviews with status 'interview'
        if (['super-admin', 'hrd'].includes(userProfile.role)) {
            return query(
                collection(firestore, 'applications'),
                where('status', '==', 'interview')
            );
        }
        // Others only see interviews they are a panelist for
        return query(
            collection(firestore, 'applications'),
            where('allPanelistIds', 'array-contains', userProfile.uid)
        );
    }, [userProfile, firestore]);

    const { data: applications, isLoading: appsLoading, mutate } = useCollection<JobApplication>(interviewsQuery);
    
    const internalUsersQuery = useMemoFirebase(() => {
        if (!userProfile || !['super-admin', 'hrd'].includes(userProfile.role)) return null;
        return query(
            collection(firestore, 'users'),
            where('role', 'in', ['hrd', 'manager', 'karyawan', 'super-admin']),
            where('isActive', '==', true)
        );
    }, [firestore, userProfile]);

    const { data: internalUsers, isLoading: isLoadingUsers } = useCollection<UserProfile>(internalUsersQuery);
    const { data: brands, isLoading: isLoadingBrands } = useCollection<Brand>(useMemoFirebase(() => collection(firestore, 'brands'), [firestore]));

    const allInterviews = useMemo(() => {
        if (!applications || !userProfile) return [];

        const interviews: EnrichedInterview[] = [];
        applications.forEach(app => {
            if (app.interviews) {
                app.interviews.forEach(interview => {
                    const isPanelist = (interview.panelistIds && interview.panelistIds.includes(userProfile.uid)) || (interview.interviewerIds && interview.interviewerIds.includes(userProfile.uid));

                    if (['super-admin', 'hrd'].includes(userProfile.role) || isPanelist) {
                        if (interview.status === 'scheduled' || interview.status === 'reschedule_requested' || interview.status === 'completed') {
                            interviews.push({ ...interview, application: app });
                        }
                    }
                });
            }
        });
        
        // Sort interviews: upcoming first, then past ones most recent first
        return interviews.sort((a, b) => {
            const aTime = a.startAt.toDate().getTime();
            const bTime = b.startAt.toDate().getTime();
            const now = new Date().getTime();
            const aIsUpcoming = aTime >= now;
            const bIsUpcoming = bTime >= now;
            if (aIsUpcoming && !bIsUpcoming) return -1;
            if (!aIsUpcoming && bIsUpcoming) return 1;
            if (aIsUpcoming) return aTime - bTime; // Upcoming ascending
            return bTime - aTime; // Past descending
        });
    }, [applications, userProfile]);

    const menuConfig = useMemo(() => {
        if (!userProfile) return [];
        return MENU_CONFIG[userProfile.role] || [];
    }, [userProfile]);

    const isLoading = authLoading || appsLoading || isLoadingUsers || isLoadingBrands;

    if (!hasAccess || isLoading) {
        return (
            <DashboardLayout pageTitle="Wawancara Saya" menuConfig={menuConfig}>
                <InterviewsPageSkeleton />
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout pageTitle="Wawancara Saya" menuConfig={menuConfig}>
            <div className="space-y-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Jadwal Wawancara Saya</h1>
                    <p className="text-muted-foreground">
                        Berikut adalah semua jadwal wawancara di mana Anda terdaftar sebagai panelis.
                    </p>
                </div>

                {allInterviews.length > 0 ? (
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {allInterviews.map((interview, index) => (
                           <InterviewCard 
                                key={`${interview.application.id}-${interview.interviewId || index}`} 
                                interview={interview} 
                                allUsers={internalUsers || []}
                                allBrands={brands || []}
                                currentUser={userProfile!}
                                onMutate={mutate}
                           />
                        ))}
                    </div>
                ) : (
                    <Card className="h-64 flex flex-col items-center justify-center text-center">
                        <CardHeader>
                            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                                <Video className="h-6 w-6 text-muted-foreground" />
                            </div>
                            <CardTitle className="mt-4">Belum Ada Jadwal Wawancara</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-muted-foreground">
                                Jadwal wawancara Anda akan muncul di sini setelah diatur oleh tim HRD.
                            </p>
                        </CardContent>
                    </Card>
                )}
            </div>
        </DashboardLayout>
    );
}
