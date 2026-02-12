'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where, limit } from 'firebase/firestore';
import type { Job } from '@/lib/types';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Briefcase, Building, Calendar, ChevronRight, LocateFixed, MapPin, Sparkles } from 'lucide-react';
import DOMPurify from 'dompurify';
import { format } from 'date-fns';
import { useAuth } from '@/providers/auth-provider';
import { ROLES_INTERNAL } from '@/lib/types';
import { Separator } from '@/components/ui/separator';

function JobDetailSkeleton() {
    return (
        <div className="container mx-auto max-w-6xl px-4 py-8 md:py-12">
            <div className="mb-8">
                <Skeleton className="h-6 w-1/4" />
            </div>
            <div className="grid grid-cols-1 gap-12 lg:grid-cols-3">
                <div className="lg:col-span-2">
                    <Skeleton className="mb-4 h-12 w-3/4" />
                    <Skeleton className="mb-8 h-6 w-1/2" />
                    <Skeleton className="mb-8 h-px w-full" />
                    <Skeleton className="mb-6 h-8 w-48" />
                    <Skeleton className="mb-4 h-5 w-full" />
                    <Skeleton className="mb-4 h-5 w-5/6" />
                    <Skeleton className="h-5 w-4/5" />
                </div>
                <div className="space-y-6">
                    <Skeleton className="h-40 w-full" />
                    <Skeleton className="h-64 w-full" />
                </div>
            </div>
        </div>
    )
}

const OtherJobCard = ({ job }: { job: Job }) => (
    <Link href={`/careers/jobs/${job.slug}`} className="block transition-transform duration-200 hover:-translate-y-1">
        <Card className="flex h-full flex-col overflow-hidden shadow-sm transition-shadow hover:shadow-lg">
            <CardHeader className="flex-grow p-4">
                <CardTitle className="text-base font-semibold leading-tight">{job.position}</CardTitle>
                <CardDescription className="mt-1 text-xs">{job.brandName}</CardDescription>
            </CardHeader>
            <CardFooter className="p-4 pt-0">
                <Button variant="outline" size="sm" className="w-full">
                    View Details
                    <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
            </CardFooter>
        </Card>
    </Link>
);


const RichTextSection = ({ title, htmlContent, icon }: { title: string, htmlContent: string, icon: React.ReactNode }) => {
    const [sanitizedHtml, setSanitizedHtml] = useState('');

    useEffect(() => {
        if (typeof window !== 'undefined') {
            setSanitizedHtml(DOMPurify.sanitize(htmlContent));
        }
    }, [htmlContent]);
    
    if (!sanitizedHtml) return null;

    return (
        <section>
            <h2 className="mb-4 flex items-center gap-2 text-xl font-bold tracking-tight text-foreground md:text-2xl">
                {icon}
                {title}
            </h2>
            <div
                className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-semibold prose-a:text-primary prose-li:my-1"
                dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
            />
        </section>
    );
};

