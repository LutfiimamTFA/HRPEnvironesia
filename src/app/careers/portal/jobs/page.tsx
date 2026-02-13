'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Briefcase, MapPin, Search, Trash2, Bookmark, Building } from 'lucide-react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import type { Job } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const JobCard = ({ job }: { job: Job }) => (
    <Card className="transition-shadow duration-300 hover:shadow-lg w-full">
        <div className="p-6 flex flex-col sm:flex-row items-start gap-6">
            <div className="flex-grow">
                <CardTitle className="text-lg mb-1">{job.position}</CardTitle>
                <CardDescription className="flex items-center gap-2 mb-4 text-sm">
                   <Building className="h-4 w-4" /> {job.brandName}
                </CardDescription>

                <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary" className="flex items-center gap-1.5 py-1 px-2.5">
                        <MapPin className="h-3.5 w-3.5" />
                        {job.location}
                    </Badge>
                     <Badge variant="secondary" className="py-1 px-2.5">
                        {job.division}
                    </Badge>
                    <Badge variant="secondary" className="capitalize flex items-center gap-1.5 py-1 px-2.5">
                        <Briefcase className="h-3.5 w-3.5" />
                        {job.statusJob}
                    </Badge>
                </div>
            </div>

            <div className="flex-shrink-0 flex flex-row sm:flex-col items-center gap-2 w-full sm:w-auto">
                <Button asChild className="w-full justify-center">
                    <Link href={`/careers/jobs/${job.slug}`}>
                        Lihat Detail
                        <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                </Button>
                <Button variant="outline" className="w-full justify-center">
                    <Bookmark className="mr-2 h-4 w-4" />
                    Simpan
                </Button>
            </div>
        </div>
    </Card>
);

const JobCardSkeleton = () => (
    <Card>
        <div className="p-6 flex flex-col sm:flex-row items-start gap-6">
            <div className="flex-grow space-y-3 w-full">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <div className="flex gap-2">
                    <Skeleton className="h-6 w-24" />
                    <Skeleton className="h-6 w-20" />
                    <Skeleton className="h-6 w-28" />
                </div>
            </div>
            <div className="flex-shrink-0 flex flex-row sm:flex-col items-center gap-2 w-full sm:w-36">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
            </div>
        </div>
    </Card>
)

export default function CandidateJobsPage() {
  const firestore = useFirestore();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [fieldFilter, setFieldFilter] = useState('');
  const [educationFilter, setEducationFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');

  const publishedJobsQuery = useMemoFirebase(
    () => query(
      collection(firestore, 'jobs'), 
      where('publishStatus', '==', 'published')
    ), 
    [firestore]
  );

  const { data: jobs, isLoading } = useCollection<Job>(publishedJobsQuery);

  const sortedJobs = useMemo(() => {
    if (!jobs) return [];
    return [...jobs].sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return timeB - timeA;
    });
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    return sortedJobs.filter(job => {
      const matchesSearchTerm = job.position.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCompany = companyFilter ? job.brandName?.toLowerCase().includes(companyFilter.toLowerCase()) : true;
      const matchesField = fieldFilter ? job.division.toLowerCase().includes(fieldFilter.toLowerCase()) : true;
      const matchesLocation = locationFilter ? job.location.toLowerCase().includes(locationFilter.toLowerCase()) : true;
      // Education filter not implemented as data is not available in Job type
      const matchesEducation = educationFilter ? true : true; 

      return matchesSearchTerm && matchesCompany && matchesField && matchesLocation && matchesEducation;
    });
  }, [sortedJobs, searchTerm, companyFilter, fieldFilter, educationFilter, locationFilter]);

  const handleResetFilters = () => {
    setSearchTerm('');
    setCompanyFilter('');
    setFieldFilter('');
    setEducationFilter('');
    setLocationFilter('');
  };


  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
        <div className="lg:col-span-1 lg:sticky lg:top-24">
            <Card>
                <CardHeader>
                    <CardTitle className="flex justify-between items-center">
                        <span>Filter Pencarian</span>
                        <Button variant="ghost" size="sm" onClick={handleResetFilters} className="text-destructive hover:bg-destructive/10">
                            <Trash2 className="h-4 w-4 mr-2" />
                            Reset
                        </Button>
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Nama Lowongan</label>
                        <div className="relative">
                            <Input 
                                placeholder="Cari kata kunci vacancy" 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pr-10"
                            />
                            <Button type="submit" size="icon" variant="ghost" className="absolute right-0 top-0 h-full">
                               <Search className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                     <div className="space-y-2">
                        <label className="text-sm font-medium">Nama perusahaan</label>
                        <Input 
                            placeholder="" 
                            value={companyFilter}
                            onChange={(e) => setCompanyFilter(e.target.value)}
                        />
                    </div>
                     <div className="space-y-2">
                        <label className="text-sm font-medium">Bidang Pekerjaan</label>
                        <Input 
                            placeholder="" 
                            value={fieldFilter}
                            onChange={(e) => setFieldFilter(e.target.value)}
                        />
                    </div>
                     <div className="space-y-2">
                        <label className="text-sm font-medium">Jenjang Pendidikan</label>
                        <Input 
                            placeholder="" 
                            value={educationFilter}
                            onChange={(e) => setEducationFilter(e.target.value)}
                        />
                    </div>
                     <div className="space-y-2">
                        <label className="text-sm font-medium">Lokasi Penempatan</label>
                        <Input 
                            placeholder="" 
                            value={locationFilter}
                            onChange={(e) => setLocationFilter(e.target.value)}
                        />
                    </div>
                </CardContent>
            </Card>
        </div>

        <div className="lg:col-span-3 space-y-6">
            <Tabs defaultValue="explore">
                <TabsList>
                    <TabsTrigger value="explore">Explore</TabsTrigger>
                    <TabsTrigger value="saved">Saved Vacancy</TabsTrigger>
                </TabsList>
                <TabsContent value="explore" className="mt-6">
                    <h2 className="text-2xl font-bold mb-4">{isLoading ? 'Mencari lowongan...' : `${filteredJobs.length} Lowongan Tersedia`}</h2>
                     <div className="space-y-4">
                        {isLoading ? (
                            <>
                                <JobCardSkeleton />
                                <JobCardSkeleton />
                                <JobCardSkeleton />
                            </>
                        ) : filteredJobs && filteredJobs.length > 0 ? (
                            filteredJobs.map(job => <JobCard key={job.id} job={job} />)
                        ) : (
                            <div className="py-12 text-center text-muted-foreground">
                                <p>Tidak ada lowongan yang sesuai dengan kriteria Anda.</p>
                            </div>
                        )}
                    </div>
                </TabsContent>
                 <TabsContent value="saved" className="mt-6">
                     <div className="py-12 text-center text-muted-foreground">
                        <p>Anda belum menyimpan lowongan apa pun.</p>
                    </div>
                </TabsContent>
            </Tabs>
           
        </div>
    </div>
  );
}
