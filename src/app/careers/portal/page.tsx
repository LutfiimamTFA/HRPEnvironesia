'use client';

import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { ArrowRight, Briefcase, FileText, User, FileUp, ClipboardCheck, FileSearch, Users, Award } from 'lucide-react';
import React from 'react';
import { cn } from '@/lib/utils';

const recruitmentSteps = [
  { title: 'Lengkapi Profil', icon: User },
  { title: 'Kirim Lamaran', icon: FileUp },
  { title: 'Psikotes', icon: ClipboardCheck },
  { title: 'Seleksi Dokumen', icon: FileSearch },
  { title: 'Wawancara', icon: Users },
  { title: 'Penawaran', icon: Award },
];

export default function CandidateDashboardPage() {
  const { userProfile } = useAuth();
  
  // If profile is not complete, the active step is 0 (Lengkapi Profil).
  // Otherwise, the active step is 1 (Kirim Lamaran), as they are now ready to apply.
  const activeStepIndex = userProfile?.isProfileComplete ? 1 : 0;

  return (
    <div className="space-y-8">
        <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">Halo, {userProfile?.fullName}!</h1>
            <p className="text-muted-foreground">Selamat datang di portal kandidat Anda. Mari mulai perjalanan karir Anda.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Proses Rekrutmen Anda</CardTitle>
            <CardDescription>Ikuti alur di bawah ini untuk memulai perjalanan Anda bersama kami.</CardDescription>
          </CardHeader>
          <CardContent className="px-6 pt-4 pb-8">
            <div className="w-full overflow-x-auto">
              <div className="flex items-start justify-center min-w-[700px] md:min-w-[800px]">
                {recruitmentSteps.map((step, index) => {
                  const isCompleted = index < activeStepIndex;
                  const isActive = index === activeStepIndex;
                  
                  return (
                    <React.Fragment key={index}>
                      <div className="flex flex-col items-center text-center w-28 flex-shrink-0">
                        <div
                          className={cn(
                            'relative z-10 h-12 w-12 rounded-full flex items-center justify-center border-2 transition-all duration-300',
                            isActive ? 'border-primary bg-primary/10' : 'border-border',
                            isCompleted ? 'border-primary bg-primary' : 'bg-card'
                          )}
                        >
                          <step.icon className={cn(
                            'h-6 w-6 transition-colors duration-300',
                            isActive ? 'text-primary' : '',
                            isCompleted ? 'text-primary-foreground' : 'text-muted-foreground'
                          )} />
                        </div>
                        <p className={cn(
                          'mt-2 text-xs font-medium transition-colors duration-300',
                          isActive || isCompleted ? 'text-primary' : 'text-muted-foreground'
                        )}>
                          {step.title}
                        </p>
                      </div>

                      {index < recruitmentSteps.length - 1 && (
                        <div className={cn(
                          "flex-1 h-1 transition-colors duration-300",
                          "mt-[23px]", // to align with circle center
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
