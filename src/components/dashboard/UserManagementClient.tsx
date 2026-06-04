'use client';

import { useMemo, useState } from 'react';
import { collection } from 'firebase/firestore';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { UserProfile, Brand, EmployeeProfile } from '@/lib/types';
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  PlusCircle,
  Eye,
  Lock,
  Power,
  Copy,
  CheckCircle2,
  Search,
  Users,
  UserCheck,
  AlertCircle,
} from 'lucide-react';
import { UserFormDialog } from './UserFormDialog';
import { DeleteConfirmationDialog } from './DeleteConfirmationDialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/providers/auth-provider';
import { useRouter } from 'next/navigation';
import { resetUserPassword, toggleUserStatus, copyToClipboard } from '@/lib/user-management-utils';

const groupConfig = {
  'super-admin': {
    label: 'Super Admin',
    icon: '👑',
    color: 'destructive',
    description: 'Akses penuh sistem dan manajemen user',
  },
  'hrd': {
    label: 'HRD',
    icon: '👨‍💼',
    color: 'default',
    description: 'Pengelola data karyawan dan approval cuti/izin',
  },
  'manager': {
    label: 'Manager',
    icon: '🏢',
    color: 'secondary',
    description: 'Atasan/pemberi approval tim mereka',
  },
  'karyawan_aktif': {
    label: 'Karyawan Aktif',
    icon: '👤',
    color: 'outline',
    description: 'User karyawan aktif dengan kontrak tetap',
  },
  'probation': {
    label: 'Probation',
    icon: '⏳',
    color: 'outline',
    description: 'Karyawan dalam masa percobaan',
  },
  'magang': {
    label: 'Magang',
    icon: '🎓',
    color: 'outline',
    description: 'Peserta magang dan program bimbingan',
  },
  'kandidat': {
    label: 'Kandidat',
    icon: '✋',
    color: 'outline',
    description: 'Pelamar atau kandidat rekrutmen',
  },
};

const displayOrder = ['super-admin', 'hrd', 'manager', 'karyawan_aktif', 'probation', 'magang', 'kandidat'];

function UserTableSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

interface UserStats {
  total: number;
  active: number;
  disabled: number;
  mustChangePassword: number;
  byRole: Record<string, number>;
}

