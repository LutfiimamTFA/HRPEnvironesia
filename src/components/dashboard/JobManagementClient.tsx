
'use client';

import { useMemo, useState } from 'react';
import { collection, doc, serverTimestamp } from 'firebase/firestore';
import { useCollection, useFirestore, useMemoFirebase, updateDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase';
import type { Job, Brand } from '@/lib/types';
import { format } from 'date-fns';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, PlusCircle, Trash2, Edit, Eye, EyeOff, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { JobFormDialog } from './JobFormDialog';
import { DeleteConfirmationDialog } from './DeleteConfirmationDialog';
import { useAuth } from '@/providers/auth-provider';

function JobTableSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead><Skeleton className="h-5 w-24" /></TableHead>
              <TableHead><Skeleton className="h-5 w-20" /></TableHead>
              <TableHead><Skeleton className="h-5 w-16" /></TableHead>
              <TableHead><Skeleton className="h-5 w-16" /></TableHead>
              <TableHead><Skeleton className="h-5 w-24" /></TableHead>
              <TableHead><Skeleton className="h-5 w-24" /></TableHead>
              <TableHead><Skeleton className="h-5 w-24" /></TableHead>
              <TableHead className="w-[100px] text-right"><Skeleton className="h-5 w-12" /></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...Array(3)].map((_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-5 w-full" /></TableCell>
                <TableCell><Skeleton className="h-5 w-full" /></TableCell>
                <TableCell><Skeleton className="h-5 w-full" /></TableCell>
                <TableCell><Skeleton className="h-5 w-full" /></TableCell>
                <TableCell><Skeleton className="h-5 w-full" /></TableCell>
                <TableCell><Skeleton className="h-5 w-full" /></TableCell>
                <TableCell><Skeleton className="h-5 w-full" /></TableCell>
                <TableCell><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function JobManagementClient() {
  const firestore = useFirestore();
  const { userProfile } = useAuth();
  const { toast } = useToast();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);


  const jobsRef = useMemoFirebase(() => collection(firestore, 'jobs'), [firestore]);
  const { data: jobs, isLoading, error } = useCollection<Job>(jobsRef);
  
  const brandsRef = useMemoFirebase(() => collection(firestore, 'brands'), [firestore]);
  const { data: brands } = useCollection<Brand>(brandsRef);

  const brandMap = useMemo(() => {
    if (!brands) return new Map<string, string>();
    return new Map(brands.map(brand => [brand.id!, brand.name]));
  }, [brands]);

  const jobsWithBrandNames = useMemo(() => {
    if (!jobs) return [];
    return jobs.map(job => ({
      ...job,
      brandName: brandMap.get(job.brandId) || 'N/A'
    })).sort((a, b) => {
      // Handle cases where timestamp is pending from server
      const timeA = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : Date.now();
      const timeB = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : Date.now();
      return timeB - timeA;
    });
  }, [jobs, brandMap]);


  const handleCreate = () => {
    setSelectedJob(null);
    setIsFormOpen(true);
  };

  const handleEdit = (job: Job) => {
    setSelectedJob(job);
    setIsFormOpen(true);
  };

  const handleDelete = (job: Job) => {
    setSelectedJob(job);
    setIsDeleteConfirmOpen(true);
  };

  const confirmDelete = () => {
    if (!selectedJob || !selectedJob.id) return;
    deleteDocumentNonBlocking(doc(firestore, 'jobs', selectedJob.id));
    toast({
      title: 'Job Deleted',
      description: `The job posting for "${selectedJob.position}" has been deleted.`,
    });
    setIsDeleteConfirmOpen(false);
    setSelectedJob(null);
  };

  const handleStatusChange = (job: Job, status: Job['publishStatus']) => {
    if (!job.id || !userProfile) return;
    updateDocumentNonBlocking(doc(firestore, 'jobs', job.id), {
      publishStatus: status,
      updatedAt: serverTimestamp(),
      updatedBy: userProfile.uid,
    });
    toast({
      title: 'Job Status Updated',
      description: `Job "${job.position}" has been ${status}.`,
    });
  };

  if (isLoading) {
    return <JobTableSkeleton />;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error Loading Jobs</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={handleCreate}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Create Job
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Position</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Deadline</TableHead>
              <TableHead>Last Updated</TableHead>
              <TableHead className="w-[100px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobsWithBrandNames && jobsWithBrandNames.length > 0 ? (
              jobsWithBrandNames.map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="font-medium">{job.position}</TableCell>
                  <TableCell>{job.brandName}</TableCell>
                  <TableCell className="capitalize">{job.statusJob}</TableCell>
                  <TableCell>
                    <Badge variant={
                      job.publishStatus === 'published' ? 'default' 
                      : job.publishStatus === 'closed' ? 'destructive' 
                      : 'secondary'
                    } className="capitalize">
                      {job.publishStatus}
                    </Badge>
                  </TableCell>
                  <TableCell>{job.location}</TableCell>
                  <TableCell>
                    {job.applyDeadline?.toDate ? format(job.applyDeadline.toDate(), 'dd MMM yyyy') : '-'}
                  </TableCell>
                  <TableCell>
                    {job.updatedAt?.toDate ? format(job.updatedAt.toDate(), 'dd MMM yyyy') : 'Just now'}
                  </TableCell>
                  <TableCell className="text-right">
                     <DropdownMenu open={openMenuId === job.id} onOpenChange={(isOpen) => setOpenMenuId(isOpen ? job.id : null)}>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Actions for {job.position}</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setOpenMenuId(null); queueMicrotask(() => handleEdit(job)); }}>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {job.publishStatus !== 'published' && (
                          <DropdownMenuItem onSelect={() => handleStatusChange(job, 'published')}>
                            <Eye className="mr-2 h-4 w-4" />
                            Publish
                          </DropdownMenuItem>
                        )}
                        {job.publishStatus === 'published' && (
                          <DropdownMenuItem onSelect={() => handleStatusChange(job, 'draft')}>
                            <EyeOff className="mr-2 h-4 w-4" />
                            Unpublish (Draft)
                          </DropdownMenuItem>
                        )}
                        {job.publishStatus !== 'closed' && (
                            <DropdownMenuItem onSelect={() => handleStatusChange(job, 'closed')}>
                                <XCircle className="mr-2 h-4 w-4" />
                                Close
                            </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive focus:bg-destructive/10"
                          onSelect={(e) => { e.preventDefault(); setOpenMenuId(null); queueMicrotask(() => handleDelete(job)); }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">
                  No jobs found. Create one to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <JobFormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        job={selectedJob}
        brands={brands || []}
      />
      
      <DeleteConfirmationDialog
        open={isDeleteConfirmOpen}
        onOpenChange={setIsDeleteConfirmOpen}
        onConfirm={confirmDelete}
        itemName={selectedJob?.position}
        itemType="Job Posting"
      />
    </div>
  );
}
