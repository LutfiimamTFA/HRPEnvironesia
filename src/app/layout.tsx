
import type { Metadata } from 'next';
import { ReactNode } from 'react';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from '@/providers/auth-provider';
import { RadixPointerLockGuard } from '@/components/RadixPointerLockGuard';
import { ThemeProvider } from '@/providers/theme-provider';

export const metadata: Metadata = {
  title: 'HRP Starter Kit',
  description: 'A starter kit for HRP applications.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased">
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
      </body>
    </html>
  );
}
