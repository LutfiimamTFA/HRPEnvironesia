'use client';

import { useAuth } from '@/providers/auth-provider';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { ROLES_INTERNAL } from '@/lib/types';

export default function AdminRedirectPage() {
  const { userProfile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    if (!userProfile || !ROLES_INTERNAL.includes(userProfile.role)) {
      // This should be caught by the layout, but as a safeguard
      router.replace('/admin/login');
      return;
    }
    
    // Redirect to the role-specific dashboard under the /admin route
    router.replace(`/admin/${userProfile.role}`);

  }, [userProfile, loading, router]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="text-muted-foreground">Loading your dashboard...</p>
      </div>
    </div>
  );
}
