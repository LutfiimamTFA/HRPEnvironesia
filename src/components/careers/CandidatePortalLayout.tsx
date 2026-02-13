'use client';

import type { ReactNode } from 'react';
import React, { useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/providers/auth-provider';
import { useAuth as useFirebaseAuth, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { useRouter, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { LogOut, Briefcase, Leaf, ArrowLeft } from 'lucide-react';
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
  SidebarFooter,
} from '@/components/ui/sidebar';
import { Separator } from '../ui/separator';
import { ALL_MENU_ITEMS, ALL_UNIQUE_MENU_ITEMS } from '@/lib/menu-config';
import type { NavigationSetting } from '@/lib/types';

function UserNav() {
  const { userProfile } = useAuth();
  const auth = useFirebaseAuth();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  const handleLogout = async () => {
    await auth.signOut();
    router.push('/careers');
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
          <span>Logout</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


export function CandidatePortalLayout({ children }: { children: ReactNode }) {
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const pathname = usePathname();

  const settingsDocRef = useMemoFirebase(
    () => (userProfile ? doc(firestore, 'navigation_settings', userProfile.role) : null),
    [userProfile, firestore]
  );

  const { data: navSettings, isLoading: isLoadingSettings } = useDoc<NavigationSetting>(settingsDocRef);

  const menuItems = useMemo(() => {
    const defaultItems = ALL_MENU_ITEMS.kandidat || [];

    if (isLoadingSettings) {
      return defaultItems;
    }
    
    if (navSettings) {
      return ALL_UNIQUE_MENU_ITEMS.filter(item => 
        ALL_MENU_ITEMS.kandidat.some(k => k.label === item.label) && navSettings.visibleMenuItems.includes(item.label)
      );
    }
    
    return defaultItems;
  }, [navSettings, isLoadingSettings]);
  
  if (!userProfile) {
    return null; // Should be handled by the parent layout's guard
  }

  return (
    <SidebarProvider defaultOpen>
      <Sidebar collapsible="icon" className="border-r-0 bg-gradient-to-b from-emerald-600 to-emerald-700 text-white">
        <SidebarHeader className="border-b border-white/20 p-0">
          <div className="p-4">
             <Link href="/careers/portal" className="flex items-center gap-3">
               <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">
                <Leaf className="h-5 w-5 text-white" />
               </div>
               <div className="leading-tight group-data-[state=collapsed]:hidden">
                 <div className="font-semibold text-white text-base">Environesia Karir</div>
                 <div className="text-xs text-white/70">Portal Kandidat</div>
               </div>
             </Link>
           </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {menuItems.map((item) => {
              const isActive = pathname === item.href;
              return (
              <SidebarMenuItem key={item.label}>
                <SidebarMenuButton 
                  asChild 
                  tooltip={item.label}
                  isActive={isActive}
                  className="text-emerald-100 hover:bg-white/10 hover:text-white data-[active=true]:bg-white/15 data-[active=true]:text-white"
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
        <SidebarFooter className="mt-auto">
            <Separator className="my-2 bg-white/20" />
            <SidebarMenu>
                 <SidebarMenuItem>
                    <SidebarMenuButton 
                      asChild 
                      tooltip="Kembali ke Halaman Karir"
                      className="text-emerald-100 hover:bg-white/10 hover:text-white"
                    >
                        <Link href="/careers">
                            <ArrowLeft />
                            <span className="group-data-[state=collapsed]:hidden">Kembali ke Karir</span>
                        </Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
            </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="bg-muted/30">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-4 sm:px-6">
          <SidebarTrigger />
          <div className="flex-1" />
          <UserNav />
        </header>

        <main className="flex-1 p-4 sm:px-6 sm:py-6 md:gap-8">
            {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
