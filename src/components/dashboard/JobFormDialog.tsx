
'use client';

import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { doc, collection, serverTimestamp } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useFirestore, setDocumentNonBlocking, useFirebaseApp } from '@/firebase';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription,
} from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, UploadCloud, Calendar as CalendarIcon } from 'lucide-react';
import type { Job, Brand } from '@/lib/types';
import { RichTextEditor } from '../ui/RichTextEditor';
import Image from 'next/image';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const slugify = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const formSchema = z.object({
  position: z.string().min(3, { message: 'Position is required.' }),
  statusJob: z.enum(['fulltime', 'internship', 'contract']),
  division: z.string().min(2, { message: 'Division is required.' }),
  location: z.string().min(2, { message: 'Location is required.' }),
  brandId: z.string({ required_error: 'Company/Brand is required.' }),
  workMode: z.enum(['onsite', 'hybrid', 'remote']).optional(),
  applyDeadline: z.date().optional().nullable(),
  coverImage: z.any().optional(),
  generalRequirementsHtml: z.string().min(10, { message: 'General requirements are required.' }),
  specialRequirementsHtml: z.string().min(10, { message: 'Special requirements are required.' }),
});

type FormValues = z.infer<typeof formSchema>;

interface JobFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job | null;
  brands: Brand[];
}

