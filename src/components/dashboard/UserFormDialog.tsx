'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { UserProfile, ROLES, UserRole, Brand } from '@/lib/types';
import { Loader2 } from 'lucide-react';
import { doc, collection } from 'firebase/firestore';
import { useFirestore, updateDocumentNonBlocking, useCollection, useMemoFirebase } from '@/firebase';
import { ScrollArea } from '../ui/scroll-area';

interface UserFormDialogProps {
  user: UserProfile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seedSecret: string;
}

const createSchema = z.object({
  fullName: z.string().min(2, { message: 'Full name is required.' }),
  email: z.string().email({ message: 'A valid email is required.' }),
  role: z.enum(ROLES),
  isActive: z.boolean().default(true),
  password: z.string().min(8, { message: 'Password must be at least 8 characters.' }),
  managedBrandIds: z.array(z.string()).optional(),
});

const editSchema = z.object({
  fullName: z.string().min(2, { message: 'Full name is required.' }),
  email: z.string().email(), // Readonly
  role: z.enum(ROLES),
  isActive: z.boolean(),
  managedBrandIds: z.array(z.string()).optional(),
});

type FormValues = z.infer<typeof createSchema> | z.infer<typeof editSchema>;

export function UserFormDialog({ user, open, onOpenChange, seedSecret }: UserFormDialogProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const firestore = useFirestore();
  const mode = user ? 'edit' : 'create';

  const brandsCollectionRef = useMemoFirebase(() => collection(firestore, 'brands'), [firestore]);
  const { data: brands, isLoading: brandsLoading } = useCollection<Brand>(brandsCollectionRef);

  const form = useForm({
    resolver: zodResolver(mode === 'create' ? createSchema : editSchema),
    defaultValues:
      mode === 'edit' && user
        ? {
            fullName: user.fullName,
            email: user.email,
            role: user.role,
            isActive: user.isActive,
            managedBrandIds: user.managedBrandIds || [],
          }
        : {
            fullName: '',
            email: '',
            role: 'kandidat' as UserRole,
            isActive: true,
            password: '',
            managedBrandIds: [],
          },
  });

  const selectedRole = form.watch('role');

  useEffect(() => {
    if (open) {
      form.reset(
        mode === 'edit' && user
          ? {
              fullName: user.fullName,
              email: user.email,
              role: user.role,
              isActive: user.isActive,
              managedBrandIds: user.managedBrandIds || [],
            }
          : {
              fullName: '',
              email: '',
              role: 'kandidat' as UserRole,
              isActive: true,
              password: '',
              managedBrandIds: [],
            }
      );
    }
  }, [user, open, form, mode]);

  async function onSubmit(values: FormValues) {
    setLoading(true);
    try {
      if (mode === 'edit' && user) {
        const userDocRef = doc(firestore, 'users', user.uid);
        const editValues = values as z.infer<typeof editSchema>;
        
        const updateData: any = {
          fullName: editValues.fullName,
          role: editValues.role,
          isActive: editValues.isActive,
        };
        
        if (editValues.role === 'hrd') {
          updateData.managedBrandIds = editValues.managedBrandIds || [];
        } else {
          updateData.managedBrandIds = [];
        }

        updateDocumentNonBlocking(userDocRef, updateData);

        toast({ title: 'User Updated', description: `${editValues.fullName}'s profile has been updated.` });
        onOpenChange(false);
      } else {
        const createValues = values as z.infer<typeof createSchema>;
        const response = await fetch('/api/users', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-seed-secret': seedSecret,
          },
          body: JSON.stringify(createValues),
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || 'Failed to create user.');
        }
        toast({ title: 'User Created', description: `An account for ${createValues.fullName} has been created.` });
        onOpenChange(false);
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: `Error ${mode === 'edit' ? 'updating' : 'creating'} user`,
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{mode === 'edit' ? 'Edit User' : 'Create New User'}</DialogTitle>
          <DialogDescription>
            {mode === 'edit' ? "Change the user's details below." : "Fill in the details for the new user."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <ScrollArea className="max-h-[60vh] w-full pr-6">
              <div className="space-y-4 py-4">
                <FormField
                  control={form.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input placeholder="John Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input placeholder="user@example.com" {...field} readOnly={mode === 'edit'} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {mode === 'create' && (
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="********" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {ROLES.map((r) => (
                            <SelectItem key={r} value={r}>
                              {r.replace(/[-_]/g, ' ')}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {selectedRole === 'hrd' && (
                  <FormField
                    control={form.control}
                    name="managedBrandIds"
                    render={() => (
                      <FormItem>
                        <div className="mb-4">
                          <FormLabel className="text-base">Managed Brands</FormLabel>
                          <FormDescription>
                            Select the brands this HRD user will manage.
                          </FormDescription>
                        </div>
                        {brandsLoading ? <p>Loading brands...</p> : brands?.map((brand) => (
                          <FormField
                            key={brand.id}
                            control={form.control}
                            name="managedBrandIds"
                            render={({ field }) => {
                              return (
                                <FormItem
                                  key={brand.id}
                                  className="flex flex-row items-start space-x-3 space-y-0"
                                >
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value?.includes(brand.id!)}
                                      onCheckedChange={(checked) => {
                                        return checked
                                          ? field.onChange([
                                              ...(field.value || []),
                                              brand.id!,
                                            ])
                                          : field.onChange(
                                              field.value?.filter(
                                                (value) => value !== brand.id
                                              )
                                            );
                                      }}
                                    />
                                  </FormControl>
                                  <FormLabel className="font-normal">
                                    {brand.name}
                                  </FormLabel>
                                </FormItem>
                              );
                            }}
                          />
                        ))}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                      <div className="space-y-0.5">
                        <FormLabel>Active Status</FormLabel>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </ScrollArea>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {mode === 'edit' ? 'Save Changes' : 'Create User'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
