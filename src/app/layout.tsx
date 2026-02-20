import { ReactNode } from "react";

// The real root layout is now in `app/[locale]/layout.tsx`.
// This file is required by Next.js and simply renders its children.
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
