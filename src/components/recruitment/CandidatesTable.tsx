'use client';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { JobApplication } from '@/lib/types';
import { getInitials } from '@/lib/utils';
import { MoreHorizontal, ArrowRight, User } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { differenceInDays, format } from 'date-fns';

export function CandidatesTable({ applications }: { applications: JobApplication[] }) {
    const now = new Date();
    return (
        <div className="rounded-lg border">
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Candidate</TableHead>
                    <TableHead>Job</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Days in Stage</TableHead>
                    <TableHead>Last Activity</TableHead>
                    <TableHead>Recruiter</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {applications.map(app => (
                    <TableRow key={app.id}>
                        <TableCell>
                            <div className="flex items-center gap-3">
                                <Avatar className="h-9 w-9">
                                    <AvatarImage src={app.candidatePhotoUrl} />
                                    <AvatarFallback>{getInitials(app.candidateName)}</AvatarFallback>
                                </Avatar>
                                <div>
                                    <p className="font-medium">{app.candidateName}</p>
                                    <p className="text-xs text-muted-foreground">{app.candidateEmail}</p>
                                </div>
                            </div>
                        </TableCell>
                        <TableCell className="text-sm">{app.jobPosition}</TableCell>
                        <TableCell><Badge variant="secondary" className="capitalize">{app.stage}</Badge></TableCell>
                        <TableCell className="capitalize">{app.source}</TableCell>
                        <TableCell>{differenceInDays(now, app.stageEnteredAt.toDate())}d</TableCell>
                        <TableCell>{format(app.lastActivityAt.toDate(), 'dd MMM yyyy')}</TableCell>
                        <TableCell><div className="flex items-center gap-2"><User className="h-4 w-4" /> Budi S.</div></TableCell>
                        <TableCell className="text-right">
                             <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon"><MoreHorizontal /></Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent>
                                    <DropdownMenuItem>View Profile</DropdownMenuItem>
                                    <DropdownMenuItem>Add Note</DropdownMenuItem>
                                    <DropdownMenuItem>Schedule Interview</DropdownMenuItem>
                                </DropdownMenuContent>
                             </DropdownMenu>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
        </div>
    );
}
