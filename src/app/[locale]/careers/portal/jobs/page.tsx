
'use client';

import { Link } from '@/navigation';
import { useMemo, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Briefcase, MapPin, Search, Trash2, Bookmark, Building, Check } from 'lucide-react';
import { useCollection, useFirestore, useMemoFirebase, setDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase';
import { collection, query, where, doc, serverTimestamp, getDocs } from 'firebase/firestore';
import type { Job, Brand, SavedJob } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/hooks/use-toast';

const JobCard = ({ job, isSaved, onToggleSave }: { job: Job, isSaved: boolean, onToggleSave: (job: Job, isSaved: boolean) => void }) => (
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

            <div className="flex-shrink-0 flex flex-col items-stretch sm:items-end gap-2 w-full sm:w-auto mt-4 sm:mt-0">
                <Button asChild className="w-full justify-center sm:w-40">
                    <Link href={`/careers/portal/jobs/${job.slug}`}>
                        Lihat Detail
                        <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                </Button>
                <Button variant="outline" className="w-full justify-center sm:w-40" onClick={() => onToggleSave(job, isSaved)}>
                    {isSaved ? <Check className="mr-2 h-4 w-4" /> : <Bookmark className="mr-2 h-4 w-4" />}
                    {isSaved ? 'Tersimpan' : 'Simpan'}
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
            <div className="flex-shrink-0 flex flex-col items-end gap-2 w-full sm:w-40 mt-4 sm:mt-0">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
            </div>
        </div>
    </Card>
)

export default function CandidateJobsPage() {
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const firestore = useFirestore();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');

  const publishedJobsQuery = useMemoFirebase(
    () => query(collection(firestore, 'jobs'), where('publishStatus', '==', 'published')), 
    [firestore]
  );
  const { data: jobs, isLoading: isLoadingJobs } = useCollection<Job>(publishedJobsQuery);

  const brandsQuery = useMemoFirebase(() => query(collection(firestore, 'brands')), [firestore]);
  const { data: brands, isLoading: isLoadingBrands } = useCollection<Brand>(brandsQuery);

  const savedJobsQuery = useMemoFirebase(() => {
    if (!userProfile) return null;
    return collection(firestore, 'users', userProfile.uid, 'saved_jobs');
  }, [userProfile, firestore]);
  const { data: savedJobs, isLoading: isLoadingSavedJobs } = useCollection<SavedJob>(savedJobsQuery);
  const savedJobIds = useMemo(() => new Set(savedJobs?.map(j => j.jobId) || []), [savedJobs]);

  const [savedJobsDetails, setSavedJobsDetails] = useState<Job[]>([]);
  const [isLoadingSavedDetails, setIsLoadingSavedDetails] = useState(false);
  const savedJobIdsForQuery = useMemo(() => savedJobs?.map(j => j.jobId) || [], [savedJobs]);

  const isLoading = isLoadingJobs || isLoadingBrands || isLoadingSavedJobs;

  useEffect(() => {
    const fetchSavedJobDetails = async () => {
        if (savedJobIdsForQuery.length === 0) {
            setSavedJobsDetails([]);
            return;
        }
        setIsLoadingSavedDetails(true);
        const chunks = [];
        for (let i = 0; i < savedJobIdsForQuery.length; i += 30) {
            chunks.push(savedJobIdsForQuery.slice(i, i + 30));
        }

        try {
            const promises = chunks.map(chunk =>
                getDocs(query(collection(firestore, 'jobs'), where('__name__', 'in', chunk)))
            );
            const snapshots = await Promise.all(promises);
            const jobsData = snapshots.flatMap(snap => snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as Job)));
            setSavedJobsDetails(jobsData);
        } catch (error) {
            console.error("Error fetching saved job details:", error);
            toast({ variant: 'destructive', title: 'Gagal memuat lowongan tersimpan.' });
        } finally {
            setIsLoadingSavedDetails(false);
        }
    };

    if (!isLoadingSavedJobs) {
        fetchSavedJobDetails();
    }
  }, [savedJobIdsForQuery, firestore, isLoadingSavedJobs, toast]);


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
      const matchesCompany = companyFilter ? job.brandName === companyFilter : true;
      
      return matchesSearchTerm && matchesCompany;
    });
  }, [sortedJobs, searchTerm, companyFilter]);

  const handleResetFilters = () => {
    setSearchTerm('');
    setCompanyFilter('');
  };
  
  const handleToggleSave = async (job: Job, isCurrentlySaved: boolean) => {
    if (!userProfile) {
        toast({ variant: 'destructive', title: 'Anda harus login' });
        return;
    }

    const savedJobRef = doc(firestore, 'users', userProfile.uid, 'saved_jobs', job.id!);

    if (isCurrentlySaved) {
        try {
            await deleteDocumentNonBlocking(savedJobRef);
            toast({ title: 'Lowongan Dihapus', description: `"${job.position}" telah dihapus dari daftar tersimpan.` });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Gagal menghapus', description: error.message });
        }
    } else {
        const savedJobData: Omit<SavedJob, 'id'> = {
            userId: userProfile.uid,
            jobId: job.id!,
            jobPosition: job.position,
            jobSlug: job.slug,
            brandName: job.brandName || '',
            savedAt: serverTimestamp() as any,
        };
        try {
            await setDocumentNonBlocking(savedJobRef, savedJobData, { merge: false });
            toast({ title: 'Lowongan Disimpan', description: `"${job.position}" telah ditambahkan ke daftar tersimpan.` });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Gagal menyimpan', description: error.message });
        }
    }
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
                        <Select value={companyFilter} onValueChange={(value) => setCompanyFilter(value === 'all' ? '' : value)} disabled={isLoadingBrands}>
                            <SelectTrigger>
                                <SelectValue placeholder="Semua Perusahaan" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Semua Perusahaan</SelectItem>
                                {brands?.map((brand) => (
                                    <SelectItem key={brand.id} value={brand.name}>
                                        {brand.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
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
                            filteredJobs.map(job => <JobCard key={job.id} job={job} isSaved={savedJobIds.has(job.id!)} onToggleSave={handleToggleSave} />)
                        ) : (
                            <div className="py-12 text-center text-muted-foreground">
                                <p>Tidak ada lowongan yang sesuai dengan kriteria Anda.</p>
                            </div>
                        )}
                    </div>
                </TabsContent>
                 <TabsContent value="saved" className="mt-6">
                    <div className="space-y-4">
                        {isLoadingSavedDetails ? (
                            <>
                                <JobCardSkeleton />
                                <JobCardSkeleton />
                            </>
                        ) : savedJobsDetails.length > 0 ? (
                            savedJobsDetails.map(job => (
                                <JobCard key={job.id} job={job} isSaved={true} onToggleSave={handleToggleSave} />
                            ))
                        ) : (
                            <div className="py-12 text-center text-muted-foreground">
                                <p>Anda belum menyimpan lowongan apa pun.</p>
                            </div>
                        )}
                    </div>
                </TabsContent>
            </Tabs>
           
        </div>
    </div>
  );
}

    