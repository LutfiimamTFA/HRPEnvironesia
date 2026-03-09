import { redirect } from 'next/navigation';

// Redirect to the new, more comprehensive dashboard
export default function HrdDashboardRedirect() {
    redirect('/admin/hrd/dashboard-karyawan');
}
