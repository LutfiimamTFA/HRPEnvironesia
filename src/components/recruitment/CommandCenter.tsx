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
import { ArrowRight, Info } from 'lucide-react';
import Link from 'next/link';

export function CommandCenter({ applications }: { applications: JobApplication[] }) {
    const now = new Date();

    const needsActionApps = applications.filter(app => {
        if (app.status === 'submitted' || app.status === 'verification') {
            const daysInStage = app.updatedAt ? differenceInDays(now, app.updatedAt.toDate()) : 0;
            // Highlight if submitted more than 2 days ago or in verification for more than 5
            return (app.status === 'submitted' && daysInStage > 2) || (app.status === 'verification' && daysInStage > 5);
        }
        return false;
    }).slice(0, 5);
    
    // Placeholder as interview data is not in the model
    const upcomingInterviews: any[] = []; 
    // Placeholder as offer data is not in the model
    const offersPending = applications.filter(app => app.status === 'interview').slice(0,3);


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
                                <TableHead>Days Waiting</TableHead>
                                <TableHead className="text-right">Next Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {needsActionApps.length > 0 ? needsActionApps.map(app => {
                                const daysWaiting = app.updatedAt ? differenceInDays(now, app.updatedAt.toDate()) : 0;
                                const isOverdue = daysWaiting > 3;
                                return (
                                <TableRow key={app.id}>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <Avatar className="h-8 w-8">
                                                <AvatarImage src={app.candidatePhotoUrl} />
                                                <AvatarFallback>{getInitials(app.candidateName)}</AvatarFallback>
                                            </Avatar>
                                            <span className="font-medium text-sm">{app.candidateName}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-xs text-muted-foreground">{app.jobPosition}</TableCell>
                                    <TableCell><Badge variant="secondary" className="capitalize">{app.status}</Badge></TableCell>
                                    <TableCell>
                                        <span className={cn(isOverdue && "text-destructive font-bold")}>{daysWaiting} days</span>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button asChild size="sm">
                                            <Link href={`/admin/recruitment/applications/${app.id}`}>
                                                Review <ArrowRight className="ml-1 h-4 w-4" />
                                            </Link>
                                        </Button>
                                    </TableCell>
                                </TableRow>
                                )
                            }) : (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center h-24">
                                        No candidates currently need immediate action.
                                    </TableCell>
                                </TableRow>
                            )}
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
                         <div className="text-center py-4 text-sm text-muted-foreground flex flex-col items-center gap-2">
                            <Info className="h-5 w-5" />
                            <p>Data wawancara belum tersedia di model data aplikasi.</p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Offers Tracker</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <div className="text-center py-4 text-sm text-muted-foreground flex flex-col items-center gap-2">
                            <Info className="h-5 w-5" />
                            <p>Data penawaran belum tersedia di model data aplikasi.</p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
