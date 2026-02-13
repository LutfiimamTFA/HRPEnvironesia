'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Briefcase, MapPin, Search, Trash2, Bookmark } from 'lucide-react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import type { Job } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const JobCard = ({ job }: { job: Job }) => (
  <Card className="grid grid-cols-1 md:grid-cols-[1fr_2fr_1fr] items-center gap-4 p-6 transition-shadow duration-300 hover:shadow-xl w-full">
    <div className="flex flex-col items-center justify-center text-center gap-2">
       <div className="relative h-20 w-20">
          <svg className="h-full w-full" viewBox="0 0 36 36">
              <path
                  className="stroke-current text-gray-200"
                  d="M18 2.0845
                    a 15.9155 15.9155 0 0 1 0 31.831
                    a 15.9155 15.9155 0 0 1 0 -31.831"
                  strokeWidth="3"
                  fill="none"
              />
              <path
                  className="stroke-current text-primary"
                  strokeDasharray="0, 100"
                  d="M18 2.0845
                    a 15.9155 15.9155 0 0 1 0 31.831
                    a 15.9155 15.9155 0 0 1 0 -31.831"
                  strokeWidth="3"
                  fill="none"
                  strokeLinecap="round"
              />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-bold">0%</span>
          </div>
      </div>
      <p className="text-xs text-muted-foreground">Kuota Kandidat</p>
      {job.statusJob === 'fulltime' && <Badge className="bg-blue-600 text-white mt-2">Vacancy Urgent</Badge>}
    </div>

    <div>
      <CardTitle className="text-xl mb-1">{job.position}</CardTitle>
      <CardDescription>{job.brandName}</CardDescription>
    </div>

    <div className="flex flex-col items-start md:items-end gap-2 text-sm">
        <div className="text-left md:text-right">
            <p className="font-semibold">Bidang Pekerjaan</p>
            <p className="text-muted-foreground">{job.division}</p>
        </div>
        <div className="text-left md:text-right">
            <p className="font-semibold">Jenjang</p>
            <p className="text-muted-foreground capitalize">{job.statusJob}</p>
        </div>
        <div className="flex items-center gap-2 mt-2 w-full justify-start md:justify-end">
          <Button asChild className="w-full md:w-auto bg-red-600 hover:bg-red-700">
            <Link href={`/careers/jobs/${job.slug}`}>
              Detail Pekerjaan
            </Link>
          </Button>
          <Button variant="outline" size="icon">
            <Bookmark className="h-4 w-4"/>
          </Button>
        </div>
    </div>
  </Card>
);

const JobCardSkeleton = () => (
    <Card className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr_1fr] items-center gap-4">
            <div className="flex flex-col items-center justify-center gap-2">
                <Skeleton className="h-20 w-20 rounded-full" />
                <Skeleton className="h-4 w-20" />
            </div>
            <div>
                <Skeleton className="h-6 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/2" />
            </div>
            <div className="flex flex-col items-end gap-3">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-4 w-20" />
                 <Skeleton className="h-5 w-24" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-10 w-36" />
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
        <div className="lg:col-span-1">
            <Card>
                <CardHeader>
                    <CardTitle className="flex justify-between items-center">
                        <span>Filter Pencarian</span>
                        <Button variant="ghost" size="sm" onClick={handleResetFilters} className="text-red-600 hover:bg-red-100 hover:text-red-700">
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
