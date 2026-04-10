'use client';

import { useState, useMemo } from 'react';
import { useCollection, useFirestore, useMemoFirebase, deleteDocumentNonBlocking } from '@/firebase';
import { collection, query, doc, orderBy } from 'firebase/firestore';
import type { EcosystemCompany } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { MoreHorizontal, Pencil, PlusCircle, Trash2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { DeleteConfirmationDialog } from '../DeleteConfirmationDialog';
import { EcosystemCompanyFormDialog } from './EcosystemCompanyFormDialog';
import Image from 'next/image';

function TableSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-32 ml-auto" />
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {[...Array(6)].map((_, i) => <TableHead key={i}><Skeleton className="h-5 w-full" /></TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...Array(3)].map((_, i) => (
              <TableRow key={i}>
                {[...Array(6)].map((_, j) => <TableCell key={j}><Skeleton className="h-6 w-full" /></TableCell>)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function EcosystemCompaniesClient() {
  const firestore = useFirestore();
  const { toast } = useToast();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<EcosystemCompany | null>(null);

  const companiesQuery = useMemoFirebase(
    () => query(collection(firestore, 'ecosystem_companies')),
    [firestore]
  );
  const { data: companies, isLoading, error } = useCollection<EcosystemCompany>(companiesQuery);

  const sortedCompanies = useMemo(() => {
    if (!companies) return [];
    return [...companies].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }, [companies]);

  const handleCreate = () => {
    setSelectedItem(null);
    setIsFormOpen(true);
  };

  const handleEdit = (item: EcosystemCompany) => {
    setSelectedItem(item);
    setIsFormOpen(true);
  };

  const handleDelete = (item: EcosystemCompany) => {
    setSelectedItem(item);
    setIsDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!selectedItem?.id) return;
    try {
      await deleteDocumentNonBlocking(doc(firestore, 'ecosystem_companies', selectedItem.id));
      toast({ title: 'Company Deleted', description: `"${selectedItem.name}" has been removed.` });
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
        <Button onClick={handleCreate}><PlusCircle className="mr-2 h-4 w-4" /> Add Company</Button>
      </div>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Logo</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Website URL</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedCompanies && sortedCompanies.length > 0 ? (
              sortedCompanies.map(item => (
                <TableRow key={item.id}>
                  <TableCell>{item.sortOrder}</TableCell>
                  <TableCell>
                    <Image src={item.iconUrl} alt={item.name} width={80} height={40} className="object-contain h-10" />
                  </TableCell>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell><a href={item.websiteUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">{item.websiteUrl}</a></TableCell>
                  <TableCell><Badge variant={item.isActive ? 'default' : 'secondary'}>{item.isActive ? 'Active' : 'Inactive'}</Badge></TableCell>
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
              <TableRow><TableCell colSpan={6} className="h-24 text-center">No companies found.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <EcosystemCompanyFormDialog open={isFormOpen} onOpenChange={setIsFormOpen} item={selectedItem} />
      <DeleteConfirmationDialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen} onConfirm={confirmDelete} itemName={selectedItem?.name} itemType="Ecosystem Company" />
    </>
  );
}
