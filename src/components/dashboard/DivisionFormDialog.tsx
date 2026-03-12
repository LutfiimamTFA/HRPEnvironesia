'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { doc, collection } from 'firebase/firestore';
import { useFirestore, setDocumentNonBlocking } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import type { Division, Brand } from '@/lib/types';
import { Textarea } from '../ui/textarea';
import { Switch } from '../ui/switch';

const formSchema = z.object({
  name: z.string().min(2, { message: 'Name must be at least 2 characters.' }),
  code: z.string().optional(),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
});

type FormValues = z.infer<typeof formSchema>;

interface DivisionFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brand: Brand;
  division: Division | null;
}

export function DivisionFormDialog({ open, onOpenChange, brand, division }: DivisionFormDialogProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const mode = division ? 'Edit' : 'Create';

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '', code: '', description: '', isActive: true },
  });

  useEffect(() => {
    if (open) {
      form.reset(
        division
          ? { ...division }
          : { name: '', code: '', description: '', isActive: true }
      );
    }
  }, [open, division, form]);

  const onSubmit = async (values: FormValues) => {
    setLoading(true);
    try {
        const docRef = division 
          ? doc(firestore, 'brands', brand.id!, 'divisions', division.id!) 
          : doc(collection(firestore, 'brands', brand.id!, 'divisions'));
        
        await setDocumentNonBlocking(docRef, { ...values }, { merge: true });
        
        toast({
          title: `Division ${mode === 'Edit' ? 'Updated' : 'Created'}`,
          description: `The division "${values.name}" has been saved.`,
        });

        onOpenChange(false);
    } catch (error: any) {
        toast({
            variant: "destructive",
            title: `Error saving division`,
            description: error.message || "An unknown error occurred.",
        });
    } finally {
        setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{mode} Division for {brand.name}</DialogTitle>
          <DialogDescription>
            Fill in the details for the division. Click save when you're done.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} id="division-form" className="space-y-4 py-4">
            <FormField control={form.control} name="name" render={({ field }) => (<FormItem><FormLabel>Name</FormLabel><FormControl><Input placeholder="Division name" {...field} /></FormControl><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="code" render={({ field }) => (<FormItem><FormLabel>Code (Optional)</FormLabel><FormControl><Input placeholder="e.g., FIN, HR" {...field} /></FormControl><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="description" render={({ field }) => (<FormItem><FormLabel>Description</FormLabel><FormControl><Textarea placeholder="A short description of the division." {...field} value={field.value || ''} /></FormControl><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="isActive" render={({ field }) => (<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm"><FormLabel>Active Status</FormLabel><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>)} />
          </form>
        </Form>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="division-form" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
