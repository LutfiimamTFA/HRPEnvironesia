'use client';

import { useState, useMemo, useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useForm } from 'react-hook-form';
import { useAuth } from '@/providers/auth-provider';
import type { JobApplication, JobApplicationStatus, Job } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Eye, CalendarPlus, List, LayoutGrid, RefreshCw, Pencil, Edit, X } from 'lucide-react';
import { ApplicationStatusBadge, statusDisplayLabels } from '@/components/recruitment/ApplicationStatusBadge';
import { Checkbox } from '@/components/ui/checkbox';
import Link from 'next/link';
import { format } from 'date-fns';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { BulkScheduleWizard } from './BulkScheduleWizard';
import { CandidatesKanban } from './CandidatesKanban';
import { useToast } from '@/hooks/use-toast';
import { ORDERED_RECRUITMENT_STAGES } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '../ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../ui/form';
import { Input } from '../ui/input';
import { updateDocumentNonBlocking, useFirestore } from '@/firebase';
import { doc, serverTimestamp } from 'firebase/firestore';

type SelectionState = {
  selectedIds: Set<string>;
};

const templateSchema = z.object({
    meetingLink: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().url({ message: "Please enter a valid URL." }).optional()
    ),
});

function EditTemplateDialog({ open, onOpenChange, job, onSave }: { open: boolean, onOpenChange: (open: boolean) => void, job: Job, onSave: (link: string) => void }) {
    const form = useForm<z.infer<typeof templateSchema>>({
        resolver: zodResolver(templateSchema),
        defaultValues: {
            meetingLink: job.interviewTemplate?.meetingLink || '',
        },
    });
    
    useEffect(() => {
        if(open) {
            form.reset({ meetingLink: job.interviewTemplate?.meetingLink || '' });
        }
    }, [open, job, form]);

    const handleSubmit = (values: z.infer<typeof templateSchema>) => {
        onSave(values.meetingLink || '');
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Edit Interview Template</DialogTitle>
                    <DialogDescription>Set a default meeting link for this job. It will be used for new interviews.</DialogDescription>
                </DialogHeader>
                 <Form {...form}>
                    <form id="template-form" onSubmit={form.handleSubmit(handleSubmit)}>
                        <FormField
                            control={form.control}
                            name="meetingLink"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Default Meeting Link</FormLabel>
                                    <FormControl><Input placeholder="https://zoom.us/..." {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </form>
                 </Form>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button type="submit" form="template-form">Save Template</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export function ApplicantsPageClient({ applications, job, onJobUpdate }: { applications: JobApplication[], job: Job | null, onJobUpdate: () => void }) {
  const { userProfile } = useAuth();
  const [selection, setSelection] = useState<SelectionState>({ selectedIds: new Set() });
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table');
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const firestore = useFirestore();
  const { toast } = useToast();

  const filteredApplications = useMemo(() => {
    if (stageFilter === 'all') {
      return applications;
    }
    return applications.filter(app => app.status === stageFilter);
  }, [applications, stageFilter]);
  
  useEffect(() => {
    setSelection({ selectedIds: new Set() });
  }, [stageFilter]);
  
  const isAllFilteredSelected = useMemo(() => {
    if (filteredApplications.length === 0) return false;
    return filteredApplications.every(app => selection.selectedIds.has(app.id!));
  }, [filteredApplications, selection.selectedIds]);

  const handleSelectAllFiltered = (checked: boolean) => {
    if (checked) {
      setSelection({ selectedIds: new Set(filteredApplications.map(app => app.id!)) });
    } else {
      setSelection({ selectedIds: new Set() });
    }
  };

  const handleSelectRow = (appId: string, checked: boolean) => {
    setSelection(prev => {
      const newSelectedIds = new Set(prev.selectedIds);
      if (checked) newSelectedIds.add(appId);
      else newSelectedIds.delete(appId);
      return { selectedIds: newSelectedIds };
    });
  };

  const selectedApplications = useMemo(() => {
    return applications.filter(app => selection.selectedIds.has(app.id!));
  }, [applications, selection.selectedIds]);

  const sortedApplications = useMemo(() => {
    if (!filteredApplications) return [];
    return [...filteredApplications].sort((a, b) => (b.submittedAt?.toMillis() || b.createdAt.toMillis()) - (a.submittedAt?.toMillis() || a.createdAt.toMillis()));
  }, [filteredApplications]);
  
  const getMostRelevantInterview = (app: JobApplication) => {
    if (!app.interviews || app.interviews.length === 0) return null;
    const now = new Date().getTime();
    const relevantInterviews = app.interviews.filter(i => ['scheduled', 'reschedule_requested'].includes(i.status));
    if (relevantInterviews.length === 0) return null;
    const upcoming = relevantInterviews.filter(i => i.startAt.toMillis() >= now).sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis());
    if (upcoming.length > 0) return upcoming[0];
    const past = relevantInterviews.filter(i => i.startAt.toMillis() < now).sort((a, b) => b.startAt.toMillis() - a.startAt.toMillis());
    return past.length > 0 ? past[0] : null;
  };
  
  const handleSaveTemplate = async (newLink: string) => {
    if (!job) return;
    try {
      const jobRef = doc(firestore, 'jobs', job.id!);
      await updateDocumentNonBlocking(jobRef, {
        'interviewTemplate.meetingLink': newLink,
        'updatedAt': serverTimestamp(),
      });
      toast({ title: "Template Saved", description: "The default meeting link has been updated." });
      onJobUpdate(); // Re-fetch job data
      setIsTemplateDialogOpen(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: "Save Failed", description: e.message });
    }
  }

  return (
    <div className="space-y-4">
      {job && (
        <Card>
            <CardHeader>
                <CardTitle>Interview Template</CardTitle>
                <CardDescription>Set a default meeting link for all interviews for this job. This link will be used when scheduling new interviews.</CardDescription>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-muted-foreground">Default Link:</p>
                <p className="text-sm font-mono break-all">{job.interviewTemplate?.meetingLink || 'Not set'}</p>
            </CardContent>
            <CardFooter>
                <Button variant="outline" onClick={() => setIsTemplateDialogOpen(true)}>
                    <Edit className="mr-2 h-4 w-4" /> Edit Template
                </Button>
            </CardFooter>
        </Card>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
            <Select value={stageFilter} onValueChange={setStageFilter}>
                <SelectTrigger className="w-[240px]"><SelectValue placeholder="Filter by stage..." /></SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Stages</SelectItem>
                    {ORDERED_RECRUITMENT_STAGES.map((stage) => (<SelectItem key={stage} value={stage}>{statusDisplayLabels[stage]}</SelectItem>))}
                </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">{filteredApplications.length} candidates</p>
        </div>
        <div className="flex items-center gap-2">
            <Button variant={viewMode === 'table' ? 'secondary' : 'ghost'} size="icon" onClick={() => setViewMode('table')}><List className="h-4 w-4" /></Button>
            <Button variant={viewMode === 'kanban' ? 'secondary' : 'ghost'} size="icon" onClick={() => setViewMode('kanban')}><LayoutGrid className="h-4 w-4" /></Button>
        </div>
      </div>

        {selection.selectedIds.size > 0 && (
            <div className="sticky top-20 z-10 p-2 bg-secondary border rounded-lg shadow flex items-center justify-between">
                <p className="text-sm font-medium">{selection.selectedIds.size} candidate(s) selected</p>
                <div className="flex items-center gap-2">
                    <Button size="sm" onClick={() => setIsWizardOpen(true)}><CalendarPlus className="mr-2 h-4 w-4" />Schedule Interviews</Button>
                    <Button size="sm" variant="ghost" onClick={() => setSelection({ selectedIds: new Set() })}><X className="mr-2 h-4 w-4" />Clear selection</Button>
                </div>
            </div>
        )}

        {viewMode === 'table' ? (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]"><Checkbox checked={isAllFilteredSelected} onCheckedChange={handleSelectAllFiltered} aria-label="Select all" /></TableHead>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Interview Schedule</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedApplications.length > 0 ? (
                  sortedApplications.map(app => {
                    const scheduledInterview = getMostRelevantInterview(app);
                    return (
                      <TableRow key={app.id} data-state={selection.selectedIds.has(app.id!) && "selected"}>
                        <TableCell><Checkbox checked={selection.selectedIds.has(app.id!)} onCheckedChange={(checked) => handleSelectRow(app.id!, !!checked)} aria-label={`Select ${app.candidateName}`} /></TableCell>
                        <TableCell className="font-medium">{app.candidateName}</TableCell>
                        <TableCell><ApplicationStatusBadge status={app.status} /></TableCell>
                        <TableCell>
                          {scheduledInterview ? (
                            <div className="flex items-center gap-2">
                                {scheduledInterview.status === 'reschedule_requested' ? (
                                    <Badge variant="outline" className="text-amber-600 border-amber-500"><RefreshCw className="mr-2 h-3 w-3" /> Reschedule</Badge>
                                ) : (
                                    <Badge variant="outline">{format(scheduledInterview.startAt.toDate(), 'dd MMM, HH:mm')}</Badge>
                                )}
                            </div>
                          ) : '-'}
                        </TableCell>
                        <TableCell>{app.submittedAt ? format(app.submittedAt.toDate(), 'dd MMM yyyy') : '-'}</TableCell>
                        <TableCell className="text-right">
                          <Button asChild variant="ghost" size="icon">
                            <Link href={`/admin/recruitment/applications/${app.id}`}>
                              <Eye className="h-4 w-4" />
                              <span className="sr-only">View Application</span>
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    )})
                ) : (
                  <TableRow><TableCell colSpan={6} className="h-24 text-center">No applicants match the current filters.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        ) : (
            <CandidatesKanban applications={filteredApplications} />
        )}

      {userProfile && (
        <BulkScheduleWizard isOpen={isWizardOpen} onOpenChange={setIsWizardOpen} candidates={selectedApplications} recruiter={userProfile} onSuccess={() => setSelection({ selectedIds: new Set() })}/>
      )}
      {job && (
        <EditTemplateDialog open={isTemplateDialogOpen} onOpenChange={setIsTemplateDialogOpen} job={job} onSave={handleSaveTemplate} />
      )}
    </div>
  );
}
