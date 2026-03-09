import { redirect } from 'next/navigation';

export default function DeprecatedPage() {
  // Redirects to the main careers portal, which will then handle auth.
  redirect('/careers/portal');
}
