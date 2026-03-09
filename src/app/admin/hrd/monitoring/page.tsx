import { redirect } from 'next/navigation';

// This page is now replaced by the main HRD dashboard.
// This component will redirect to the correct page.
export default function MonitoringRedirect() {
    redirect('/admin/hrd/dashboard-karyawan');
}
