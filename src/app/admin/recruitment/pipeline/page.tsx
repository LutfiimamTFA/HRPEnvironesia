'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// This page is now a tab in the main recruitment dashboard.
// This component will redirect to the correct page.
export default function PipelineRedirect() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/admin/recruitment');
    }, [router]);

    return null; // or a loading spinner
}
