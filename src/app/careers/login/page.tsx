'use client';

import { CandidateLoginForm } from '@/components/auth/CandidateLoginForm';
import { useAuth } from '@/providers/auth-provider';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, Suspense } from 'react';

function CandidateLoginContent() {
  const { userProfile, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect');

  useEffect(() => {
    if (!loading && userProfile && userProfile.role === 'kandidat') {
      if (redirect) {
        router.replace(redirect);
      } else {
        router.replace('/careers/portal');
      }
    }
  }, [userProfile, loading, router, redirect]);

  if (loading || (userProfile && userProfile.role === 'kandidat')) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-secondary p-4">
      <div className="w-full max-w-md space-y-6 rounded-xl bg-background p-8 shadow-lg">
        <div className="text-center">
          <Link href="/careers" className="inline-block">
            <h1 className="text-3xl font-bold tracking-tight text-primary">Environesia Karir</h1>
          </Link>
          <p className="mt-2 text-muted-foreground">Login Kandidat</p>
        </div>
        <CandidateLoginForm />
        <div className="text-center text-sm text-muted-foreground">
          <p>
            Belum punya akun?{' '}
            <Link
              href="/careers/register"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Daftar di sini
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}


export default function CandidateLoginPage() {
  return (
    <Suspense fallback={<div className="flex h-screen w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
      <CandidateLoginContent />
    </Suspense>
  )
}