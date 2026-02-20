

'use client';

import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/navigation';
import { ArrowRight, Briefcase, FileText, User } from 'lucide-react';
import React from 'react';

export default function CandidateDashboardPage() {
  const { userProfile } = useAuth();
  
  return (
    <div className="space-y-8">
        <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">Halo, {userProfile?.fullName}!</h1>
            <p className="text-muted-foreground">Selamat datang di portal kandidat Anda. Mari mulai perjalanan karir Anda.</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-3">
                        <Briefcase className="h-6 w-6 text-primary" />
                        Daftar Lowongan
                    </CardTitle>
                    <CardDescription>Jelajahi semua lowongan yang tersedia dan temukan yang cocok untuk Anda.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Button asChild className="w-full">
                        <Link href="/careers/portal/jobs">
                            Lihat Semua Lowongan
                            <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                    </Button>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-3">
                        <FileText className="h-6 w-6 text-primary" />
                        Lacak Lamaran
                    </CardTitle>
                    <CardDescription>Lihat riwayat dan status semua lamaran yang telah Anda kirimkan atau simpan.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Button asChild className="w-full">
                        <Link href="/careers/portal/applications">
                            Buka Riwayat Lamaran
                             <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                    </Button>
                </CardContent>
            </Card>
            
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-3">
                        <User className="h-6 w-6 text-primary" />
                        Kelola Profil
                    </CardTitle>
                    <CardDescription>Perbarui informasi pribadi dan kelola dokumen pendukung Anda.</CardDescription>
                </CardHeader>
                <CardContent>
                     <Button asChild className="w-full">
                        <Link href="/careers/portal/profile">
                            Pergi ke Profil
                            <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                    </Button>
                </CardContent>
            </Card>
        </div>
    </div>
  );
}

