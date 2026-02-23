
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useAuth } from '@/providers/auth-provider';
import type { JobApplication, JobApplicationStatus } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Eye, CalendarPlus, List, LayoutGrid } from 'lucide-react';
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

type SelectionState = {
  mode: 'none' | 'all' | 'some';
  selectedIds: Set<string>;
};

export function ApplicantsPageClient({ applications }: { applications: JobApplication[] }) {
  const { userProfile } = useAuth();
  const [selection, setSelection] = useState<SelectionState>({ mode: 'none', selectedIds: new Set() });
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table');
  const { toast } = useToast();

  const filteredApplications = useMemo(() => {
    if (stageFilter === 'all') {
      return applications;
    }
    return applications.filter(app => app.status === stageFilter);
  }, [applications, stageFilter]);
  
  useEffect(() => {
    // Reset selection when filter changes
    setSelection({ mode: 'none', selectedIds: new Set() });
  }, [stageFilter]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelection({ mode: 'all', selectedIds: new Set(filteredApplications.map(app => app.id!)) });
    } else {
      setSelection({ mode: 'none', selectedIds: new Set() });
    }
  };

  const handleSelectRow = (appId: string, checked: boolean) => {
    setSelection(prev => {
      const newSelectedIds = new Set(prev.selectedIds);
      if (checked) {
        newSelectedIds.add(appId);
      } else {
        newSelectedIds.delete(appId);
      }
      
      const newMode = newSelectedIds.size === filteredApplications.length ? 'all' : newSelectedIds.size > 0 ? 'some' : 'none';
      return { mode: newMode, selectedIds: newSelectedIds };
    });
  };

  const selectedApplications = useMemo(() => {
    return applications.filter(app => selection.selectedIds.has(app.id!));
  }, [applications, selection.selectedIds]);

  const sortedApplications = useMemo(() => {
    if (!filteredApplications) return [];
    return [...filteredApplications].sort((a, b) => {
      const timeA = a.submittedAt?.toMillis() || a.createdAt.toMillis();
      const timeB = b.submittedAt?.toMillis() || b.createdAt.toMillis();
      return timeB - timeA;
    });
  }, [filteredApplications]);
  
  const getNextScheduledInterview = (app: JobApplication) => {
    if (!app.interviews || app.interviews.length === 0) return null;
    const upcoming = app.interviews
      .filter(i => i.status === 'scheduled' && i.startAt.toDate() >= new Date())
      .sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis());
    return upcoming[0];
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
            <Select value={stageFilter} onValueChange={setStageFilter}>
                <SelectTrigger className="w-[240px]">
                    <SelectValue placeholder="Filter by stage..." />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Stages</SelectItem>
                    {ORDERED_RECRUITMENT_STAGES.map((stage) => (
                        <SelectItem key={stage} value={stage}>{statusDisplayLabels[stage]}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">{filteredApplications.length} candidates</p>
        </div>
        <div className="flex items-center gap-2">
           {selection.selectedIds.size > 0 && (
            <Button onClick={() => setIsWizardOpen(true)}>
                <CalendarPlus className="mr-2 h-4 w-4" />
                Schedule Interviews ({selection.selectedIds.size})
            </Button>
            )}
            <Button variant={viewMode === 'table' ? 'secondary' : 'ghost'} size="icon" onClick={() => setViewMode('table')}><List className="h-4 w-4" /></Button>
            <Button variant={viewMode === 'kanban' ? 'secondary' : 'ghost'} size="icon" onClick={() => setViewMode('kanban')}><LayoutGrid className="h-4 w-4" /></Button>
        </div>
      </div>

        {viewMode === 'table' ? (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">
                    <Checkbox
                      checked={
                        selection.mode === 'all'
                          ? true
                          : selection.mode === 'some'
                          ? 'indeterminate'
                          : false
                      }
                      onCheckedChange={handleSelectAll}
                      aria-label="Select all"
                    />
                  </TableHead>
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
                    const scheduledInterview = getNextScheduledInterview(app);
                    return (
                      <TableRow key={app.id} data-state={selection.selectedIds.has(app.id!) && "selected"}>
                        <TableCell>
                          <Checkbox
                            checked={selection.selectedIds.has(app.id!)}
                            onCheckedChange={(checked) => handleSelectRow(app.id!, !!checked)}
                            aria-label={`Select ${app.candidateName}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{app.candidateName}</TableCell>
                        <TableCell><ApplicationStatusBadge status={app.status} /></TableCell>
                        <TableCell>
                          {scheduledInterview ? (
                            <Badge variant="outline">{format(scheduledInterview.startAt.toDate(), 'dd MMM, HH:mm')}</Badge>
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
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                      No applicants match the current filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        ) : (
            <CandidatesKanban applications={filteredApplications} />
        )}

      {userProfile && (
        <BulkScheduleWizard
            isOpen={isWizardOpen}
            onOpenChange={setIsWizardOpen}
            candidates={selectedApplications}
            recruiter={userProfile}
            onSuccess={() => setSelection({ mode: 'none', selectedIds: new Set() })}
        />
      )}
    </div>
  );
}