export function JobFormDialog({ open, onOpenChange, job, brands }: JobFormDialogProps) {
  const firestore = useFirestore();
  const firebaseApp = useFirebaseApp();
  const storage = getStorage(firebaseApp);
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const mode = job ? 'Edit' : 'Create';

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      position: '',
      statusJob: 'fulltime',
      division: '',
      location: '',
      brandId: undefined,
      workMode: 'onsite',
      applyDeadline: null,
      generalRequirementsHtml: '',
      specialRequirementsHtml: '',
    },
  });

  useEffect(() => {
    if (open) {
      if (job) {
        form.reset({
          ...job,
          applyDeadline: job.applyDeadline ? job.applyDeadline.toDate() : null,
          coverImage: undefined, // Don't repopulate file input
        });
        if (job.coverImageUrl) {
          setImagePreview(job.coverImageUrl);
        }
      } else {
        form.reset({
          position: '', statusJob: 'fulltime', division: '', location: '', brandId: undefined, workMode: 'onsite', generalRequirementsHtml: '', specialRequirementsHtml: '', applyDeadline: null
        });
        setImagePreview(null);
      }
    }
  }, [open, job, form]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const newImagePreview = URL.createObjectURL(file);
      setImagePreview(newImagePreview);
      form.setValue('coverImage', file);
    }
  };

  const uploadCoverImage = async (jobId: string, imageFile: File): Promise<string> => {
    const filePath = `jobs/${jobId}/cover-${Date.now()}`;
    const storageRef = ref(storage, filePath);
    await uploadBytes(storageRef, imageFile);
    return getDownloadURL(storageRef);
  };

  const onSubmit = async (values: FormValues) => {
    if (!userProfile) {
      toast({ variant: 'destructive', title: 'Error', description: 'You must be logged in.' });
      return;
    }
    setLoading(true);

    try {
      const jobId = job?.id || doc(collection(firestore, 'jobs')).id;
      let finalCoverImageUrl = job?.coverImageUrl || '';

      if (values.coverImage instanceof File) {
        finalCoverImageUrl = await uploadCoverImage(jobId, values.coverImage);
      }

      const brandName = brands.find(b => b.id === values.brandId)?.name || '';

      const { coverImage, ...restOfValues } = values;

      const jobData: Omit<Job, 'id'> = {
        ...restOfValues,
        applyDeadline: values.applyDeadline || null,
        coverImageUrl: finalCoverImageUrl,
        slug: job?.slug || `${slugify(values.position)}-${slugify(brandName)}-${Math.random().toString(36).substring(2, 7)}`,
        publishStatus: job?.publishStatus || 'draft',
        createdAt: job?.createdAt || serverTimestamp() as any,
        updatedAt: serverTimestamp() as any,
        createdBy: job?.createdBy || userProfile.uid,
        updatedBy: userProfile.uid,
        brandName,
      };

      setDocumentNonBlocking(doc(firestore, 'jobs', jobId), jobData, { merge: true });

      toast({
        title: `Job ${mode === 'Edit' ? 'Updated' : 'Created'}`,
        description: `The job "${values.position}" has been saved.`,
      });
      onOpenChange(false);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: `Error saving job`,
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[95vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{mode} Job Posting</DialogTitle>
          <DialogDescription>
            Fill in the job details below. Click save when you're done.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-grow overflow-y-auto pr-2 -mr-6 pl-1">
          <Form {...form}>
            <form id="job-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4 pr-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField control={form.control} name="position" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Position</FormLabel>
                    <FormControl><Input placeholder="e.g., Frontend Developer" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="division" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Division</FormLabel>
                    <FormControl><Input placeholder="e.g., Engineering" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="brandId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company / Brand</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select a brand" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {brands.map(b => <SelectItem key={b.id} value={b.id!}>{b.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="location" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location</FormLabel>
                    <FormControl><Input placeholder="e.g., Yogyakarta" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="statusJob" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Job Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select job type" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="fulltime">Full-time</SelectItem>
                        <SelectItem value="internship">Internship</SelectItem>
                        <SelectItem value="contract">Contract</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="workMode" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Work Mode</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select work mode" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="onsite">On-site</SelectItem>
                        <SelectItem value="hybrid">Hybrid</SelectItem>
                        <SelectItem value="remote">Remote</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField
                  control={form.control}
                  name="applyDeadline"
                  render={({ field }) => (
                  <FormItem className="flex flex-col">
                      <FormLabel>Application Deadline</FormLabel>
                      <Popover>
                      <PopoverTrigger asChild>
                          <FormControl>
                          <Button
                              variant={"outline"}
                              className={cn(
                              "w-full justify-start text-left font-normal",
                              !field.value && "text-muted-foreground"
                              )}
                          >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {field.value ? (
                              format(field.value, "dd MMM yyyy")
                              ) : (
                              <span>Pick a date</span>
                              )}
                          </Button>
                          </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                          mode="single"
                          selected={field.value ?? undefined}
                          onSelect={field.onChange}
                          disabled={(date) =>
                              date < new Date(new Date().setHours(0, 0, 0, 0))
                          }
                          initialFocus
                          />
                      </PopoverContent>
                      </Popover>
                      <FormMessage />
                  </FormItem>
                  )}
                />
              </div>

              <FormField control={form.control} name="coverImage" render={({ field }) => (
                <FormItem>
                  <FormLabel>Cover Image</FormLabel>
                  <FormControl>
                    <div className="mt-2 flex justify-center rounded-lg border border-dashed border-input px-6 py-10">
                      <div className="text-center">
                        {imagePreview ? (
                            <Image src={imagePreview} alt="Cover preview" width={200} height={100} className="mx-auto mb-4 h-24 w-auto object-contain rounded-md" />
                        ) : (
                          <UploadCloud className="mx-auto h-12 w-12 text-muted-foreground" />
                        )}
                        <div className="mt-4 flex text-sm leading-6 text-muted-foreground">
                          <label htmlFor="cover-image-upload" className="relative cursor-pointer rounded-md font-semibold text-primary focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 hover:text-primary/80">
                            <span>Upload a file</span>
                            <input id="cover-image-upload" name={field.name} type="file" className="sr-only" onChange={handleFileChange} accept="image/png, image/jpeg, image/webp" />
                          </label>
                          <p className="pl-1">or drag and drop</p>
                        </div>
                        <p className="text-xs leading-5 text-muted-foreground">PNG, JPG, WEBP up to 2MB</p>
                      </div>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              
              <Controller
                control={form.control}
                name="generalRequirementsHtml"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>General Requirements</FormLabel>
                    <RichTextEditor {...field} placeholder="List general job requirements..." />
                    <FormMessage />
                  </FormItem>
              )} />
              
              <Controller
                control={form.control}
                name="specialRequirementsHtml"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Special Requirements</FormLabel>
                    <RichTextEditor {...field} placeholder="List special or technical job requirements..." />
                    <FormMessage />
                  </FormItem>
              )} />
            </form>
          </Form>
        </div>
        <DialogFooter className="flex-shrink-0 pt-4 border-t">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="job-form" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

    