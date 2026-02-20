'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function HrdDashboardRedirect() {
    const router = useRouter();
    useEffect(() => {
        // Redirect to the main recruitment page as the primary view for HRD
        router.replace('/admin/recruitment');
    }, [router]);

    return null; // or a loading spinner
}
