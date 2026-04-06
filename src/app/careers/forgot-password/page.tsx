'use client';

import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary p-4">
      <div className="w-full max-w-md space-y-6 rounded-xl bg-background p-8 shadow-lg">
        <div className="text-center">
          <Link href="/careers" className="inline-block">
            <h1 className="text-3xl font-bold tracking-tight text-primary">Environesia Karir</h1>
          </Link>
          <p className="mt-2 text-muted-foreground">Reset Kata Sandi</p>
        </div>
        <ForgotPasswordForm />
         <div className="text-center text-sm">
            <Link
              href="/careers/login"
              className="text-muted-foreground underline-offset-4 hover:text-primary"
            >
              &larr; Kembali ke Login
            </Link>
          </div>
      </div>
    </main>
  );
}
