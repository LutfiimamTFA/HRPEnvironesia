'use client';

import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { ArrowRight, Briefcase, FileText, User, FileSignature, FileSearch, BrainCircuit, Users, CheckCircle } from 'lucide-react';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import React from 'react';


const recruitmentSteps = [
  {
    icon: FileSignature,
    title: '1. Kirim Lamaran',
    description: 'Lamar posisi yang Anda minati melalui portal karir.',
  },
  {
    icon: BrainCircuit,
    title: '2. Psikotes',
    description: 'Tes psikologi untuk mengukur potensi dan kesesuaian Anda.',
  },
  {
    icon: FileSearch,
    title: '3. Seleksi Dokumen',
    description: 'Tim kami akan meninjau CV dan kesesuaian profil Anda.',
  },
  {
    icon: Users,
    title: '4. Wawancara',
    description: 'Diskusi mendalam bersama tim HR dan calon user Anda.',
  },
  {
    icon: CheckCircle,
    title: '5. Penawaran',
    description: 'Kandidat terpilih akan menerima tawaran kerja resmi dari kami.',
  },
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
          <CardContent className="px-2">
             <Carousel
              opts={{
                align: "start",
                dragFree: true,
              }}
              className="w-full"
            >
              <CarouselContent>
                {recruitmentSteps.map((step, index) => (
                  <CarouselItem key={index} className="basis-full md:basis-1/2 lg:basis-1/3 xl:basis-1/4">
                    <div className="p-1">
                      <div className="flex h-full items-center gap-4 rounded-lg border p-4">
                        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <step.icon className="h-6 w-6" />
                        </div>
                        <div>
                          <p className="font-semibold">{step.title}</p>
                          <p className="text-xs text-muted-foreground">{step.description}</p>
                        </div>
                      </div>
                    </div>
                  </CarouselItem>
                ))}
              </CarouselContent>
              <div className="hidden md:block">
                  <CarouselPrevious />
                  <CarouselNext />
              </div>
            </Carousel>
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
