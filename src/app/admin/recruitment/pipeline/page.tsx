import { redirect } from 'next/navigation';

// This page is now a tab in the main recruitment dashboard.
// This component will redirect to the correct page.
export default function PipelineRedirect() {
    redirect('/admin/recruitment');
}
