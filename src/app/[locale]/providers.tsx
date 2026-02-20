'use client';

import { AuthProvider } from '@/providers/auth-provider';
import { ThemeProvider } from '@/providers/theme-provider';
import { Toaster } from '@/components/ui/toaster';
import { RadixPointerLockGuard } from '@/components/RadixPointerLockGuard';
import type { ReactNode } from 'react';
import { FirebaseClientProvider } from '@/firebase';

export function LocaleProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <FirebaseClientProvider>
        <AuthProvider>
          {children}
          <Toaster />
          <RadixPointerLockGuard />
        </AuthProvider>
      </FirebaseClientProvider>
    </ThemeProvider>
  );
}
