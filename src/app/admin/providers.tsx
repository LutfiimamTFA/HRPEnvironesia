'use client';

import { AuthProvider } from '@/providers/auth-provider';
import { ThemeProvider } from '@/providers/theme-provider';
import { Toaster } from '@/components/ui/toaster';
import { RadixPointerLockGuard } from '@/components/RadixPointerLockGuard';
import type { ReactNode } from 'react';

export function AdminProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <AuthProvider>
        {children}
        <Toaster />
        <RadixPointerLockGuard />
      </AuthProvider>
    </ThemeProvider>
  );
}
