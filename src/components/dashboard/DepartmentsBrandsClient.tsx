'use client';

import { useState } from 'react';
import { collection, doc, deleteDoc } from 'firebase/firestore';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import type { Brand, Department } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, Pencil, PlusCircle, Trash2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DeptBrandFormDialog } from './DeptBrandFormDialog';
import { DeleteConfirmationDialog } from './DeleteConfirmationDialog';
import { useToast } from '@/hooks/use-toast';


type ItemType = 'Brand' | 'Department';

function DataTableSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-1/4" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

interface DataTableProps {
  type: ItemType;
  data: any[] | null;
  isLoading: boolean;
  error: Error | null;
  onEdit: (item: any, type: ItemType) => void;
  onDelete: (item: any, type: ItemType) => void;
}

function DataTable({ type, data, isLoading, error, onEdit, onDelete }: DataTableProps) {
  if (isLoading) {
    return <DataTableSkeleton />;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error loading {type}s</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead className="w-[100px] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data && data.length > 0 ? (
            data.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(item, type)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive focus:bg-destructive/10"
                        onClick={() => onDelete(item, type)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={2} className="h-24 text-center">
                No {type.toLowerCase()}s found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}


export function DepartmentsBrandsClient() {
  const firestore = useFirestore();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<ItemType>('Brand');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Brand | Department | null>(null);
  const [currentItemType, setCurrentItemType] = useState<ItemType>('Brand');

  const brandsRef = useMemoFirebase(() => collection(firestore, 'brands'), [firestore]);
  const departmentsRef = useMemoFirebase(() => collection(firestore, 'departments'), [firestore]);

  const { data: brands, isLoading: brandsLoading, error: brandsError } = useCollection<Brand>(brandsRef);
  const { data: departments, isLoading: departmentsLoading, error: departmentsError } = useCollection<Department>(departmentsRef);

  const handleCreate = () => {
    setSelectedItem(null);
    setCurrentItemType(activeTab);
    setIsFormOpen(true);
  };

  const handleEdit = (item: Brand | Department, type: ItemType) => {
    setSelectedItem(item);
    setCurrentItemType(type);
    setIsFormOpen(true);
  };
  
  const handleDelete = (item: Brand | Department, type: ItemType) => {
    setSelectedItem(item);
    setCurrentItemType(type);
    setIsDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!selectedItem || !selectedItem.id) return;
    const collectionName = currentItemType === 'Brand' ? 'brands' : 'departments';
    try {
      await deleteDoc(doc(firestore, collectionName, selectedItem.id));
      toast({
        title: `${currentItemType} Deleted`,
        description: `The ${currentItemType.toLowerCase()} "${selectedItem.name}" has been deleted.`,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: `Error deleting ${currentItemType}`,
        description: error.message,
      });
    } finally {
      setIsDeleteConfirmOpen(false);
      setSelectedItem(null);
    }
  };

  return (
    <div className="space-y-4">
      <Tabs defaultValue="brands" className="w-full" onValueChange={(value) => setActiveTab(value as ItemType)}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="brands">Brands</TabsTrigger>
            <TabsTrigger value="departments">Departments</TabsTrigger>
          </TabsList>
           <Button onClick={handleCreate}>
              <PlusCircle className="mr-2 h-4 w-4" />
              Create {activeTab}
            </Button>
        </div>
        <TabsContent value="brands" className="mt-4">
          <DataTable
            type="Brand"
            data={brands}
            isLoading={brandsLoading}
            error={brandsError}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        </TabsContent>
        <TabsContent value="departments" className="mt-4">
          <DataTable
            type="Department"
            data={departments}
            isLoading={departmentsLoading}
            error={departmentsError}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        </TabsContent>
      </Tabs>
      
      <DeptBrandFormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        item={selectedItem}
        type={currentItemType}
      />
      
      <DeleteConfirmationDialog
        open={isDeleteConfirmOpen}
        onOpenChange={setIsDeleteConfirmOpen}
        onConfirm={confirmDelete}
        itemName={selectedItem?.name}
        itemType={currentItemType}
      />
    </div>
  );
}
