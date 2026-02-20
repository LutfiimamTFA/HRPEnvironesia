'use client';
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Sheet, SheetTrigger, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Home, Package2, PanelLeft } from 'lucide-react';
import { MenuGroup } from '@/lib/menu-config';
import { cn } from '@/lib/utils';
import { Separator } from '../ui/separator';

interface SidebarNavProps {
  menuConfig: MenuGroup[];
}

export function SidebarNav({ menuConfig }: SidebarNavProps) {
    const pathname = usePathname();

    const navContent = (
        <div className="flex flex-col gap-2">
        {menuConfig.map((group, groupIndex) => (
            <React.Fragment key={groupIndex}>
            {group.title && (
                 <div className="px-3 py-2">
                    <h2 className="mb-2 px-4 text-lg font-semibold tracking-tight">{group.title}</h2>
                 </div>
            )}
            <div className="space-y-1">
                {group.items.map(item => (
                <TooltipProvider key={item.label}>
                    <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                        asChild
                        variant={pathname === item.href ? 'secondary' : 'ghost'}
                        className="w-full justify-start"
                        >
                        <Link href={item.href}>
                            {item.icon}
                            <span className="ml-4">{item.label}</span>
                            {item.badge && <span className="ml-auto">{item.badge}</span>}
                        </Link>
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                    </Tooltip>
                </TooltipProvider>
                ))}
            </div>
            {groupIndex < menuConfig.length - 1 && <Separator className="my-4" />}
            </React.Fragment>
        ))}
        </div>
    );


  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-10 hidden w-64 flex-col border-r bg-background sm:flex">
        <nav className="flex flex-col items-center gap-4 px-2 sm:py-5">
           <Link href="/admin" className="group flex h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-full bg-primary text-lg font-semibold text-primary-foreground md:h-8 md:w-8 md:text-base">
            <Package2 className="h-4 w-4 transition-all group-hover:scale-110" />
            <span className="sr-only">HRP Starter</span>
          </Link>
        </nav>
        <div className="flex-1 overflow-auto py-2">{navContent}</div>
      </aside>

      {/* Mobile Sidebar (in Sheet) */}
      <div className="sm:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button size="icon" variant="outline" className="sm:hidden">
              <PanelLeft className="h-5 w-5" />
              <span className="sr-only">Toggle Menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="sm:max-w-xs">
            <nav className="grid gap-6 text-lg font-medium">
               <Link href="/admin" className="group flex h-10 w-10 shrink-0 items-center justify-center gap-2 rounded-full bg-primary text-lg font-semibold text-primary-foreground md:text-base">
                <Package2 className="h-5 w-5 transition-all group-hover:scale-110" />
                <span className="sr-only">HRP Starter</span>
              </Link>
              {menuConfig.flatMap(group => group.items).map(item => (
                 <Link key={item.label} href={item.href} className={cn("flex items-center gap-4 px-2.5", pathname === item.href ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
                    {item.icon}
                    {item.label}
                 </Link>
              ))}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
