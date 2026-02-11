import type {Metadata} from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster"
import { AuthProvider } from '@/providers/auth-provider';
import { FirebaseConfigWarning } from '@/components/auth/FirebaseConfigWarning';

export const metadata: Metadata = {
  title: 'HRP Starter Kit',
  description: 'A starter kit for HRP applications.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isFirebaseConfigured = !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased">
        {isFirebaseConfigured ? (
          <AuthProvider>
            {children}
            <Toaster />
          </AuthProvider>
        ) : (
          <FirebaseConfigWarning />
        )}
      </body>
    </html>
  );
}
