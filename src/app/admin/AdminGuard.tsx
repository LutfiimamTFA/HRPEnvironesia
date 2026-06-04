'use client';

import { useAuth } from '@/providers/auth-provider';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { ROLES_INTERNAL } from '@/lib/types';

export function AdminGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userProfile, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // List of paths that don't require role verification or password change
    const allowedPaths = ['/admin/login', '/admin/change-password'];
    const isAllowedPath = allowedPaths.includes(pathname);

    if (isAllowedPath) {
      return;
    }

    if (loading) {
      return; // Wait until loading is complete
    }

    if (!userProfile) {
      // Not logged in, redirect to the internal login page
      router.replace('/admin/login');
      return;
    }

    if (!ROLES_INTERNAL.includes(userProfile.role as any)) {
      // Logged in, but is a candidate. Redirect to candidate portal.
      router.replace('/careers/login');
      return;
    }

    // Check if user must change password
    const mustChangePassword = (userProfile as any).mustChangePassword === true;
    if (mustChangePassword) {
      router.replace('/admin/change-password');
      return;
    }
  }, [userProfile, loading, router, pathname]);

  // If we are on the login or change-password page, render it directly.
  if (pathname === '/admin/login' || pathname === '/admin/change-password') {
    return <>{children}</>;
  }

  // For all other /admin/* routes, show a loader while we verify the user's role and password change status.
  if (
    loading ||
    !userProfile ||
    !ROLES_INTERNAL.includes(userProfile.role as any) ||
    (userProfile as any).mustChangePassword === true
  ) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // If all checks pass, render the protected page.
  return <>{children}</>;
}
