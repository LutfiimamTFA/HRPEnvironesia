'use client';

import { AuthProvider } from '@/providers/auth-provider';
import { ThemeProvider } from '@/providers/theme-provider';
import { PreviewRoleProvider } from '@/providers/preview-role-provider';
import { Toaster } from '@/components/ui/toaster';
import { RadixPointerLockGuard } from '@/components/RadixPointerLockGuard';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { FirebaseClientProvider } from '@/firebase';

export function RootProviders({ children }: { children: ReactNode }) {
  useEffect(() => {
    console.log('DISABLE_ANALYTICS', process.env.NEXT_PUBLIC_DISABLE_ANALYTICS);
    console.log('DISABLE_REALTIME_MONITORING', process.env.NEXT_PUBLIC_DISABLE_REALTIME_MONITORING);
  }, []);

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <FirebaseClientProvider>
        <AuthProvider>
          <PreviewRoleProvider>
            {children}
            <Toaster />
            <RadixPointerLockGuard />
          </PreviewRoleProvider>
        </AuthProvider>
      </FirebaseClientProvider>
    </ThemeProvider>
  );
}
