import type { Metadata } from 'next';
import { RootProviders } from './providers';
import './globals.css';
import type { ReactNode } from 'react';
import 'leaflet/dist/leaflet.css';

export const metadata: Metadata = {
  title: 'HRP Environesia — Human Capital Portal',
  description: 'Human Capital Portal Environesia.',
  manifest: '/manifest.json',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning data-scroll-behavior="smooth" style={{ scrollBehavior: 'smooth' }}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
        <link rel="apple-touch-icon" href="/images/logo.png" />
        <meta name="theme-color" content="#0f766e" />
        {/* PWA install stays optional — this only lets the browser OFFER installation, it never prompts automatically. */}
      </head>
      <body style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }} className="antialiased">
        <RootProviders>{children}</RootProviders>
      </body>
    </html>
  );
}
