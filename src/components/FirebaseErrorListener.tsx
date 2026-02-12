'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

/**
 * An invisible component that listens for globally emitted 'permission-error' events.
 * It throws any received error to be caught by Next.js's global-error.tsx.
 * It makes an exception for public-facing routes to prevent crashing the whole app.
 */
export function FirebaseErrorListener() {
  const [error, setError] = useState<FirestorePermissionError | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    const handleError = (error: FirestorePermissionError) => {
      // For public career pages, we don't want to crash the app.
      // The local component's error state can handle showing a message.
      if (pathname.startsWith('/careers')) {
        console.warn('A Firestore permission error was caught on a public page and suppressed from crashing the app:', error);
        // Do not set the error state, so we don't throw.
      } else {
        // For all other pages (e.g., /admin), we want the developer to see the error overlay.
        setError(error);
      }
    };

    errorEmitter.on('permission-error', handleError);

    return () => {
      errorEmitter.off('permission-error', handleError);
    };
  }, [pathname]); // Re-evaluate if the user navigates

  if (error) {
    // This will only be thrown for non-careers pages.
    throw error;
  }

  // This component renders nothing.
  return null;
}
