'use client';

import type { ReactNode } from 'react';
import React from 'react';
import type { MenuGroup } from '@/lib/menu-config';
import { SidebarNav } from './SidebarNav';
import { Topbar } from './Topbar';
import { SidebarProvider, SidebarInset } from '../ui/sidebar';

type DashboardLayoutProps = {
  children: React.ReactNode;
  pageTitle: string;
  menuConfig: MenuGroup[];
  hrdMode?: 'recruitment' | 'employees';
  onHrdModeChange?: (mode: 'recruitment' | 'employees') => void;
  actionArea?: ReactNode;
};

export function DashboardLayout({ 
  children, 
  pageTitle, 
  menuConfig, 
  hrdMode, 
  onHrdModeChange,
  actionArea
}: DashboardLayoutProps) {

  return (
    <SidebarProvider>
        <SidebarNav menuConfig={menuConfig} />
        <SidebarInset>
          <Topbar 
            pageTitle={pageTitle} 
            hrdMode={hrdMode} 
            onHrdModeChange={onHrdModeChange}
            actionArea={actionArea}
          />
          <main className="flex-1 items-start gap-4 p-4 sm:px-6 sm:py-6 md:gap-8">
            {children}
          </main>
        </SidebarInset>
    </SidebarProvider>
  );
}
