'use client';

import { useState, useMemo } from 'react';
import { collection, doc } from 'firebase/firestore';
import { useCollection, useFirestore, useMemoFirebase, deleteDocumentNonBlocking } from '@/firebase';
import type { Brand } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, Pencil, PlusCircle, Trash2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DeptBrandFormDialog } from './DeptBrandFormDialog';
import { DeleteConfirmationDialog } from './DeleteConfirmationDialog';
import { useToast } from '@/hooks/use-toast';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, AccordionHeader } from '@/components/ui/accordion';
import { DivisionTable } from './DivisionTable';

function DataSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-1/4 self-end" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
  );
}

export function DepartmentsBrandsClient() {
  const firestore = useFirestore();
  const { toast } = useToast();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Brand | null>(null);

  const brandsRef = useMemoFirebase(() => collection(firestore, 'brands'), [firestore]);
  const { data: brands, isLoading, error } = useCollection<Brand>(brandsRef);

  const handleCreate = () => {
    setSelectedItem(null);
    setIsFormOpen(true);
  };

  const handleEdit = (item: Brand) => {
    setSelectedItem(item);
    setIsFormOpen(true);
  };
  
  const handleDelete = (item: Brand) => {
    setSelectedItem(item);
    setIsDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!selectedItem || !selectedItem.id) return;
    const docRef = doc(firestore, 'brands', selectedItem.id);
    
    try {
        await deleteDocumentNonBlocking(docRef);
        toast({
          title: 'Brand Deleted',
          description: `The brand "${selectedItem.name}" has been deleted.`,
        });
    } catch (error: any) {
        toast({
            variant: "destructive",
            title: "Error deleting brand",
            description: error.message,
        });
    } finally {
        setIsDeleteConfirmOpen(false);
        setSelectedItem(null);
    }
  };
  
  const sortedBrands = useMemo(() => {
    if (!brands) return [];
    return [...brands].sort((a,b) => a.name.localeCompare(b.name));
  }, [brands]);

  if (isLoading) {
    return <DataSkeleton />;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error loading Brands</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
         <Button onClick={handleCreate}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Create Brand
          </Button>
      </div>

       <Accordion type="single" collapsible className="w-full space-y-4">
        {sortedBrands.map(brand => (
          <AccordionItem value={brand.id!} key={brand.id!} className="border rounded-lg bg-card shadow-sm">
            <AccordionHeader>
              <div className="flex justify-between items-center w-full px-6">
                <AccordionTrigger className="flex-1 text-left py-0 hover:no-underline">
                  <div>
                    <p className="font-semibold text-lg">{brand.name}</p>
                    <p className="text-sm text-muted-foreground">{brand.description || 'No description'}</p>
                  </div>
                </AccordionTrigger>
                <div className="pl-4">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => handleEdit(brand)}>
                          <Pencil className="mr-2 h-4 w-4" /> Edit Brand
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => handleDelete(brand)} className="text-destructive">
                          <Trash2 className="mr-2 h-4 w-4" /> Delete Brand
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                </div>
              </div>
            </AccordionHeader>
            <AccordionContent className="px-6 pb-6 border-t pt-4">
              <DivisionTable brand={brand} />
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      
      <DeptBrandFormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        item={selectedItem}
      />
      
      <DeleteConfirmationDialog
        open={isDeleteConfirmOpen}
        onOpenChange={setIsDeleteConfirmOpen}
        onConfirm={confirmDelete}
        itemName={selectedItem?.name}
        itemType="Brand"
      />
    </div>
  );
}
