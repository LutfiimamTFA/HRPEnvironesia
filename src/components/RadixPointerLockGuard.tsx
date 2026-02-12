'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

// List of selectors for Radix UI components that can be in an "open" state and trap focus/scroll.
const OPEN_SELECTOR = [
  '[data-state="open"][role="dialog"]',
  '[data-state="open"][data-radix-popper-content-wrapper]',
  '[data-state="open"][data-radix-menu-content]',
  '[data-state="open"][data-radix-select-content]',
].join(', ');


/**
 * This component acts as a global safety net to prevent the UI from becoming unresponsive.
 * It detects situations where Radix UI components might have incorrectly left pointer-events
 * disabled on the body after closing, and forcefully resets them.
 */
export function RadixPointerLockGuard() {
  const pathname = usePathname();

  const unlockBody = () => {
    // Check if any Radix components are still considered "open".
    const isOpenOverlay = document.querySelector(OPEN_SELECTOR);

    // If the body has pointer events disabled, but no Radix component is open,
    // it's likely a stuck state.
    if (document.body.style.pointerEvents === 'none' && !isOpenOverlay) {
      document.body.style.pointerEvents = '';
      document.body.style.overflow = '';
      // Also remove any other potential scroll-lock attributes for good measure.
      document.body.removeAttribute('data-scroll-locked');
      document.body.removeAttribute('data-radix-scroll-area-scroll-y');
    }
  };

  useEffect(() => {
    // Run the check whenever the URL pathname changes.
    unlockBody();
  }, [pathname]);

  useEffect(() => {
    // Also run the check whenever the window regains focus, as this can be another
    // trigger for detecting a stuck state.
    window.addEventListener('focus', unlockBody);
    return () => {
      window.removeEventListener('focus', unlockBody);
    };
  }, []);

  // This component does not render anything.
  return null;
}
