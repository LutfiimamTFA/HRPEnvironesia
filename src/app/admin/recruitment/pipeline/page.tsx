'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// This page is now a tab in the main recruitment dashboard.
// This component will redirect to the correct tab.
export default function PipelineRedirect() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/admin/recruitment?view=pipeline');
    }, [router]);

    return null; // or a loading spinner
}
