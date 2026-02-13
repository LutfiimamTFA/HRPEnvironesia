'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Briefcase, MapPin } from 'lucide-react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy } from 'firebase/firestore';
import type { Job } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';

const JobCard = ({ job }: { job: Job }) => (
  <Card className="flex flex-col transition-shadow duration-300 hover:shadow-xl">
    <CardHeader className="flex-grow">
      <CardTitle className="text-xl">{job.position}</CardTitle>
      <CardDescription className="flex items-center gap-4 pt-2">
        <span className="flex items-center gap-1.5 capitalize"><Briefcase className="h-4 w-4" /> {job.statusJob}</span>
        <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" /> {job.location}</span>
      </CardDescription>
    </CardHeader>
    <CardFooter className="flex items-center justify-between">
      <Badge variant="secondary">{job.brandName || 'Environesia'}</Badge>
      <Button variant="default" asChild>
        <Link href={`/careers/jobs/${job.slug}`}>
          Lihat Detail <ArrowRight className="ml-2 h-4 w-4" />
        </Link>
      </Button>
    </CardFooter>
  </Card>
);

const JobCardSkeleton = () => (
    <Card className="flex flex-col">
        <CardHeader className="flex-grow">
            <Skeleton className="h-6 w-3/4" />
            <div className="flex items-center gap-4 pt-2">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-5 w-20" />
            </div>
        </CardHeader>
        <CardFooter className="flex items-center justify-between">
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-10 w-32" />
        </CardFooter>
    </Card>
)

export default function CandidateJobsPage() {
  const firestore = useFirestore();
  
  const publishedJobsQuery = useMemoFirebase(
    () => query(
      collection(firestore, 'jobs'), 
      where('publishStatus', '==', 'published'),
      orderBy('createdAt', 'desc')
    ), 
    [firestore]
  );

  const { data: jobs, isLoading } = useCollection<Job>(publishedJobsQuery);

  return (
    <Card>
        <CardHeader>
            <CardTitle>Daftar Lowongan</CardTitle>
            <CardDescription>Jelajahi semua peluang karir yang tersedia saat ini.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
            {isLoading ? (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    <JobCardSkeleton />
                    <JobCardSkeleton />
                    <JobCardSkeleton />
                </div>
            ) : jobs && jobs.length > 0 ? (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {jobs.map(job => <JobCard key={job.id} job={job} />)}
                </div>
            ) : (
                <div className="py-12 text-center text-muted-foreground">
                    <p>Belum ada lowongan yang tersedia saat ini.</p>
                    <p>Silakan periksa kembali nanti.</p>
                </div>
            )}
        </CardContent>
    </Card>
  );
}
