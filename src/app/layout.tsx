import type { ReactNode } from 'react';
import './globals.css';

// This root layout is now a pass-through, as segment-level layouts ([locale] and admin)
// provide their own complete <html> and <body> structures.
export default function RootLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
