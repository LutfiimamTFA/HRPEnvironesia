'use client';

import React, { useMemo, useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Clock, MapPin, Building, Search } from 'lucide-react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import type { Job } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslations } from 'next-intl';
import { Link } from '@/navigation';
import imagePlaceholders from '@/lib/placeholder-images.json';

const JobCard = ({ job }: { job: Job }) => (
    <Card className="flex flex-col rounded-xl shadow-md transition-all duration-300 hover:shadow-primary/20 hover:-translate-y-1.5 border-transparent hover:border-primary/30">
      <CardHeader>
        <div className="flex justify-between items-start">
            <Badge variant="secondary" className="font-medium">{job.brandName || 'Environesia'}</Badge>
            <span className="text-xs text-muted-foreground capitalize flex items-center gap-1"><Clock className="h-3 w-3" />{job.statusJob}</span>
        </div>
        <CardTitle className="pt-2 text-xl">{job.position}</CardTitle>
      </CardHeader>
      <CardContent className="flex-grow">
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" /> {job.location}</span>
          <span className="flex items-center gap-1.5"><Building className="h-4 w-4" /> {job.division}</span>
        </div>
      </CardContent>
      <CardFooter>
        <Button variant="default" asChild className="w-full">
          <Link href={`/careers/jobs/${job.slug}`}>
            Lihat Detail <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
);

const JobCardSkeleton = () => (
    <Card className="flex flex-col rounded-xl">
        <CardHeader>
            <div className="flex justify-between items-start">
                <Skeleton className="h-6 w-24 rounded-full" />
                <Skeleton className="h-5 w-16" />
            </div>
            <Skeleton className="mt-2 h-7 w-3/4" />
        </CardHeader>
        <CardContent className="flex-grow">
             <div className="flex gap-4">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-5 w-20" />
            </div>
        </CardContent>
        <CardFooter>
            <Skeleton className="h-10 w-full" />
        </CardFooter>
    </Card>
);


export function JobExplorerSkeleton() {
    return (
        <div className="mt-12">
             <div className="max-w-3xl mx-auto">
                <Skeleton className="h-12 w-full rounded-full mb-4" />
                <div className="flex flex-wrap items-center justify-center gap-2">
                    <Skeleton className="h-9 w-24 rounded-full" />
                    <Skeleton className="h-9 w-24 rounded-full" />
                    <Skeleton className="h-9 w-24 rounded-full" />
                </div>
            </div>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mt-12">
                <JobCardSkeleton />
                <JobCardSkeleton />
                <JobCardSkeleton />
            </div>
        </div>
    )
}

export function JobExplorerClient() {
    const t = useTranslations('CareersLanding.JobExplorer');
    const firestore = useFirestore();
    const [searchTerm, setSearchTerm] = useState('');
    const [activeFilters, setActiveFilters] = useState<string[]>([]);
  
    const publishedJobsQuery = useMemoFirebase(
      () => query(collection(firestore, 'jobs'), where('publishStatus', '==', 'published')), 
      [firestore]
    );
  
    const { data: jobs, isLoading } = useCollection<Job>(publishedJobsQuery);
  
    const filteredJobs = useMemo(() => {
        if (!jobs) return [];
        return jobs.filter(job => {
            const matchesSearch = searchTerm === '' || job.position.toLowerCase().includes(searchTerm.toLowerCase()) || job.division.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesFilter = activeFilters.length === 0 || activeFilters.includes(job.statusJob);
            return matchesSearch && matchesFilter;
        }).sort((a, b) => (b.createdAt.toMillis() - a.createdAt.toMillis()));
    }, [jobs, searchTerm, activeFilters]);

    const toggleFilter = (filter: string) => {
        setActiveFilters(prev => prev.includes(filter) ? prev.filter(f => f !== filter) : [...prev, filter]);
    }

    const filterChips = ['fulltime', 'internship', 'contract'];
    
    return (
        <>
            <div className="mt-12 max-w-3xl mx-auto">
                <div className="relative mb-4">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input 
                        placeholder={t('searchPlaceholder')}
                        className="h-12 pl-12 text-base rounded-full"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                    {filterChips.map(filter => (
                        <Button 
                            key={filter} 
                            variant={activeFilters.includes(filter) ? 'default' : 'outline'}
                            onClick={() => toggleFilter(filter)}
                            className="capitalize rounded-full"
                        >
                            {t(`filters.${filter}` as any)}
                        </Button>
                    ))}
                </div>
            </div>

            <div className="mt-12">
                {isLoading ? (
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        <JobCardSkeleton /><JobCardSkeleton /><JobCardSkeleton />
                    </div>
                ) : filteredJobs.length > 0 ? (
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                       {filteredJobs.map(job => <JobCard key={job.id} job={job} />)}
                    </div>
                ) : (
                    <div className="text-center text-muted-foreground mt-12 rounded-lg border-2 border-dashed p-12 max-w-2xl mx-auto flex flex-col items-center">
                         <Image 
                            src={imagePlaceholders.careers_empty_jobs.src}
                            alt={imagePlaceholders.careers_empty_jobs.alt}
                            width={150}
                            height={150}
                            data-ai-hint={imagePlaceholders.careers_empty_jobs.ai_hint}
                            className="mb-6 opacity-70"
                         />
                        <h3 className="text-xl font-semibold text-foreground">{t('emptyState.title')}</h3>
                        <p className="mt-2 mb-6">{t('emptyState.subtitle')}</p>
                        <Button>{t('emptyState.cta')}</Button>
                    </div>
                )}
            </div>
        </>
    )
}