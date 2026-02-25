'use client';

import { CandidateRegisterForm } from '@/components/auth/CandidateRegisterForm';
import { useAuth } from '@/providers/auth-provider';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect } from 'react';

export default function CandidateRegisterPage() {
  const { userProfile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && userProfile && userProfile.role === 'kandidat') {
      router.replace('/careers/portal');
    }
  }, [userProfile, loading, router]);

  if (loading || (userProfile && userProfile.role === 'kandidat')) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }
  
  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary p-4">
      <div className="w-full max-w-md space-y-6 rounded-xl bg-background p-8 shadow-lg">
        <div className="text-center">
           <Link href="/careers" className="inline-block">
            <h1 className="text-3xl font-bold tracking-tight text-primary">Environesia Karir</h1>
          </Link>
          <p className="mt-2 text-muted-foreground">Buat Akun Kandidat Baru</p>
        </div>
        <CandidateRegisterForm />
        <div className="text-center text-sm text-muted-foreground">
          <p>
            Sudah punya akun?{' '}
            <Link
              href="/careers/login"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Login di sini
            </Link>
          </p>
          <p className="mt-4">
            <Link
              href="/careers"
              className="text-sm text-muted-foreground underline-offset-4 hover:text-primary"
            >
              &larr; Kembali ke Halaman Karir
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
