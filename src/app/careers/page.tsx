'use client';

import { useEffect } from 'react';
import { useRouter } from '@/navigation'; // Use i18n router
import { Loader2 } from 'lucide-react';

/**
 * This page now only serves as a safeguard to redirect any traffic
 * hitting the non-localized `/careers` path to the correct,
 * internationalized version (e.g., `/id/careers`).
 * It contains no server-side logic and does not call Firebase hooks,
 * which resolves the build error.
 */
export default function LegacyCareersRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    // The i18n router from @/navigation will automatically handle
    // redirecting to the correct locale based on middleware settings.
    router.replace('/careers');
  }, [router]);

  return (
    <div className="flex h-screen items-center justify-center">
       <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="text-muted-foreground">Redirecting to careers page...</p>
      </div>
    </div>
  );
}
