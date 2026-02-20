import { redirect } from 'next/navigation';

export default function Home() {
  // Redirect to the default locale's careers page.
  // This is a server-side redirect, safe for build time.
  redirect('/id/careers');
}
