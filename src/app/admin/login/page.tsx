import { Suspense } from 'react';

import AdminLoginClient from './AdminLoginClient';

function AdminLoginFallback() {
  return (
    <div className="flex min-h-[100dvh] w-full items-center justify-center bg-white dark:bg-slate-950">
      <div
        aria-label="Memuat halaman login"
        role="status"
        className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-teal-500 dark:border-slate-800 dark:border-t-teal-400"
      />
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<AdminLoginFallback />}>
      <AdminLoginClient />
    </Suspense>
  );
}
