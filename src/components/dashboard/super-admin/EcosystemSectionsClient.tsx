'use client';

import { useState, useMemo } from 'react';
import { useCollection, useFirestore, useMemoFirebase, deleteDocumentNonBlocking } from '@/firebase';
import { collection, query, doc, orderBy } from 'firebase/firestore';
import type { EcosystemSection } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { MoreHorizontal, Pencil, PlusCircle, Trash2, Eye, EyeOff } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { DeleteConfirmationDialog } from '../DeleteConfirmationDialog';
import { EcosystemSectionFormDialog } from './EcosystemSectionFormDialog';
import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';

function TableSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-32 ml-auto" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    </div>
  );
}

export function EcosystemSectionsClient() {
  const firestore = useFirestore();
  const { toast } = useToast();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<EcosystemSection | null>(null);

  const sectionsQuery = useMemoFirebase(
    () => query(collection(firestore, 'ecosystem_sections'), orderBy('sortOrder')),
    [firestore]
  );
  const { data: sections, isLoading, error, mutate } = useCollection<EcosystemSection>(sectionsQuery);

  const handleCreate = () => {
    setSelectedItem(null);
    setIsFormOpen(true);
  };

  const handleEdit = (item: EcosystemSection) => {
    setSelectedItem(item);
    setIsFormOpen(true);
  };

  const handleDelete = (item: EcosystemSection) => {
    setSelectedItem(item);
    setIsDeleteConfirmOpen(true);
  };
  
  const confirmDelete = async () => {
    if (!selectedItem?.id) return;
    try {
      await deleteDocumentNonBlocking(doc(firestore, 'ecosystem_sections', selectedItem.id));
      toast({ title: 'Section Deleted', description: `"${selectedItem.title}" has been removed.` });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Deletion Failed', description: e.message });
    } finally {
      setIsDeleteConfirmOpen(false);
    }
  };

  if (isLoading) return <TableSkeleton />;
  if (error) return <Alert variant="destructive"><AlertTitle>Error</AlertTitle><AlertDescription>{error.message}</AlertDescription></Alert>;

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button onClick={handleCreate}><PlusCircle className="mr-2 h-4 w-4" /> Add Section</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {sections && sections.length > 0 ? (
          sections.map(item => (
            <Card key={item.id}>
                <CardHeader>
                    <div className="flex justify-between items-start">
                        <div>
                            <CardTitle>{item.title}</CardTitle>
                            <CardDescription>Key: {item.sectionKey}</CardDescription>
                        </div>
                         <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onSelect={() => handleEdit(item)}><Pencil className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => handleDelete(item)} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground italic mb-4">{item.subtitle || item.description}</p>
                     {item.imageUrls && item.imageUrls.length > 1 ? (
                        <Carousel className="w-full max-w-sm mx-auto">
                            <CarouselContent>
                                {item.imageUrls.map((url, index) => (
                                    <CarouselItem key={index}>
                                        <div className="p-1">
                                            <div className="relative aspect-video">
                                                <Image src={url} alt={`Image ${index + 1}`} layout="fill" className="object-cover rounded-md" />
                                            </div>
                                        </div>
                                    </CarouselItem>
                                ))}
                            </CarouselContent>
                            <CarouselPrevious />
                            <CarouselNext />
                        </Carousel>
                    ) : item.imageUrls && item.imageUrls.length === 1 ? (
                        <div className="relative aspect-video">
                            <Image src={item.imageUrls[0]} alt={item.title} layout="fill" className="object-cover rounded-md" />
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">No image.</p>
                    )}
                </CardContent>
                 <CardFooter className="flex justify-between">
                    <Badge variant={item.isActive ? 'default' : 'secondary'}>{item.isActive ? 'Active' : 'Inactive'}</Badge>
                    <span className="text-xs text-muted-foreground">Order: {item.sortOrder}</span>
                 </CardFooter>
            </Card>
          ))
        ) : (
          <p className="text-center text-muted-foreground py-10 md:col-span-2">No sections found.</p>
        )}
      </div>
      <EcosystemSectionFormDialog 
        open={isFormOpen} 
        onOpenChange={setIsFormOpen} 
        item={selectedItem}
        onSuccess={mutate}
      />
      <DeleteConfirmationDialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen} onConfirm={confirmDelete} itemName={selectedItem?.title} itemType="Ecosystem Section" />
    </>
  );
}
