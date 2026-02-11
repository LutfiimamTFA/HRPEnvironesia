'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { UserRole } from '@/lib/types';

export const useRoleGuard = (allowedRoles: UserRole | UserRole[]) => {
  const { userProfile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) {
      return; // Wait until loading is complete
    }

    if (!userProfile) {
      // This case should be handled by the protected layout, but as a safeguard
      router.replace('/login');
      return;
    }

    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

    if (!roles.includes(userProfile.role)) {
      // User does not have the required role, redirect them.
      router.replace('/dashboard');
    }
  }, [userProfile, loading, router, allowedRoles]);

  // Return a boolean indicating if the user has access.
  // The component can use this to avoid rendering content before redirect.
  return !loading && !!userProfile && (Array.isArray(allowedRoles) ? allowedRoles.includes(userProfile.role) : allowedRoles === userProfile.role);
};
