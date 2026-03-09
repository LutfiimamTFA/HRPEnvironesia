import { redirect } from 'next/navigation';

// This page now acts as a redirector for the old /login route.
export default function LegacyLoginPage() {
  redirect('/admin/login');
}
