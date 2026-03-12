'use client';

import { useState } from 'react';
import { collection, doc } from 'firebase/firestore';
import { useCollection, useFirestore, useMemoFirebase, deleteDocumentNonBlocking } from '@/firebase';
import type { Brand, Division } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, Pencil, PlusCircle, Trash2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { DeleteConfirmationDialog } from './DeleteConfirmationDialog';
import { useToast } from '@/hooks/use-toast';
import { DivisionFormDialog } from './DivisionFormDialog';
import { Badge } from '../ui/badge';

function DivisionTableSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-8 w-24 self-end" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

interface DivisionTableProps {
  brand: Brand;
}

export function DivisionTable({ brand }: DivisionTableProps) {
  const firestore = useFirestore();
  const { toast } = useToast();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [selectedDivision, setSelectedDivision] = useState<Division | null>(null);

  const divisionsRef = useMemoFirebase(() => collection(firestore, 'brands', brand.id!, 'divisions'), [firestore, brand.id]);
  const { data: divisions, isLoading, error } = useCollection<Division>(divisionsRef);

  const handleCreate = () => {
    setSelectedDivision(null);
    setIsFormOpen(true);
  };

  const handleEdit = (item: Division) => {
    setSelectedDivision(item);
    setIsFormOpen(true);
  };

  const handleDelete = (item: Division) => {
    setSelectedDivision(item);
    setIsDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!selectedDivision?.id) return;
    try {
      const docRef = doc(firestore, 'brands', brand.id!, 'divisions', selectedDivision.id);
      await deleteDocumentNonBlocking(docRef);
      toast({ title: 'Division Deleted' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Deletion Failed', description: e.message });
    } finally {
      setIsDeleteConfirmOpen(false);
    }
  };

  if (isLoading) {
    return <DivisionTableSkeleton />;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error loading divisions for {brand.name}</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="font-semibold">Divisions</h4>
        <Button size="sm" onClick={handleCreate}><PlusCircle className="mr-2 h-4 w-4" /> Add Division</Button>
      </div>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {divisions && divisions.length > 0 ? (
              divisions.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>{item.code || '-'}</TableCell>
                  <TableCell>
                    <Badge variant={item.isActive ? 'default' : 'secondary'}>
                      {item.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => handleEdit(item)}><Pencil className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => handleDelete(item)} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow><TableCell colSpan={4} className="h-24 text-center">No divisions found for this brand.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <DivisionFormDialog open={isFormOpen} onOpenChange={setIsFormOpen} brand={brand} division={selectedDivision} />
      <DeleteConfirmationDialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen} onConfirm={confirmDelete} itemName={selectedDivision?.name} itemType="Division" />
    </div>
  );
}
