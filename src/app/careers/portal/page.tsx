'use client';

import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export default function CandidateDashboardPage() {
  const { userProfile } = useAuth();

  return (
    <div className="space-y-6">
        <div className="space-y-1">
            <h1 className="text-3xl font-bold">Halo, {userProfile?.fullName}!</h1>
            <p className="text-muted-foreground">Selamat datang di portal kandidat Anda. Mari mulai perjalanan karir Anda.</p>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
            <Card>
                <CardHeader>
                    <CardTitle>Profil Anda</CardTitle>
                    <CardDescription>Pastikan profil Anda selalu terbaru.</CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-sm p-4 text-center border rounded-lg bg-muted/50">
                        Fitur kelengkapan profil sedang dikembangkan.
                    </p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle>Lamaran Anda</CardTitle>
                    <CardDescription>Lacak semua lamaran pekerjaan Anda di sini.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Button asChild className="w-full">
                        <Link href="/careers/portal/applications">
                            Lihat Riwayat Lamaran <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                    </Button>
                </CardContent>
            </Card>
        </div>
    </div>
  );
}
