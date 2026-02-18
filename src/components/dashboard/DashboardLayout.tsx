'use client';

import type { ReactNode } from 'react';
import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/providers/auth-provider';
import { useAuth as useFirebaseAuth } from '@/firebase';
import { useRouter, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { LogOut, Package2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarProvider,
  SidebarInset,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
} from '@/components/ui/sidebar';

type DashboardLayoutProps = {
  children: ReactNode;
  pageTitle: string;
  menuItems: { href: string; label: string; icon: ReactNode }[];
};

function UserNav() {
  const { userProfile } = useAuth();
  const auth = useFirebaseAuth();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  const handleLogout = async () => {
    await auth.signOut();
    router.push('/admin/login');
  };
  
  const getInitials = (name: string = '') => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  }

  if (!userProfile) return null;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
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
        <DropdownMenuItem onSelect={(e) => {
          e.preventDefault();
          setOpen(false);
          queueMicrotask(handleLogout);
        }}>
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


export function DashboardLayout({ children, pageTitle, menuItems }: DashboardLayoutProps) {
  const { userProfile } = useAuth();
  const pathname = usePathname();

  if (!userProfile) {
    return null; // or a loading skeleton
  }

  return (
    <SidebarProvider defaultOpen>
      <Sidebar collapsible="icon" className="border-r-0 bg-slate-900 text-slate-50">
        <SidebarHeader className="border-b border-slate-700">
          <div className="flex h-16 items-center justify-center">
            <Link href="/admin" className="flex items-center gap-2 font-semibold">
              <Package2 className="h-6 w-6 text-primary" />
              <span className="text-xl tracking-tight group-data-[state=collapsed]:hidden">HRP Starter</span>
            </Link>
          </div>
        </SidebarHeader>
        <SidebarContent className="p-2">
          <SidebarMenu>
            {menuItems.map((item) => {
              const isActive = pathname === item.href;
              return (
              <SidebarMenuItem key={item.label}>
                <SidebarMenuButton 
                  asChild 
                  tooltip={item.label}
                  isActive={isActive}
                  className="text-slate-300 hover:bg-slate-700 hover:text-white data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
                >
                  <Link href={item.href}>
                    {item.icon}
                    <span className="group-data-[state=collapsed]:hidden">{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )})}
          </SidebarMenu>
        </SidebarContent>
      </Sidebar>

      <SidebarInset className="bg-muted/30">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-4 sm:px-6">
          <SidebarTrigger />
          <div className="flex-1">
             <h1 className="text-xl font-semibold tracking-tight">{pageTitle}</h1>
          </div>
          <UserNav />
        </header>

        <main className="flex-1 p-4 sm:px-6 sm:py-6 md:gap-8">
          <Card>
            <CardContent className="pt-6">
              {children}
            </CardContent>
          </Card>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
