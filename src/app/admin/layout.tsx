'use client';

import { useAuth } from '@/providers/auth-provider';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { ROLES_INTERNAL } from '@/lib/types';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userProfile, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // If we are on the login page, we don't need to run any checks.
  // The login page has its own logic to redirect if the user is already logged in.
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  useEffect(() => {
    if (loading) {
      return; // Wait until loading is complete
    }

    if (!userProfile) {
      // Not logged in, redirect to the internal login page
      router.replace('/admin/login');
      return;
    }

    if (!ROLES_INTERNAL.includes(userProfile.role)) {
      // Logged in, but is a candidate. Redirect to candidate portal.
      router.replace('/careers/login');
    }
  }, [userProfile, loading, router, pathname]);

  // Render a loading state while checking for user and role
  // This check should not apply to the login page itself, which we already handled.
  if (loading || !userProfile || !ROLES_INTERNAL.includes(userProfile.role)) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // If checks pass, render the child components
  return <>{children}</>;
}
