'use client';
import React, { Fragment } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';
import type { MenuGroup } from '@/lib/menu-config';
import { cn } from '@/lib/utils';

interface SidebarNavProps {
  menuConfig: MenuGroup[];
}

export function SidebarNav({ menuConfig }: SidebarNavProps) {
    const pathname = usePathname();
    const { state } = useSidebar();
    const isCollapsed = state === 'collapsed';

    const rootDashboardHrefs = ['/admin', '/admin/hrd', '/admin/manager', '/admin/karyawan'];

    const isActive = (href: string) => {
        return rootDashboardHrefs.includes(href)
            ? pathname === href
            : pathname.startsWith(href);
    };

    return (
        <Sidebar collapsible="icon" className="border-r border-slate-200 dark:border-slate-800">
    <SidebarHeader className="border-none bg-transparent px-0 pt-4 pb-3 overflow-visible">
  <Link href="/admin" className="block w-full overflow-visible">
    {/* Expanded */}
    <div className={cn("overflow-visible", isCollapsed && "hidden")}>
      <div className="h-20 w-full flex items-center justify-center overflow-visible px-0">
        <img
          src="/images/hrp-logo.svg"
          alt="Environesia"
          className="w-[210px] max-w-none h-auto object-contain scale-[1.47]"
        />
      </div>

      <p className="mt-0 text-center text-xs text-slate-400 px-2">
        Human Capital Portal
      </p>
    </div>

    {/* Collapsed */}
    <div className={cn("hidden py-3", isCollapsed && "flex items-center justify-center")}>
      <img
        src="/images/logo.png"
        alt="Environesia"
        className="w-8 h-8 object-contain"
      />
    </div>
  </Link>
</SidebarHeader>
            <SidebarContent className="px-2 py-4">
                {menuConfig.map((group, groupIndex) => (
                    <Fragment key={group.title || groupIndex}>
                        {/* Group Label - Text only, no button */}
                        {group.title && (
                            <div className={cn(
                                "text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500 px-2 py-3 font-semibold",
                                isCollapsed && "hidden"
                            )}>
                                {group.title}
                            </div>
                        )}

                        {/* All items directly visible - no conditional */}
                        <SidebarMenu className={group.title ? "mb-2" : ""}>
                            {group.items.map(item => {
                                const itemIsActive = isActive(item.href);

                                return (
                                    <SidebarMenuItem key={item.key || item.label}>
                                        <SidebarMenuButton
                                            asChild
                                            tooltip={item.label}
                                            isActive={itemIsActive}
                                            className={cn(
                                                "justify-start ml-0",
                                                itemIsActive && "bg-teal-500 dark:bg-teal-600 text-white dark:text-white hover:bg-teal-600 dark:hover:bg-teal-700"
                                            )}
                                        >
                                            <Link href={item.href}>
                                                {item.icon}
                                                <span className="group-data-[state=collapsed]:hidden">{item.label}</span>
                                                {item.badge && <span className="ml-auto group-data-[state=collapsed]:hidden">{item.badge}</span>}
                                            </Link>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                );
                            })}
                        </SidebarMenu>
                    </Fragment>
                ))}
            </SidebarContent>
            <SidebarFooter className="border-t border-slate-200 dark:border-slate-800 py-3 px-2">
                <div className={cn(
                    "text-[10px] text-slate-500 dark:text-slate-500 text-center transition-all duration-200",
                    isCollapsed && "hidden"
                )}>
                    © Environesia<br />
                    <span className="text-slate-400 dark:text-slate-600">Human Capital Portal v1.0</span>
                </div>
                {isCollapsed && (
                    <div className="text-[10px] text-slate-500 dark:text-slate-500 text-center">
                        E
                    </div>
                )}
            </SidebarFooter>
        </Sidebar>
    );
}
