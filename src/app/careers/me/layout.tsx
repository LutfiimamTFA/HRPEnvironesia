'use client';

import { useAuth } from '@/providers/auth-provider';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { ROLES_INTERNAL } from '@/lib/types';

export default function CandidateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userProfile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) {
      return; // Wait until loading is complete
    }

    if (!userProfile) {
      // Not logged in, redirect to the candidate login page
      router.replace('/careers/login');
      return;
    }
    
    if (ROLES_INTERNAL.includes(userProfile.role)) {
      // Logged in, but is an internal user. Redirect to admin portal.
      router.replace('/admin');
    }

  }, [userProfile, loading, router]);

  // Render a loading state while checking for user and role
  if (loading || !userProfile || userProfile.role !== 'kandidat') {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // If checks pass, render the child components
  return <>{children}</>;
}
