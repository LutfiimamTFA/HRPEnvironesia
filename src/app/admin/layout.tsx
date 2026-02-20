import type { ReactNode } from 'react';
import { AdminProviders } from './providers';
import { AdminGuard } from './AdminGuard';
import '../globals.css';

export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
       <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      </head>
      <body>
        <AdminProviders>
          <AdminGuard>{children}</AdminGuard>
        </AdminProviders>
      </body>
    </html>
  );
}
