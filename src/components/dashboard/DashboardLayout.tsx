'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useAuth } from '@/providers/auth-provider';
import { useAuth as useFirebaseAuth } from '@/firebase';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { LogOut } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

type DashboardLayoutProps = {
  children: ReactNode;
  pageTitle: string;
  menuItems: { href: string; label: string; icon: ReactNode }[];
};

function UserNav() {
  const { userProfile } = useAuth();
  const auth = useFirebaseAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await auth.signOut();
    router.push('/login');
  };
  
  const getInitials = (name: string = '') => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  }

  if (!userProfile) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-8 w-8 rounded-full">
          <Avatar className="h-9 w-9">
            <AvatarImage src={`https://picsum.photos/seed/${userProfile.uid}/40/40`} alt={userProfile.fullName} data-ai-hint="profile avatar" />
            <AvatarFallback>{getInitials(userProfile.fullName)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{userProfile.fullName}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {userProfile.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


export function DashboardLayout({ children, pageTitle, menuItems }: DashboardLayoutProps) {
  const { userProfile } = useAuth();
  
  if (!userProfile) {
    return null; // or a loading skeleton
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-muted/40">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6">
         <h1 className="flex-1 text-xl font-semibold tracking-tight text-primary">HRP Starter Kit</h1>
         <UserNav />
      </header>
      <main className="flex flex-1 flex-col gap-4 p-4 sm:px-6 sm:py-0 md:gap-8 lg:flex-row">
        <nav className="grid gap-4 text-sm text-muted-foreground lg:w-1/4 xl:w-1/5">
            <Card>
                <CardHeader>
                    <CardTitle>Menu</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-1">
                    {menuItems.map((item) => (
                        <Link
                            key={item.label}
                            href={item.href}
                            className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary"
                        >
                            {item.icon}
                            {item.label}
                        </Link>
                    ))}
                </CardContent>
            </Card>
        </nav>
        <div className="grid flex-1 items-start gap-4 md:gap-8">
            <Card>
                <CardHeader>
                    <CardTitle>{pageTitle}</CardTitle>
                    <CardDescription>
                        Halo, {userProfile.fullName} — Role: {userProfile.role.replace(/_/g, ' ')}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {children}
                </CardContent>
            </Card>
        </div>
      </main>
    </div>
  );
}
