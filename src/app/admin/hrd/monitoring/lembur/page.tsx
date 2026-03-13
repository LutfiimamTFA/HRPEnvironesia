import { redirect } from 'next/navigation';

// Redirect to the new, more comprehensive approval page
export default function LemburMonitoringRedirect() {
    redirect('/admin/hrd/persetujuan-lembur');
}
