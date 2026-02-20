'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { JobApplication } from '@/lib/types';
import { getInitials } from '@/lib/utils';
import { differenceInDays, format } from 'date-fns';
import { cn } from '@/lib/utils';
import { ArrowRight } from 'lucide-react';

export function CommandCenter({ applications }: { applications: JobApplication[] }) {
    const now = new Date();

    const needsActionApps = applications.filter(app => {
        const daysInStage = differenceInDays(now, app.stageEnteredAt.toDate());
        return app.status === 'active' && (
            app.stage === 'applied' ||
            (app.stage === 'screening' && daysInStage > 3) ||
            app.stage === 'assessment' ||
            app.stage === 'offer'
        );
    }).slice(0, 5);

    const upcomingInterviews = applications
        .flatMap(app => (app.interviews || []).map(interview => ({ ...interview, candidateName: app.candidateName, jobPosition: app.jobPosition })))
        .filter(interview => interview.status === 'scheduled' && interview.dateTime.toDate() > now)
        .sort((a,b) => a.dateTime.toMillis() - b.dateTime.toMillis())
        .slice(0, 5);

    return (
        <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
                <CardHeader>
                    <CardTitle>Command Center: Needs Action</CardTitle>
                    <CardDescription>Prioritized list of candidates requiring your attention.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Candidate</TableHead>
                                <TableHead>Job</TableHead>
                                <TableHead>Stage</TableHead>
                                <TableHead>Days in Stage</TableHead>
                                <TableHead className="text-right">Next Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {needsActionApps.map(app => {
                                const daysInStage = differenceInDays(now, app.stageEnteredAt.toDate());
                                const isOverdue = (app.stage === 'screening' && daysInStage > 3);
                                return (
                                <TableRow key={app.id}>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <Avatar className="h-8 w-8">
                                                <AvatarImage src={app.candidatePhotoUrl} />
                                                <AvatarFallback>{getInitials(app.candidateName)}</AvatarFallback>
                                            </Avatar>
                                            <span className="font-medium">{app.candidateName}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-xs text-muted-foreground">{app.jobPosition}</TableCell>
                                    <TableCell><Badge variant="secondary" className="capitalize">{app.stage}</Badge></TableCell>
                                    <TableCell>
                                        <span className={cn(isOverdue && "text-destructive font-bold")}>{daysInStage} days</span>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button size="sm">Review <ArrowRight className="ml-1" /></Button>
                                    </TableCell>
                                </TableRow>
                                )
                            })}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <div className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Upcoming Interviews</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {upcomingInterviews.map((interview, i) => (
                            <div key={i}>
                                <p className="font-semibold text-sm">{interview.candidateName} - <span className="text-muted-foreground">{interview.jobPosition}</span></p>
                                <p className="text-xs text-muted-foreground">{format(interview.dateTime.toDate(), 'eee, dd MMM, HH:mm')}</p>
                            </div>
                        ))}
                         {upcomingInterviews.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No upcoming interviews.</p>}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Offers Tracker</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {/* Placeholder */}
                        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Pending Response</span><span className="font-bold">3</span></div>
                        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Accepted</span><span className="font-bold">8</span></div>
                        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Rejected</span><span className="font-bold">2</span></div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
