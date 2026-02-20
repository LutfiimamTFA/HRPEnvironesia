import { redirect } from 'next/navigation';

/**
 * This page serves as a server-side redirect for any traffic
 * hitting the non-localized `/careers` path.
 * It ensures users are always on an internationalized route.
 */
export default function LegacyCareersRedirectPage() {
  redirect('/id/careers');
}
