'use client';

import { useAuth } from '@/providers/auth-provider';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { LoginForm } from '@/components/auth/LoginForm';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';

export default function LoginPage() {
  const { firebaseUser, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && firebaseUser) {
      router.replace('/dashboard');
    }
  }, [firebaseUser, loading, router]);

  if (loading || firebaseUser) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <Link href="/" className="inline-block">
            <h1 className="text-3xl font-bold tracking-tight text-primary">HRP Starter Kit</h1>
          </Link>
          <p className="mt-2 text-muted-foreground">Sign in to your account</p>
        </div>
        <LoginForm />
        <div className="text-center text-sm text-muted-foreground">
          <p>
            First time setup?{' '}
            <Link
              href="/seed"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Seed user roles
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
