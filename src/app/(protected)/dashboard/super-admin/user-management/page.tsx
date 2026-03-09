import { redirect } from 'next/navigation';

export default function DeprecatedPage() {
  redirect('/admin/super-admin/user-management');
}
