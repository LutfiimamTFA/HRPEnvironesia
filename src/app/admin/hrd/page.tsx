'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function HrdDashboardRedirect() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/admin/recruitment');
    }, [router]);

    return null; // or a loading spinner
}
