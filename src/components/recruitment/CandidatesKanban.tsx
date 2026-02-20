'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import type { JobApplication } from '@/lib/types';
import { statusDisplayLabels } from './ApplicationStatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { id } from 'date-fns/locale';

// Define the order of columns in the Kanban board
const KANBAN_STAGES: JobApplication['status'][] = [
    'submitted',
    'tes_kepribadian',
    'document_submission',
    'verification',
    'interview',
    'hired',
];

const CandidateCard = ({ application }: { application: JobApplication }) => (
    <Card className="mb-4">
        <CardContent className="p-3">
            <div className="flex items-start gap-3">
                <Avatar className="h-9 w-9">
                    <AvatarImage src={`https://i.pravatar.cc/150?u=${application.candidateUid}`} />
                    <AvatarFallback>{getInitials(application.candidateName)}</AvatarFallback>
                </Avatar>
                <div className="flex-grow">
                    <Link href={`/admin/recruitment/applications/${application.id}`} className="font-semibold text-sm hover:underline">
                        {application.candidateName}
                    </Link>
                    <p className="text-xs text-muted-foreground">{application.jobPosition}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(application.updatedAt.toDate(), { addSuffix: true, locale: id })}
                    </p>
                </div>
            </div>
        </CardContent>
    </Card>
);

export function CandidatesKanban({ applications }: { applications: JobApplication[] }) {
    const applicationsByStage = useMemo(() => {
        const grouped: Record<string, JobApplication[]> = {};
        for (const stage of KANBAN_STAGES) {
            grouped[stage] = [];
        }

        for (const app of applications) {
            if (grouped[app.status]) {
                grouped[app.status].push(app);
            }
        }
        
        // Sort applications within each stage by last activity
        for (const stage of KANBAN_STAGES) {
            grouped[stage].sort((a, b) => b.updatedAt.toMillis() - a.updatedAt.toMillis());
        }

        return grouped;
    }, [applications]);

    return (
        <ScrollArea className="w-full whitespace-nowrap">
            <div className="flex gap-4 pb-4">
                {KANBAN_STAGES.map(stage => (
                    <div key={stage} className="w-72 flex-shrink-0">
                        <Card className="bg-muted/50 h-full">
                            <CardHeader className="p-3">
                                <CardTitle className="text-base font-medium flex items-center justify-between">
                                    <span>{statusDisplayLabels[stage]}</span>
                                    <span className="text-sm text-muted-foreground">{applicationsByStage[stage].length}</span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-3">
                                <ScrollArea className="h-[60vh]">
                                    {applicationsByStage[stage].length > 0 ? (
                                        applicationsByStage[stage].map(app => <CandidateCard key={app.id} application={app} />)
                                    ) : (
                                        <div className="text-center text-xs text-muted-foreground pt-10 px-4">
                                            Tidak ada kandidat di tahap ini.
                                        </div>
                                    )}
                                </ScrollArea>
                            </CardContent>
                        </Card>
                    </div>
                ))}
            </div>
            <ScrollBar orientation="horizontal" />
        </ScrollArea>
    );
}