export default function JobDetailPage() {
    const params = useParams();
    const slug = params.slug as string;
    const router = useRouter();
    const firestore = useFirestore();
    const { userProfile, loading: authLoading } = useAuth();

    const isInternalUser = !authLoading && userProfile && ROLES_INTERNAL.includes(userProfile.role);

    const jobQuery = useMemoFirebase(() => {
        if (!slug) return null;
        const jobsCollection = collection(firestore, 'jobs');
        
        let q = query(jobsCollection, where('slug', '==', slug), limit(1));

        if (!isInternalUser) {
            q = query(q, where('publishStatus', '==', 'published'));
        }
        
        return q;
    }, [firestore, slug, isInternalUser]);


    const { data: jobs, isLoading: isLoadingJob } = useCollection<Job>(jobQuery);
    const job = jobs?.[0];
    
    const otherJobsQuery = useMemoFirebase(() => {
        if (!firestore || !job) return null;
        return query(
            collection(firestore, 'jobs'),
            where('publishStatus', '==', 'published'),
            where('slug', '!=', job.slug),
            limit(3)
        );
    }, [firestore, job]);

    const { data: otherJobs } = useCollection<Job>(otherJobsQuery);

    const isLoading = authLoading || isLoadingJob;

    if (isLoading) {
        return <JobDetailSkeleton />;
    }

    if (!job) {
        return (
            <div className="flex h-screen flex-col items-center justify-center text-center">
                <h2 className="text-2xl font-bold">Lowongan tidak ditemukan</h2>
                <p className="text-muted-foreground mt-2">Lowongan yang Anda cari mungkin sudah ditutup atau tidak ada.</p>
                <Button asChild className="mt-6">
                    <Link href="/careers">
                        <ArrowLeft className="mr-2 h-4 w-4" /> Kembali ke Halaman Karir
                    </Link>
                </Button>
            </div>
        );
    }

    return (
        <>
            <header className="border-b bg-background">
              <div className="container mx-auto flex h-14 max-w-6xl items-center px-4">
                <Button variant="ghost" size="sm" onClick={() => router.back()} className="mr-4">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Kembali
                </Button>
                 <div className="text-sm text-muted-foreground">
                    <Link href="/careers" className="hover:text-primary">Karir</Link>
                    <ChevronRight className="mx-1 inline-block h-4 w-4" />
                    <span className="font-medium text-foreground">{job.position}</span>
                </div>
              </div>
            </header>

            <main className="bg-secondary/50">
                <div className="container mx-auto max-w-6xl px-4 py-8 md:py-12">
                     {job.coverImageUrl && (
                        <div className="relative mb-8 h-48 w-full overflow-hidden rounded-xl shadow-sm md:h-64 lg:h-80">
                            <Image 
                                src={job.coverImageUrl} 
                                alt={`${job.position} cover image`} 
                                fill 
                                className="object-cover"
                                priority
                            />
                        </div>
                    )}
                    
                    <div className="grid grid-cols-1 gap-x-12 gap-y-8 lg:grid-cols-3">
                        {/* Main Content */}
                        <div className="lg:col-span-2">
                             <div className="flex flex-col-reverse justify-between gap-4 md:flex-row md:items-start">
                                <div>
                                    <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">{job.position}</h1>
                                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-muted-foreground">
                                        <span className="flex items-center gap-1.5"><Building className="h-4 w-4"/> {job.brandName}</span>
                                        <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4"/> {job.location}</span>
                                        <span className="flex items-center gap-1.5 capitalize"><Briefcase className="h-4 w-4"/> {job.statusJob}</span>
                                    </div>
                                </div>
                             </div>
                             
                             <Separator className="my-8" />

                             <div className="space-y-10">
                                <RichTextSection 
                                    title="Kualifikasi Umum" 
                                    htmlContent={job.generalRequirementsHtml}
                                    icon={<Sparkles className="h-5 w-5 text-primary"/>} 
                                />
                                <RichTextSection 
                                    title="Kualifikasi Khusus"
                                    htmlContent={job.specialRequirementsHtml}
                                    icon={<LocateFixed className="h-5 w-5 text-primary"/>}
                                />
                             </div>
                        </div>

                        {/* Sidebar */}
                        <aside className="space-y-6 lg:sticky lg:top-20 lg:self-start">
                            <Card className="shadow-md">
                                <CardHeader>
                                    <CardTitle className="text-xl">Lamar Posisi Ini</CardTitle>
                                </CardHeader>
                                <CardContent className="grid grid-cols-[max-content_1fr] items-center gap-x-4 gap-y-2 text-sm">
                                    <span className="font-semibold text-foreground">Divisi</span>
                                    <span className="text-muted-foreground">{job.division}</span>

                                    <span className="font-semibold text-foreground">Tipe</span>
                                    <span className="capitalize text-muted-foreground">{job.statusJob}</span>

                                    <span className="font-semibold text-foreground">Lokasi</span>
                                    <span className="text-muted-foreground">{job.location}</span>
                                    
                                    {job.workMode && <>
                                        <span className="font-semibold text-foreground">Mode</span>
                                        <span className="capitalize text-muted-foreground">{job.workMode}</span>
                                    </>}
                                </CardContent>
                                <CardFooter className="flex-col items-stretch gap-2">
                                     {job.applyDeadline && (
                                        <p className="mb-2 flex items-center justify-center gap-1.5 text-center text-xs font-medium text-destructive">
                                            <Calendar className="h-3 w-3"/> Lamar sebelum {format(job.applyDeadline.toDate(), 'dd MMM yyyy')}
                                        </p>
                                    )}
                                    <Button size="lg" asChild className="w-full">
                                        <Link href="/careers/login">Lamar Sekarang</Link>
                                    </Button>
                                </CardFooter>
                            </Card>

                             {otherJobs && otherJobs.length > 0 && (
                                <Card>
                                     <CardHeader>
                                        <CardTitle className="text-xl">Lowongan Lainnya</CardTitle>
                                    </CardHeader>
                                    <CardContent className="grid grid-cols-1 gap-4">
                                        {otherJobs.map((otherJob) => (
                                            <OtherJobCard key={otherJob.id} job={otherJob} />
                                        ))}
                                    </CardContent>
                                </Card>
                            )}
                        </aside>
                    </div>
                </div>
            </main>
            
            {/* Mobile Sticky CTA */}
            <div className="sticky bottom-0 z-40 border-t bg-background/95 p-4 backdrop-blur md:hidden">
                {job.applyDeadline && (
                    <p className="mb-2 text-center text-xs text-destructive">
                        Lamar sebelum {format(job.applyDeadline.toDate(), 'dd MMM yyyy')}
                    </p>
                )}
                <Button size="lg" asChild className="w-full">
                    <Link href="/careers/login">Lamar Sekarang</Link>
                </Button>
            </div>
        </>
    );
}
