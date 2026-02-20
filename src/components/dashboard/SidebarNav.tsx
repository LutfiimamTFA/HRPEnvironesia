'use client';
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Package2 } from 'lucide-react';
import type { MenuGroup } from '@/lib/menu-config';
import { Separator } from '@/components/ui/separator';

interface SidebarNavProps {
  menuConfig: MenuGroup[];
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
                    <React.Fragment key={group.title || groupIndex}>
                        <SidebarMenu>
                             {group.title && <h2 className="px-2 py-1 text-xs font-semibold text-muted-foreground tracking-wider group-data-[state=collapsed]:hidden">{group.title}</h2>}
                            {group.items.map(item => {
                                const isActive = pathname.startsWith(item.href);
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
                        {groupIndex < menuConfig.length - 1 && <Separator className="my-2 bg-sidebar-border group-data-[state=collapsed]:mx-auto group-data-[state=collapsed]:w-1/2" />}
                    </React.Fragment>
                ))}
            </SidebarContent>
        </Sidebar>
    );
}
