'use client';

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import type { JobApplication } from '@/lib/types';
import { statusDisplayLabels } from './ApplicationStatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials, cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { id } from 'date-fns/locale';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, closestCorners, type DragStartEvent, type DragEndEvent, type DragOverEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { doc, serverTimestamp } from 'firebase/firestore';
import { useFirestore, updateDocumentNonBlocking } from '@/firebase';
import { useToast } from '@/hooks/use-toast';

// Define the order of columns in the Kanban board
const KANBAN_STAGES: JobApplication['status'][] = [
    'submitted',
    'tes_kepribadian',
    'document_submission',
    'verification',
    'interview',
    'hired',
];

type ApplicationGroup = Record<JobApplication['status'], JobApplication[]>;

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

const SortableCandidateCard = ({ application }: { application: JobApplication }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: application.id! });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
            <CandidateCard application={application} />
        </div>
    );
};

const KanbanColumn = ({ stage, applications }: { stage: JobApplication['status']; applications: JobApplication[] }) => {
    return (
        <div className="w-72 flex-shrink-0">
            <Card className="bg-muted/50 h-full">
                <CardHeader className="p-3">
                    <CardTitle className="text-base font-medium flex items-center justify-between">
                        <span>{statusDisplayLabels[stage]}</span>
                        <span className="text-sm text-muted-foreground">{applications.length}</span>
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-3">
                    <ScrollArea className="h-[60vh]">
                        <SortableContext items={applications.map(app => app.id!)}>
                            {applications.map(app => (
                                <SortableCandidateCard key={app.id} application={app} />
                            ))}
                        </SortableContext>
                    </ScrollArea>
                </CardContent>
            </Card>
        </div>
    );
};


export function CandidatesKanban({ applications: initialApplications }: { applications: JobApplication[] }) {
    const [applications, setApplications] = useState<ApplicationGroup>(() => {
        const grouped: ApplicationGroup = {} as ApplicationGroup;
        KANBAN_STAGES.forEach(stage => { grouped[stage] = [] });
        initialApplications.forEach(app => {
            if (grouped[app.status]) {
                grouped[app.status].push(app);
            }
        });
        return grouped;
    });
    
    useEffect(() => {
        const grouped: ApplicationGroup = {} as ApplicationGroup;
        KANBAN_STAGES.forEach(stage => { grouped[stage] = [] });
        initialApplications.forEach(app => {
            if (grouped[app.status]) {
                grouped[app.status].push(app);
            }
        });
        setApplications(grouped);
    }, [initialApplications]);

    const [activeApplication, setActiveApplication] = useState<JobApplication | null>(null);
    const firestore = useFirestore();
    const { toast } = useToast();

    const sensors = useSensors(
        useSensor(PointerSensor, {
          activationConstraint: {
            distance: 5,
          },
        })
    );
    
    const findContainer = (id: string) => {
        if (id in applications) {
            return id;
        }
        return Object.keys(applications).find((key) => applications[key as JobApplication['status']].some(app => app.id === id));
    };

    const handleDragStart = (event: DragStartEvent) => {
        const { active } = event;
        const container = findContainer(active.id as string);
        if (container) {
            setActiveApplication(applications[container as JobApplication['status']].find(app => app.id === active.id) || null);
        }
    };
    
    const handleDragOver = (event: DragOverEvent) => {
        const { active, over } = event;
        if (!over) return;
    
        const activeContainer = findContainer(active.id as string);
        const overContainer = findContainer(over.id as string);
    
        if (!activeContainer || !overContainer || activeContainer === overContainer) {
            return;
        }
    
        setApplications((prev) => {
            const activeItems = prev[activeContainer as JobApplication['status']];
            const overItems = prev[overContainer as JobApplication['status']];
            const activeIndex = activeItems.findIndex(item => item.id === active.id);
            const overIndex = overItems.findIndex(item => item.id === over.id);
    
            let newIndex;
            if (over.id in prev) {
                newIndex = overItems.length;
            } else {
                const isBelowLastItem = over && overIndex === overItems.length - 1;
                const modifier = isBelowLastItem ? 1 : 0;
                newIndex = overIndex >= 0 ? overIndex + modifier : overItems.length;
            }
            
            const newApps = { ...prev };
            const [movedItem] = newApps[activeContainer as JobApplication['status']].splice(activeIndex, 1);
            newApps[overContainer as JobApplication['status']].splice(newIndex, 0, movedItem);
    
            return newApps;
        });
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;

        if (!over) {
            setActiveApplication(null);
            return;
        }

        const activeContainer = findContainer(active.id as string);
        const overContainer = findContainer(over.id as string);

        if (!activeContainer || !overContainer || activeContainer === overContainer) {
            setActiveApplication(null);
            return;
        }
        
        const activeIndex = applications[activeContainer as JobApplication['status']].findIndex(item => item.id === active.id);
        const overIndex = applications[overContainer as JobApplication['status']].findIndex(item => item.id === over.id);

        let newIndex;
        if (over.id in applications) {
            newIndex = applications[overContainer as JobApplication['status']].length;
        } else {
            const isBelowLastItem = over && overIndex === applications[overContainer as JobApplication['status']].length - 1;
            const modifier = isBelowLastItem ? 1 : 0;
            newIndex = overIndex >= 0 ? overIndex + modifier : applications[overContainer as JobApplication['status']].length;
        }

        const movedApplication = initialApplications.find(app => app.id === active.id);
        const newStage = overContainer as JobApplication['status'];

        if (movedApplication && movedApplication.status !== newStage) {
            try {
                const appRef = doc(firestore, 'applications', movedApplication.id!);
                await updateDocumentNonBlocking(appRef, {
                    status: newStage,
                    updatedAt: serverTimestamp()
                });
                toast({
                    title: 'Status Diperbarui',
                    description: `${movedApplication.candidateName} dipindahkan ke tahap "${statusDisplayLabels[newStage]}".`
                });
            } catch (error: any) {
                toast({
                    variant: 'destructive',
                    title: 'Gagal Memperbarui',
                    description: `Tidak dapat memindahkan kandidat: ${error.message}`
                });
                // Revert UI change by resetting to initial state
                setApplications(() => {
                    const grouped: ApplicationGroup = {} as ApplicationGroup;
                    KANBAN_STAGES.forEach(stage => { grouped[stage] = [] });
                    initialApplications.forEach(app => {
                        if (grouped[app.status]) {
                            grouped[app.status].push(app);
                        }
                    });
                    return grouped;
                });
            }
        }
        
        setActiveApplication(null);
    };

    return (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
            <ScrollArea className="w-full whitespace-nowrap">
                <div className="flex gap-4 pb-4">
                    {KANBAN_STAGES.map(stage => (
                        <KanbanColumn
                            key={stage}
                            stage={stage}
                            applications={applications[stage] || []}
                        />
                    ))}
                </div>
                <ScrollBar orientation="horizontal" />
            </ScrollArea>
             <DragOverlay>
                {activeApplication ? <CandidateCard application={activeApplication} /> : null}
            </DragOverlay>
        </DndContext>
    );
}