export function UserManagementClient() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const { firebaseUser, auth } = useAuth();
  const router = useRouter();

  // State
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [userToDelete, setUserToDelete] = useState<UserProfile | null>(null);
  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isResetPasswordDialogOpen, setIsResetPasswordDialogOpen] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('super-admin');
  const [searchQuery, setSearchQuery] = useState('');
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);

  // Data fetching
  const usersRef = useMemoFirebase(() => collection(firestore, 'users'), [firestore]);
  const { data: users, isLoading: isLoadingUsers, error } = useCollection<UserProfile>(usersRef);

  const brandsRef = useMemoFirebase(() => collection(firestore, 'brands'), [firestore]);
  const { data: brands } = useCollection<Brand>(brandsRef);

  const employeeProfilesRef = useMemoFirebase(() => collection(firestore, 'employee_profiles'), [firestore]);
  const { data: employeeProfiles } = useCollection<EmployeeProfile>(employeeProfilesRef);

  // Derived data
  const brandMap = useMemo(() => {
    if (!brands) return {};
    return brands.reduce((acc, brand) => {
      if (brand.id) acc[brand.id] = brand.name;
      return acc;
    }, {} as Record<string, string>);
  }, [brands]);

  const employeeProfileMap = useMemo(() => {
    if (!employeeProfiles) return new Map<string, EmployeeProfile>();
    return new Map(employeeProfiles.map(p => [p.uid, p]));
  }, [employeeProfiles]);

  const usersByGroup = useMemo(() => {
    if (!users) return {};
    const groups: { [key: string]: UserProfile[] } = {};

    users.forEach((user) => {
      let groupKey = user.role;
      if (user.role === 'karyawan') {
        if (user.employmentType === 'magang') {
          groupKey = 'magang';
        } else if (user.employmentType === 'training' || user.employmentStage === 'probation') {
          groupKey = 'probation';
        } else {
          groupKey = 'karyawan_aktif';
        }
      }

      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(user);
    });

    // Sort each group
    Object.keys(groups).forEach(key => {
      groups[key].sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));
    });

    return groups;
  }, [users]);

  const stats = useMemo((): UserStats => {
    if (!users) return { total: 0, active: 0, disabled: 0, mustChangePassword: 0, byRole: {} };

    const byRole: Record<string, number> = {};
    let active = 0, disabled = 0, mustChangePassword = 0;

    users.forEach(user => {
      byRole[user.role] = (byRole[user.role] || 0) + 1;
      if (user.isActive) active++;
      else disabled++;
      if ((user as any).mustChangePassword) mustChangePassword++;
    });

    return {
      total: users.length,
      active,
      disabled,
      mustChangePassword,
      byRole,
    };
  }, [users]);

  const filteredGroupUsers = useMemo(() => {
    const groupUsers = usersByGroup[activeTab] || [];
    if (!searchQuery) return groupUsers;

    const query = searchQuery.toLowerCase();
    return groupUsers.filter(user =>
      user.fullName?.toLowerCase().includes(query) ||
      user.email?.toLowerCase().includes(query)
    );
  }, [usersByGroup, activeTab, searchQuery]);

  // Handlers
  const handleCreateUser = () => {
    setSelectedUser(null);
    setIsFormDialogOpen(true);
  };

  const handleEditUser = (user: UserProfile) => {
    setSelectedUser(user);
    setIsFormDialogOpen(true);
  };

  const handleViewDetail = (user: UserProfile) => {
    setSelectedUser(user);
    setIsDetailDialogOpen(true);
  };

  const handleDeleteUser = (user: UserProfile) => {
    setUserToDelete(user);
    setIsDeleteDialogOpen(true);
  };

  const handleResetPassword = async (user: UserProfile) => {
    if (!firebaseUser) return;
    setSelectedUser(user);
    setIsResettingPassword(true);

    try {
      const idToken = await firebaseUser.getIdToken();
      const result = await resetUserPassword(user.uid, idToken);

      if (result.success && result.tempPassword) {
        setTempPassword(result.tempPassword);
        setIsResetPasswordDialogOpen(true);
        toast({ title: 'Password Direset', description: result.message });
      } else {
        toast({ variant: 'destructive', title: 'Gagal', description: result.message });
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleToggleStatus = async (user: UserProfile) => {
    if (!firebaseUser) return;
    setSelectedUser(user);
    setIsTogglingStatus(true);

    try {
      const idToken = await firebaseUser.getIdToken();
      const newStatus = !user.isActive;
      const result = await toggleUserStatus(user.uid, newStatus, idToken);

      if (result.success) {
        setSelectedUser({ ...user, isActive: newStatus });
        toast({ title: 'Status Diubah', description: result.message });
      } else {
        toast({ variant: 'destructive', title: 'Gagal', description: result.message });
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setIsTogglingStatus(false);
    }
  };

  const confirmDelete = async () => {
    if (!userToDelete || !firebaseUser) return;
    try {
      const idToken = await firebaseUser.getIdToken();
      const res = await fetch(`/api/users/${userToDelete.uid}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${idToken}` },
      });

      if (res.status === 401) {
        toast({ variant: 'destructive', title: 'Sesi Habis', description: 'Silakan login kembali.' });
        if (auth) await auth.signOut();
        router.push('/admin/login');
        return;
      }

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Gagal menghapus user');
      }

      toast({ title: 'User Dihapus', description: `${userToDelete.fullName} telah dihapus.` });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setIsDeleteDialogOpen(false);
      setUserToDelete(null);
    }
  };

  if (isLoadingUsers) return <UserTableSkeleton />;

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>Gagal memuat users: {error.message}</AlertDescription>
      </Alert>
    );
  }

  const displayGroups = displayOrder.filter(g => usersByGroup[g]?.length > 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
          <p className="text-muted-foreground">Kelola akun pengguna dan akses sistem</p>
        </div>
        <Button onClick={handleCreateUser} className="gap-2">
          <PlusCircle className="h-4 w-4" />
          Tambah User
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="bg-card/50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total User</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <Users className="h-8 w-8 text-muted-foreground opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-green-50/50 dark:bg-green-950/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Aktif</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.active}</p>
              </div>
              <UserCheck className="h-8 w-8 text-green-600/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-red-50/50 dark:bg-red-950/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Nonaktif</p>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.disabled}</p>
              </div>
              <Power className="h-8 w-8 text-red-600/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-yellow-50/50 dark:bg-yellow-950/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Harus Ganti Pwd</p>
                <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{stats.mustChangePassword}</p>
              </div>
              <AlertCircle className="h-8 w-8 text-yellow-600/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-blue-50/50 dark:bg-blue-950/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Magang</p>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.byRole.karyawan || 0}</p>
              </div>
              <Users className="h-8 w-8 text-blue-600/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filter */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-background">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cari nama atau email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
        </CardContent>
      </Card>

      {/* User Groups as Tabs */}
      {displayGroups.length > 0 ? (
        <div className="space-y-4">
          <Card>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full rounded-none border-b bg-muted/30 p-0 h-auto gap-0" style={{ gridTemplateColumns: `repeat(${Math.min(displayGroups.length, 7)}, minmax(0, 1fr))` }}>
                {displayGroups.map((groupKey) => {
                  const config = (groupConfig as any)[groupKey];
                  const count = usersByGroup[groupKey]?.length || 0;
                  const isActive = activeTab === groupKey;

                  return (
                    <TabsTrigger
                      key={groupKey}
                      value={groupKey}
                      className={`rounded-none border-b-2 px-4 py-4 flex-col gap-1 data-[state=active]:bg-background/80 data-[state=active]:border-primary transition-all ${
                        isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                      }`}
                      title={config?.label}
                    >
                      <span className="text-lg">{config?.icon}</span>
                      <span className="text-xs font-semibold leading-tight hidden xs:inline">{config?.label}</span>
                      <span className="text-xs font-bold text-primary">{count}</span>
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              {/* Group Title Section */}
              <div className="px-6 py-4 border-b bg-muted/20">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{(groupConfig as any)[activeTab]?.icon}</span>
                  <div>
                    <h2 className="text-xl font-bold">{(groupConfig as any)[activeTab]?.label}</h2>
                    <p className="text-sm text-muted-foreground">{filteredGroupUsers.length} user{filteredGroupUsers.length !== 1 ? 's' : ''} • {(groupConfig as any)[activeTab]?.description}</p>
                  </div>
                </div>
              </div>

              {displayGroups.map((groupKey) => (
                <TabsContent key={groupKey} value={groupKey} className="mt-0">
                  {filteredGroupUsers.length > 0 ? (
                    <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-0 bg-muted/50">
                          <TableHead className="py-3">User</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Brand / Divisi</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Security</TableHead>
                          <TableHead className="text-right">Aksi</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredGroupUsers.map((user) => {
                          const employeeProfile = employeeProfileMap.get(user.uid);
                          const brandDisplay = user.brandId
                            ? (Array.isArray(user.brandId)
                              ? user.brandId.map(id => brandMap[id] || id).join(', ')
                              : brandMap[user.brandId as string] || '-')
                            : '-';

                          const userInitial = user.fullName?.charAt(0).toUpperCase() || '?';
                          const employmentType = user.employmentType || 'karyawan';
                          const isSecurityIssue = (user as any).mustChangePassword;

                          return (
                            <TableRow key={user.uid} className="border-b hover:bg-muted/50">
                              <TableCell>
                                <div className="flex items-center gap-3">
                                  <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-semibold">
                                    {userInitial}
                                  </div>
                                  <div>
                                    <p className="font-medium">{user.fullName}</p>
                                    <p className="text-xs text-muted-foreground font-mono">{user.uid.slice(0, 8)}</p>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-sm">{user.email}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="capitalize">
                                  {employmentType.replace('_', ' ')}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {employeeProfile?.division || brandDisplay}
                              </TableCell>
                              <TableCell>
                                <Badge variant={user.isActive ? 'default' : 'destructive'}>
                                  {user.isActive ? 'Aktif' : 'Nonaktif'}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {isSecurityIssue ? (
                                  <Badge variant="destructive" className="gap-1">
                                    <AlertCircle className="h-3 w-3" />
                                    Harus Ganti
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-xs">Normal</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-56">
                                    <DropdownMenuLabel>Akun</DropdownMenuLabel>
                                    <DropdownMenuItem onClick={() => handleViewDetail(user)}>
                                      <Eye className="mr-2 h-4 w-4" />
                                      <span>Lihat Detail</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleEditUser(user)}>
                                      <Pencil className="mr-2 h-4 w-4" />
                                      <span>Edit Role & Akses</span>
                                    </DropdownMenuItem>

                                    <DropdownMenuSeparator />
                                    <DropdownMenuLabel>Keamanan</DropdownMenuLabel>
                                    <DropdownMenuItem onClick={() => handleResetPassword(user)} disabled={isResettingPassword}>
                                      <Lock className="mr-2 h-4 w-4" />
                                      <span>Reset Password</span>
                                    </DropdownMenuItem>

                                    <DropdownMenuSeparator />
                                    <DropdownMenuLabel>Status</DropdownMenuLabel>
                                    <DropdownMenuItem onClick={() => handleToggleStatus(user)} disabled={isTogglingStatus}>
                                      <Power className="mr-2 h-4 w-4" />
                                      <span>{user.isActive ? 'Nonaktifkan' : 'Aktifkan'}</span>
                                    </DropdownMenuItem>

                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => handleDeleteUser(user)}
                                      className="text-destructive focus:text-destructive"
                                      disabled={user.role === 'super-admin'}
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      <span>Hapus</span>
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-10 text-muted-foreground">
                    {searchQuery ? 'Tidak ada user yang cocok' : 'Tidak ada user di grup ini'}
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="pt-10 text-center text-muted-foreground">
            Tidak ada user ditemukan
          </CardContent>
        </Card>
      )}

      {/* Detail User Dialog */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detail User</DialogTitle>
            <DialogDescription>Informasi lengkap akun user</DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Nama</Label>
                  <p className="font-medium">{selectedUser.fullName}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Email</Label>
                  <p className="font-medium">{selectedUser.email}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">UID</Label>
                  <p className="font-mono text-sm">{selectedUser.uid}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Role</Label>
                  <Badge>{selectedUser.role}</Badge>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Status Akun</Label>
                  <Badge variant={selectedUser.isActive ? 'default' : 'destructive'}>
                    {selectedUser.isActive ? 'Aktif' : 'Nonaktif'}
                  </Badge>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Harus Ganti Password</Label>
                  <Badge variant={(selectedUser as any).mustChangePassword ? 'destructive' : 'secondary'}>
                    {(selectedUser as any).mustChangePassword ? 'Ya' : 'Tidak'}
                  </Badge>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsDetailDialogOpen(false)}>
              Tutup
            </Button>
            {selectedUser && (
              <>
                <Button variant="outline" onClick={() => { handleResetPassword(selectedUser); setIsDetailDialogOpen(false); }}>
                  Reset Password
                </Button>
                <Button onClick={() => { handleEditUser(selectedUser); setIsDetailDialogOpen(false); }}>
                  Edit
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={isResetPasswordDialogOpen} onOpenChange={setIsResetPasswordDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Password Sementara Dibuat</DialogTitle>
            <DialogDescription>Salin password sementara dan beri ke user</DialogDescription>
          </DialogHeader>
          {tempPassword && (
            <div className="space-y-4 py-4">
              <div className="p-4 bg-muted rounded-lg border font-mono font-bold text-lg tracking-wider break-all">
                {tempPassword}
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  copyToClipboard(tempPassword);
                  toast({ title: 'Disalin', description: 'Password sudah disalin ke clipboard' });
                }}
              >
                <Copy className="mr-2 h-4 w-4" />
                Salin Password
              </Button>
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Penting</AlertTitle>
                <AlertDescription>
                  Password ini hanya ditampilkan sekali. User wajib mengganti password setelah login.
                </AlertDescription>
              </Alert>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setIsResetPasswordDialogOpen(false)}>Selesai</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialogs */}
      <UserFormDialog
        user={selectedUser}
        open={isFormDialogOpen}
        onOpenChange={setIsFormDialogOpen}
      />
      <DeleteConfirmationDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        onConfirm={confirmDelete}
        itemName={userToDelete?.fullName}
        itemType="user"
      />
    </div>
  );
}
