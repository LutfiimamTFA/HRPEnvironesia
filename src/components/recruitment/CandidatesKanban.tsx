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
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, closestCenter, type DragStartEvent, type DragEndEvent } from '@dnd-kit/core';
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

const CandidateCard = ({ application, isDragging }: { application: JobApplication, isDragging?: boolean }) => (
    <Card className={cn("mb-4", isDragging && "ring-2 ring-primary shadow-lg")}>
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
        opacity: isDragging ? 0.4 : 1,
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
                           <div className="min-h-[1px]">
                                {applications.map(app => (
                                    <SortableCandidateCard key={app.id} application={app} />
                                ))}
                            </div>
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
            distance: 8, // User must drag for 8px before a drag starts
          },
        })
    );
    
    const findContainer = (id: string) => {
        if (KANBAN_STAGES.includes(id as any)) {
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
    
    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveApplication(null); // Reset overlay immediately
        if (!over) return;

        const activeId = active.id as string;
        const overId = over.id as string;
        
        const activeContainer = findContainer(activeId);
        const overContainer = findContainer(overId);

        if (!activeContainer || !overContainer) return;
        
        if (activeContainer === overContainer) {
             // Reordering within the same column
            if (activeId !== overId) {
                setApplications(prev => {
                    const items = prev[activeContainer as JobApplication['status']];
                    const oldIndex = items.findIndex(item => item.id === activeId);
                    const newIndex = items.findIndex(item => item.id === overId);
                    
                    return {
                        ...prev,
                        [activeContainer]: arrayMove(items, oldIndex, newIndex)
                    };
                });
            }
        } else {
            // Moving to a different column
            const activeItems = applications[activeContainer as JobApplication['status']];
            const overItems = applications[overContainer as JobApplication['status']];
            const activeIndex = activeItems.findIndex(app => app.id === activeId);
            const overIndex = overItems.findIndex(app => app.id === overId);
            
            // Perform state update
            let newApplicationsState = {...applications};
            const [movedItem] = newApplicationsState[activeContainer as JobApplication['status']].splice(activeIndex, 1);
            
            if (overIndex >= 0) {
                newApplicationsState[overContainer as JobApplication['status']].splice(overIndex, 0, movedItem);
            } else {
                 newApplicationsState[overContainer as JobApplication['status']].push(movedItem);
            }
            setApplications(newApplicationsState);

            // Update Firestore
            const newStage = overContainer as JobApplication['status'];
            try {
                const appRef = doc(firestore, 'applications', activeId);
                await updateDocumentNonBlocking(appRef, {
                    status: newStage,
                    updatedAt: serverTimestamp()
                });
                toast({
                    title: 'Status Diperbarui',
                    description: `${movedItem.candidateName} dipindahkan ke tahap "${statusDisplayLabels[newStage]}".`
                });
            } catch (error: any) {
                 toast({
                    variant: 'destructive',
                    title: 'Gagal Memperbarui',
                    description: `Tidak dapat memindahkan kandidat: ${error.message}`
                });
                // Revert UI change
                setApplications(applications);
            }
        }
    };

    const containerIds = useMemo(() => Object.keys(applications), [applications]);

    return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
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
                {activeApplication ? <CandidateCard application={activeApplication} isDragging /> : null}
            </DragOverlay>
        </DndContext>
    );
}
    