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
    <Sidebar
      collapsible="icon"
      className="border-r border-slate-200 dark:border-slate-800"
    >
      {/* ── Logo / Header ─────────────────────────────── */}
      <SidebarHeader className="border-none bg-transparent px-0 pt-4 pb-2 overflow-visible">
        <Link href="/admin" className="block w-full overflow-visible">
          {/* Expanded */}
          <div className={cn('overflow-visible', isCollapsed && 'hidden')}>
            <div className="h-20 w-full flex items-center justify-center overflow-visible">
              <img
                src="/images/hrp-logo.svg"
                alt="Environesia"
                className="w-[210px] max-w-none h-auto object-contain scale-[1.47]"
              />
            </div>
            <p className="mt-0.5 text-center text-[10.5px] text-slate-400 dark:text-slate-500 tracking-wide px-2">
              Human Capital Portal
            </p>
          </div>

          {/* Collapsed */}
          <div className={cn('hidden py-3', isCollapsed && 'flex items-center justify-center')}>
            <img
              src="/images/logo.png"
              alt="Environesia"
              className="w-8 h-8 object-contain"
            />
          </div>
        </Link>
      </SidebarHeader>

      {/* ── Navigation ────────────────────────────────── */}
      <SidebarContent
        className={cn(
          'px-2.5 pb-6 pt-1',
          // Thin, subtle scrollbar
          '[&::-webkit-scrollbar]:w-[3px]',
          '[&::-webkit-scrollbar-track]:bg-transparent',
          '[&::-webkit-scrollbar-thumb]:rounded-full',
          '[&::-webkit-scrollbar-thumb]:bg-slate-200',
          'dark:[&::-webkit-scrollbar-thumb]:bg-slate-700',
        )}
      >
        {menuConfig.map((group, groupIndex) => {
          const hasPrevGroup = groupIndex > 0;
          const prevGroupHasTitle = groupIndex > 0 && !!menuConfig[groupIndex - 1]?.title;

          return (
            <Fragment key={group.title || groupIndex}>
              {/* ── Group title ──────────────────────── */}
              {group.title ? (
                <div
                  className={cn(
                    'select-none',
                    isCollapsed && 'hidden',
                  )}
                >
                  {/* Top divider + spacing for groups after the first */}
                  {hasPrevGroup && (
                    <div className="mx-2 mt-4 mb-0 h-px bg-slate-100 dark:bg-slate-800" />
                  )}
                  <p
                    className={cn(
                      'px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em]',
                      'text-slate-400 dark:text-slate-500',
                      hasPrevGroup ? 'pt-3' : 'pt-2',
                    )}
                  >
                    {group.title}
                  </p>
                </div>
              ) : (
                /* No-title group: just a little top padding on first */
                hasPrevGroup && !isCollapsed && (
                  <div className="mx-2 mt-3 mb-1 h-px bg-slate-100 dark:bg-slate-800" />
                )
              )}

              {/* ── Menu items ─────────────────────── */}
              <SidebarMenu className="gap-[2px]">
                {group.items.map(item => {
                  const active = !item.external && isActive(item.href);

                  return (
                    <SidebarMenuItem key={item.key || item.label}>
                      <SidebarMenuButton
                        asChild={!item.external}
                        onClick={
                          item.external
                            ? () => window.open(item.href, '_blank', 'noopener,noreferrer')
                            : undefined
                        }
                        tooltip={item.label}
                        isActive={active}
                        className={cn(
                          // ── Base layout
                          'h-[34px] w-full justify-start gap-[10px] rounded-lg px-2.5',
                          'text-[13px] leading-none font-medium',
                          'transition-colors duration-100',
                          // ── Icon sizing (override shadcn default)
                          '[&>svg]:size-[15px] [&>svg]:shrink-0',
                          // ── Collapsed: center icon, square
                          'group-data-[collapsible=icon]:!h-[34px]',
                          'group-data-[collapsible=icon]:!w-[34px]',
                          'group-data-[collapsible=icon]:!p-0',
                          'group-data-[collapsible=icon]:justify-center',
                          'group-data-[collapsible=icon]:rounded-lg',

                          // ── Idle state
                          !active && [
                            'text-slate-600 dark:text-slate-400',
                            'hover:bg-slate-100 dark:hover:bg-slate-800/70',
                            'hover:text-slate-900 dark:hover:text-slate-100',
                          ],

                          // ── Active state: soft teal card + left accent bar
                          active && [
                            // Left accent via box-shadow (no layout shift)
                            'shadow-[inset_3px_0_0_theme(colors.teal.500)]',
                            'rounded-l-none',
                            // Background & text
                            'bg-teal-50 dark:bg-teal-900/25',
                            'text-teal-700 dark:text-teal-300',
                            'font-semibold',
                            // Hover on active
                            'hover:bg-teal-100/80 dark:hover:bg-teal-900/40',
                          ],
                        )}
                      >
                        {item.external ? (
                          <>
                            {item.icon}
                            <span className="group-data-[state=collapsed]:hidden truncate">
                              {item.label}
                            </span>
                            {item.badge && (
                              <span className="ml-auto shrink-0 group-data-[state=collapsed]:hidden">
                                {item.badge}
                              </span>
                            )}
                          </>
                        ) : (
                          <Link href={item.href}>
                            {item.icon}
                            <span className="group-data-[state=collapsed]:hidden truncate">
                              {item.label}
                            </span>
                            {item.badge && (
                              <span className="ml-auto shrink-0 group-data-[state=collapsed]:hidden">
                                {item.badge}
                              </span>
                            )}
                          </Link>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </Fragment>
          );
        })}
      </SidebarContent>

      {/* ── Footer ────────────────────────────────────── */}
      <SidebarFooter className="border-t border-slate-200 dark:border-slate-800 py-3 px-3">
        <div className={cn('transition-all duration-200', isCollapsed && 'hidden')}>
          <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 text-center tracking-wide leading-4">
            © Environesia
          </p>
          <p className="text-[9.5px] text-slate-300 dark:text-slate-600 text-center tracking-wide">
            Human Capital Portal v1.0
          </p>
        </div>
        {isCollapsed && (
          <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 text-center">
            E
          </p>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
