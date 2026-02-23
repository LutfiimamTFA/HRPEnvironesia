
'use client';

import { useMemo } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import type { JobApplication, ApplicationInterview } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link as LinkIcon, Calendar, Clock, Users, Building, Video } from "lucide-react";
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';

interface EnrichedInterview extends ApplicationInterview {
  application: JobApplication;
}

function InterviewCard({ interview }: { interview: EnrichedInterview }) {
    const isUpcoming = interview.startAt.toDate() > new Date();

    return (
        <Card>
            <CardHeader>
                <div className="flex justify-between items-start">
                    <div>
                        <CardTitle>{interview.application.jobPosition}</CardTitle>
                        <CardDescription className="flex items-center gap-2 pt-1"><Building className="h-4 w-4" /> {interview.application.brandName}</CardDescription>
                    </div>
                    {isUpcoming && <Badge>Akan Datang</Badge>}
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div className="flex items-start gap-3">
                        <Calendar className="h-5 w-5 mt-0.5 text-primary" />
                        <div>
                            <p className="font-semibold">Tanggal & Waktu</p>
                            <p>{format(interview.startAt.toDate(), 'eeee, dd MMMM yyyy', { locale: id })}</p>
                            <p>{format(interview.startAt.toDate(), 'HH:mm')} - {format(interview.endAt.toDate(), 'HH:mm')} WIB</p>
                        </div>
                    </div>
                     <div className="flex items-start gap-3">
                        <Users className="h-5 w-5 mt-0.5 text-primary" />
                        <div>
                            <p className="font-semibold">Pewawancara</p>
                            <p>{interview.interviewerNames.join(', ')}</p>
                        </div>
                    </div>
                </div>
                <div className="flex justify-end">
                    <Button asChild>
                        <a href={interview.meetingLink} target="_blank" rel="noopener noreferrer">
                            <LinkIcon className="mr-2 h-4 w-4" />
                            Buka Link Wawancara
                        </a>
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}

function InterviewsPageSkeleton() {
    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-5 w-80" />
            </div>
            <div className="space-y-4">
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-40 w-full" />
            </div>
        </div>
    );
}

export default function InterviewsPage() {
    const { userProfile, loading: authLoading } = useAuth();
    const firestore = useFirestore();

    const applicationsQuery = useMemoFirebase(() => {
        if (!userProfile?.uid) return null;
        return query(
            collection(firestore, 'applications'),
            where('candidateUid', '==', userProfile.uid),
            where('status', '==', 'interview')
        );
    }, [userProfile?.uid, firestore]);

    const { data: applications, isLoading: appsLoading } = useCollection<JobApplication>(applicationsQuery);

    const allInterviews = useMemo(() => {
        if (!applications) return [];
        
        const interviews: EnrichedInterview[] = [];
        applications.forEach(app => {
            if (app.interviews) {
                app.interviews.forEach(interview => {
                    if(interview.status === 'scheduled') {
                        interviews.push({ ...interview, application: app });
                    }
                });
            }
        });
        
        // Sort by start date, upcoming first
        return interviews.sort((a, b) => a.startAt.toDate().getTime() - b.startAt.toDate().getTime());
    }, [applications]);

    const isLoading = authLoading || appsLoading;
    
    if (isLoading) {
        return <InterviewsPageSkeleton />;
    }
    
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Jadwal Wawancara</h1>
                <p className="text-muted-foreground">Berikut adalah semua jadwal wawancara Anda yang akan datang atau yang telah lewat.</p>
            </div>

            {allInterviews.length > 0 ? (
                <div className="space-y-4">
                    {allInterviews.map((interview, index) => (
                        <InterviewCard key={`${interview.application.id}-${index}`} interview={interview} />
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
                        <p className="text-muted-foreground">Jadwal wawancara Anda akan muncul di sini setelah diatur oleh tim HRD.</p>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
