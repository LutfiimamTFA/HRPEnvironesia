'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { UserRole, ROLES_INTERNAL } from '@/lib/types';

export const useRoleGuard = (allowedRoles: UserRole | UserRole[]) => {
  const { userProfile, loading } = useAuth();
  const router = useRouter();
  
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  useEffect(() => {
    if (loading) {
      return; // Wait until loading is complete
    }

    if (!userProfile) {
      // This case should be handled by the protected layout, but as a safeguard
      const targetLogin = roles.some(r => ROLES_INTERNAL.includes(r)) ? '/admin/login' : '/careers/login';
      router.replace(targetLogin);
      return;
    }

    if (!roles.includes(userProfile.role)) {
      // User does not have the required role, redirect them.
      // If internal role was required, send to admin home. Otherwise, careers home.
      const targetHome = ROLES_INTERNAL.includes(userProfile.role) ? '/admin' : '/careers/me';
      router.replace(targetHome);
    }
  }, [userProfile, loading, router, roles]);

  // Return a boolean indicating if the user has access.
  // The component can use this to avoid rendering content before redirect.
  return !loading && !!userProfile && roles.includes(userProfile.role);
};
