'use client';

import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { ArrowRight, Briefcase, FileText, User, FileUp, CheckCircle } from 'lucide-react';
import React from 'react';
import { cn } from '@/lib/utils';

const recruitmentSteps = [
  { title: 'Kirim Lamaran' },
  { title: 'Psikotes' },
  { title: 'Seleksi Dokumen' },
  { title: 'Wawancara' },
  { title: 'Penawaran' },
];

export default function CandidateDashboardPage() {
  const { userProfile } = useAuth();

  return (
    <div className="space-y-8">
        <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">Halo, {userProfile?.fullName}!</h1>
            <p className="text-muted-foreground">Selamat datang di portal kandidat Anda. Mari mulai perjalanan karir Anda.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Tahapan Proses Rekrutmen</CardTitle>
            <CardDescription>Berikut adalah gambaran umum alur seleksi di perusahaan kami.</CardDescription>
          </CardHeader>
          <CardContent className="px-6 pt-4 pb-8">
            <div className="w-full overflow-x-auto">
              <div className="flex items-start justify-center min-w-[600px]">
                {recruitmentSteps.map((step, index) => {
                  const isActive = index === 0; // Highlight the first step
                  const isCompleted = index < 0; // No steps are 'completed' in this static view
                  
                  return (
                    <React.Fragment key={index}>
                      <div className="flex flex-col items-center text-center w-28">
                        <div
                          className={cn(
                            'relative z-10 h-5 w-5 rounded-full flex items-center justify-center',
                            isActive || isCompleted ? 'bg-primary' : 'bg-border'
                          )}
                        >
                          {(isCompleted) && <CheckCircle className="h-5 w-5 text-primary-foreground" />}
                        </div>
                        <p className={cn(
                          'mt-2 text-xs font-medium',
                          isActive || isCompleted ? 'text-foreground' : 'text-muted-foreground'
                        )}>
                          {step.title}
                        </p>
                      </div>

                      {index < recruitmentSteps.length - 1 && (
                        <div className={cn(
                          "flex-1 h-0.5",
                          "mt-[9px]", // to align with circle center
                          isCompleted ? 'bg-primary' : 'bg-border'
                        )} />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

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
