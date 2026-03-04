
'use client';

import { Suspense } from 'react';
import { RegisterWithBatchForm } from '@/components/auth/RegisterWithCodeForm';
import { Loader2 } from 'lucide-react';

function RegisterPageContent() {
    return <RegisterWithBatchForm />;
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="flex h-screen w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
      <RegisterPageContent />
    </Suspense>
  );
}

    