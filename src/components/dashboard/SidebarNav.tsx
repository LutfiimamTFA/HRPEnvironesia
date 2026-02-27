'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { Package2, ChevronDown } from 'lucide-react';
import type { MenuGroup } from '@/lib/menu-config';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

interface SidebarNavProps {
  menuConfig: MenuGroup[];
}

const CollapsibleSidebarGroup = ({ group, pathname }: { group: MenuGroup, pathname: string }) => {
    const { state } = useSidebar();
    const isCollapsed = state === 'collapsed';

    const rootDashboardHrefs = ['/admin', '/admin/hrd', '/admin/manager', '/admin/karyawan'];

    // If a group has no title, render its items directly without a collapsible trigger.
    if (!group.title) {
        return (
            <SidebarMenu>
                {group.items.map(item => (
                    <SidebarMenuItem key={item.label}>
                        <SidebarMenuButton
                            asChild
                            tooltip={item.label}
                            isActive={rootDashboardHrefs.includes(item.href) ? pathname === item.href : pathname.startsWith(item.href)}
                            className="justify-start"
                        >
                            <Link href={item.href}>
                                {item.icon}
                                <span className="group-data-[state=collapsed]:hidden">{item.label}</span>
                                {item.badge && <span className="ml-auto group-data-[state=collapsed]:hidden">{item.badge}</span>}
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                ))}
            </SidebarMenu>
        )
    }

    return (
        <Collapsible defaultOpen className="group/collapsible">
            <CollapsibleTrigger asChild>
                <button
                    className={cn(
                        "flex w-full items-center justify-between h-9 px-2 text-xs font-semibold uppercase text-muted-foreground tracking-wider",
                        "hover:text-foreground disabled:cursor-not-allowed disabled:text-muted-foreground/50",
                        "group-data-[state=collapsed]:justify-center group-data-[state=collapsed]:px-0"
                    )}
                    disabled={isCollapsed}
                >
                    <span className="group-data-[state=collapsed]:hidden">{group.title}</span>
                    <div className="h-5 w-5 group-data-[state=collapsed]:hidden group-data-[state=open]/collapsible:rotate-180 transition-transform duration-200">
                      <ChevronDown className="h-4 w-4"/>
                    </div>
                    {/* Horizontal line for collapsed view */}
                    <div className="w-4 h-px bg-sidebar-border group-data-[state=expanded]:hidden" />
                </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
                <SidebarMenu className="mt-1">
                    {group.items.map(item => {
                        const isActive = rootDashboardHrefs.includes(item.href) 
                            ? pathname === item.href 
                            : pathname.startsWith(item.href);

                        return (
                            <SidebarMenuItem key={item.label}>
                                <SidebarMenuButton
                                    asChild
                                    tooltip={item.label}
                                    isActive={isActive}
                                    className="justify-start"
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
            </CollapsibleContent>
        </Collapsible>
    )
}

export function SidebarNav({ menuConfig }: SidebarNavProps) {
    const pathname = usePathname();

    return (
        <Sidebar collapsible="icon" className="bg-background sm:bg-sidebar border-r border-border sm:border-sidebar-border text-foreground sm:text-sidebar-foreground">
            <SidebarHeader>
                 <Link href="/admin" className="flex items-center gap-3.5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sidebar-accent">
                        <Package2 className="h-6 w-6 text-primary" />
                    </div>
                     <div className="leading-tight group-data-[state=collapsed]:hidden">
                        <div className="font-semibold text-foreground sm:text-sidebar-foreground text-base">HRP Starter</div>
                        <div className="text-xs text-muted-foreground sm:text-sidebar-foreground/70">Admin Portal</div>
                    </div>
                </Link>
            </SidebarHeader>
            <SidebarContent className="p-2">
                 {menuConfig.map((group, groupIndex) => (
                    <CollapsibleSidebarGroup key={group.title || groupIndex} group={group} pathname={pathname} />
                ))}
            </SidebarContent>
        </Sidebar>
    );
}
