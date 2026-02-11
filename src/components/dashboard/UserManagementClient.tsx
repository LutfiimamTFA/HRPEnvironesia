'use client';

import { useMemo } from 'react';
import { collection } from 'firebase/firestore';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { UserProfile, ROLES, UserRole } from '@/lib/types';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';

function UserTableSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

const roleDisplayNames: Record<UserRole, string> = {
  'super-admin': 'Super Admins',
  'hrd': 'HRD',
  'manager': 'Managers',
  'kandidat': 'Kandidat',
  'karyawan': 'Karyawan',
};

export function UserManagementClient() {
  const firestore = useFirestore();

  const usersCollectionRef = useMemoFirebase(
    () => (firestore ? collection(firestore, 'users') : null),
    [firestore]
  );
  
  const { data: users, isLoading, error } = useCollection<UserProfile>(usersCollectionRef);

  const usersByRole = useMemo(() => {
    if (!users) return {};
    return users.reduce((acc, user) => {
      const role = user.role || 'kandidat';
      if (!acc[role]) {
        acc[role] = [];
      }
      acc[role].push(user);
      return acc;
    }, {} as Record<UserRole, UserProfile[]>);
  }, [users]);

  if (isLoading) {
    return <UserTableSkeleton />;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>
          Failed to load users: {error.message}
        </AlertDescription>
      </Alert>
    );
  }

  // Determine which roles to display based on available users, maintaining a consistent order.
  const displayRoles = ROLES.filter(role => usersByRole[role] && usersByRole[role].length > 0);

  return (
    <div className="w-full space-y-4">
       {displayRoles.length > 0 ? (
        <Accordion type="multiple" className="w-full space-y-4" defaultValue={displayRoles.map(role => `role-${role}`)}>
          {displayRoles.map((role) => (
            <AccordionItem value={`role-${role}`} key={role} className="border rounded-lg bg-card">
              <AccordionTrigger className="px-6 py-4 hover:no-underline">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold">{roleDisplayNames[role]}</h3>
                  <Badge variant="secondary">{usersByRole[role]?.length || 0}</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-1">
                <div className="border-t">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Full Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {usersByRole[role].map((user) => (
                        <TableRow key={user.uid}>
                          <TableCell className="font-medium">{user.fullName}</TableCell>
                          <TableCell>{user.email}</TableCell>
                          <TableCell>
                            <Badge variant={user.isActive ? 'default' : 'destructive'}>
                              {user.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem>
                                  <Pencil className="mr-2 h-4 w-4" />
                                  <span>Edit</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-destructive focus:text-destructive focus:bg-destructive/10">
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  <span>Delete</span>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      ) : (
        <div className="text-center text-muted-foreground py-10">No users found.</div>
      )}
    </div>
  );
}