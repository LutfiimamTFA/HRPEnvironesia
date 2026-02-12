
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
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Briefcase, Building, Calendar, LocateFixed, MapPin, Sparkles } from 'lucide-react';
import DOMPurify from 'dompurify';

function JobDetailSkeleton() {
    return (
        <div className="container mx-auto max-w-4xl py-12">
            <Skeleton className="h-8 w-40 mb-8" />
            <Skeleton className="h-10 w-3/4 mb-4" />
            <div className="flex items-center gap-4 mb-8">
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-6 w-24" />
            </div>
            <Skeleton className="aspect-video w-full rounded-lg mb-8" />
            <div className="grid md:grid-cols-3 gap-8">
                <div className="md:col-span-2 space-y-8">
                    <Skeleton className="h-48 w-full" />
                    <Skeleton className="h-48 w-full" />
                </div>
                <div className="space-y-4">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-24 w-full" />
                </div>
            </div>
        </div>
    )
}

export default function JobDetailPage() {
    const params = useParams();
    const slug = params.slug as string;
    const router = useRouter();
    const firestore = useFirestore();

    const [sanitizedGeneral, setSanitizedGeneral] = useState('');
    const [sanitizedSpecial, setSanitizedSpecial] = useState('');

    const jobQuery = useMemoFirebase(
        () => slug ? query(collection(firestore, 'jobs'), where('slug', '==', slug), limit(1)) : null,
        [firestore, slug]
    );

    const { data: jobs, isLoading } = useCollection<Job>(jobQuery);
    const job = jobs?.[0];

    useEffect(() => {
        if (job?.generalRequirementsHtml) {
            setSanitizedGeneral(DOMPurify.sanitize(job.generalRequirementsHtml));
        }
        if (job?.specialRequirementsHtml) {
            setSanitizedSpecial(DOMPurify.sanitize(job.specialRequirementsHtml));
        }
    }, [job]);

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
        <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur">
          <div className="container flex h-14 items-center">
            <Button variant="outline" size="sm" onClick={() => router.back()}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Kembali
            </Button>
          </div>
        </header>
        <main className="bg-secondary py-12 md:py-16">
            <div className="container mx-auto max-w-5xl">
                <div className="rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden">
                    {job.coverImageUrl && (
                        <div className="relative h-48 w-full md:h-64">
                            <Image src={job.coverImageUrl} alt={`${job.position} cover image`} layout="fill" objectFit="cover" />
                        </div>
                    )}
                    <div className="p-6 md:p-8">
                        <div className="md:flex justify-between items-start">
                             <div>
                                <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{job.position}</h1>
                                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-muted-foreground">
                                    <span className="flex items-center gap-1.5"><Building className="h-4 w-4"/> {job.brandName}</span>
                                    <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4"/> {job.location}</span>
                                    <span className="flex items-center gap-1.5 capitalize"><Briefcase className="h-4 w-4"/> {job.statusJob}</span>
                                </div>
                             </div>
                             <div className="mt-4 md:mt-0 md:text-right flex-shrink-0">
                                <Button size="lg" asChild>
                                    <Link href="/careers/login">Lamar Sekarang</Link>
                                </Button>
                                {job.applyDeadline && (
                                    <p className="text-xs text-muted-foreground mt-2 flex items-center justify-end gap-1.5">
                                        <Calendar className="h-3 w-3"/> Lamar sebelum {new Date(job.applyDeadline.seconds * 1000).toLocaleDateString()}
                                    </p>
                                )}
                             </div>
                        </div>

                        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-8">
                            <div className="md:col-span-2 prose prose-sm max-w-none dark:prose-invert prose-headings:font-semibold prose-headings:tracking-tight prose-a:text-primary">
                                <div>
                                    <h2 className="text-xl font-semibold flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary"/> Kualifikasi Umum</h2>
                                    <div className="mt-4" dangerouslySetInnerHTML={{ __html: sanitizedGeneral }} />
                                </div>
                                <div className="mt-8">
                                    <h2 className="text-xl font-semibold flex items-center gap-2"><LocateFixed className="h-5 w-5 text-primary"/> Kualifikasi Khusus</h2>
                                    <div className="mt-4" dangerouslySetInnerHTML={{ __html: sanitizedSpecial }} />
                                </div>
                            </div>
                            <div className="md:col-span-1">
                                <div className="rounded-lg bg-secondary p-4">
                                    <h3 className="font-semibold">Tentang Posisi Ini</h3>
                                    <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
                                        <li className="flex items-start"><strong className="w-20 font-medium text-foreground">Divisi</strong>: {job.division}</li>
                                        <li className="flex items-start"><strong className="w-20 font-medium text-foreground">Tipe</strong>: <span className="capitalize">{job.statusJob}</span></li>
                                        <li className="flex items-start"><strong className="w-20 font-medium text-foreground">Lokasi</strong>: {job.location}</li>
                                        {job.workMode && <li className="flex items-start"><strong className="w-20 font-medium text-foreground">Mode</strong>: <span className="capitalize">{job.workMode}</span></li>}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </main>
        </>
    );
}

// Basic prose styles for dangerouslySetInnerHTML
const proseStyles = `
.prose ul { list-style-type: disc; padding-left: 1.5em; }
.prose ol { list-style-type: decimal; padding-left: 1.5em; }
.prose strong { font-weight: 600; }
.prose a { color: hsl(var(--primary)); text-decoration: none; }
.prose a:hover { text-decoration: underline; }
.prose h1, .prose h2, .prose h3 { margin-bottom: 0.5em; margin-top: 1em; }
`;

export function GlobalProseStyles() {
    return <style jsx global>{proseStyles}</style>
}
