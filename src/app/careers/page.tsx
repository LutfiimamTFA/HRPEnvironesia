
'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Briefcase, ChevronDown, FileText, Leaf, MapPin, Search, User, UserCheck } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import type { Job } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';

const JobCard = ({ job }: { job: Job }) => (
  <Card className="flex flex-col transition-shadow duration-300 hover:shadow-xl">
    <CardHeader className="flex-grow">
      <CardTitle className="text-xl">{job.position}</CardTitle>
      <CardDescription className="flex items-center gap-4 pt-2">
        <span className="flex items-center gap-1.5 capitalize"><Briefcase className="h-4 w-4" /> {job.statusJob}</span>
        <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" /> {job.location}</span>
      </CardDescription>
    </CardHeader>
    <CardFooter className="flex items-center justify-between">
      <Badge variant="secondary">{job.brandName || 'Environesia'}</Badge>
      <Button variant="default" asChild>
        <Link href={`/careers/jobs/${job.slug}`}>
          Lihat Detail <ArrowRight className="ml-2 h-4 w-4" />
        </Link>
      </Button>
    </CardFooter>
  </Card>
);

const JobCardSkeleton = () => (
    <Card className="flex flex-col">
        <CardHeader className="flex-grow">
            <Skeleton className="h-6 w-3/4" />
            <div className="flex items-center gap-4 pt-2">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-5 w-20" />
            </div>
        </CardHeader>
        <CardFooter className="flex items-center justify-between">
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-10 w-32" />
        </CardFooter>
    </Card>
)

const StepCard = ({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) => (
    <div className="flex flex-col items-center p-4 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
            {icon}
        </div>
        <h3 className="mb-2 text-lg font-semibold">{title}</h3>
        <p className="text-muted-foreground">{description}</p>
    </div>
);

export default function CareersPage() {
  const firestore = useFirestore();
  
  const publishedJobsQuery = useMemoFirebase(
    () => query(
      collection(firestore, 'jobs'), 
      where('publishStatus', '==', 'published')
    ), 
    [firestore]
  );

  const { data: jobs, isLoading } = useCollection<Job>(publishedJobsQuery);

  const sortedJobs = useMemo(() => {
    if (!jobs) return [];
    return [...jobs].sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return timeB - timeA;
    });
  }, [jobs]);

  const filterJobs = (type: Job['statusJob']) => {
    return sortedJobs?.filter(job => job.statusJob === type) || [];
  }

  return (
    <div className="flex min-h-screen flex-col bg-background font-body">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between">
          <Link href="/careers" className="flex items-center gap-2">
            <Leaf className="h-7 w-7 text-primary" />
            <span className="text-xl font-bold tracking-tight text-foreground">Environesia Karir</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium md:flex">
            <Link href="#lowongan" className="text-muted-foreground transition-colors hover:text-primary">Lowongan</Link>
            <Link href="#tahapan-rekrutmen" className="text-muted-foreground transition-colors hover:text-primary">Proses Rekrutmen</Link>
            <Link href="#tutorial" className="text-muted-foreground transition-colors hover:text-primary">Cara Melamar</Link>
            <Link href="#faq" className="text-muted-foreground transition-colors hover:text-primary">FAQ</Link>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/careers/login">Masuk Kandidat</Link>
            </Button>
            <Button asChild>
              <Link href="/careers/register">Daftar</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section id="hero" className="relative h-[60vh] w-full">
            <Image
                src="https://picsum.photos/seed/career-hero/1800/1200"
                alt="Tim Environesia"
                fill
                priority
                className="object-cover"
                data-ai-hint="office team collaboration"
            />
            <div className="absolute inset-0 bg-black/50" />
            <div className="relative z-10 flex h-full flex-col items-center justify-center p-4 text-center text-white">
                <h1 className="text-4xl font-bold !leading-tight tracking-tighter md:text-6xl">
                    Bangun Masa Depan Anda Bersama Kami
                </h1>
                <p className="mt-4 max-w-2xl text-lg text-primary-foreground/80">
                    Jadilah bagian dari tim inovatif yang berdedikasi untuk menciptakan solusi berkelanjutan. Temukan peran Anda di Environesia.
                </p>
                <Button size="lg" className="mt-8" asChild>
                  <Link href="#lowongan">
                    Lihat Lowongan <ChevronDown className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
            </div>
        </section>

        {/* Lowongan Section */}
        <section id="lowongan" className="w-full scroll-mt-14 py-12 md:py-20 lg:py-24">
          <div className="container">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Temukan Peluang Anda</h2>
              <p className="mt-4 text-lg text-muted-foreground">
                Kami mencari individu berbakat untuk bergabung dengan berbagai tim kami. Jelajahi posisi yang sesuai dengan keahlian Anda.
              </p>
            </div>

            <Tabs defaultValue="fulltime" className="mt-12">
              <div className="flex justify-center">
                <TabsList>
                  <TabsTrigger value="fulltime">Full-time</TabsTrigger>
                  <TabsTrigger value="internship">Internship</TabsTrigger>
                  <TabsTrigger value="contract">Contract</TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="fulltime" className="mt-8">
                 <div className="grid gap-6 md:grid-cols-2">
                    {isLoading && <> <JobCardSkeleton/> <JobCardSkeleton/> </>}
                    {!isLoading && filterJobs('fulltime').map(job => <JobCard key={job.id} job={job} />)}
                 </div>
                 {!isLoading && filterJobs('fulltime').length === 0 && <p className="text-center text-muted-foreground mt-8">Belum ada lowongan full-time saat ini.</p>}
              </TabsContent>
               <TabsContent value="internship" className="mt-8">
                 <div className="grid gap-6 md:grid-cols-2">
                    {isLoading && <> <JobCardSkeleton/> <JobCardSkeleton/> </>}
                    {!isLoading && filterJobs('internship').map(job => <JobCard key={job.id} job={job} />)}
                 </div>
                 {!isLoading && filterJobs('internship').length === 0 && <p className="text-center text-muted-foreground mt-8">Belum ada lowongan magang saat ini.</p>}
              </TabsContent>
              <TabsContent value="contract" className="mt-8">
                 <div className="grid gap-6 md:grid-cols-2">
                    {isLoading && <> <JobCardSkeleton/> <JobCardSkeleton/> </>}
                    {!isLoading && filterJobs('contract').map(job => <JobCard key={job.id} job={job} />)}
                 </div>
                 {!isLoading && filterJobs('contract').length === 0 && <p className="text-center text-muted-foreground mt-8">Belum ada lowongan kontrak saat ini.</p>}
              </TabsContent>
            </Tabs>
          </div>
        </section>
        
        {/* Tahapan Rekrutmen Section */}
        <section id="tahapan-rekrutmen" className="w-full scroll-mt-14 bg-secondary py-12 md:py-20 lg:py-24">
            <div className="container">
                <div className="mx-auto max-w-xl text-center">
                    <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Proses Rekrutmen Kami</h2>
                    <p className="mt-4 text-muted-foreground">
                        Kami merancang proses yang adil dan transparan untuk menemukan talenta terbaik.
                    </p>
                </div>
                <div className="relative mt-12">
                    <div className="absolute left-1/2 top-4 hidden h-full w-0.5 bg-border md:block" />
                    <div className="grid gap-8 md:grid-cols-1 md:gap-y-16">
                        {[
                            { step: 1, title: 'Daftar Online', desc: 'Lengkapi profil dan kirimkan lamaran Anda melalui portal karir kami.' },
                            { step: 2, title: 'Psikotes', desc: 'Kerjakan tes psikologi untuk mengukur potensi dan kesesuaian Anda.' },
                            { step: 3, title: 'Seleksi Administrasi', desc: 'Tim rekrutmen akan meninjau kelengkapan profil dan hasil psikotes Anda.' },
                            { step: 4, title: 'Wawancara', desc: 'Bertemu dengan HR dan calon user untuk diskusi lebih mendalam.' },
                            { step: 5, title: 'Tawaran Kerja', desc: 'Kandidat terpilih akan menerima tawaran kerja resmi.' },
                        ].map((item, index) => (
                            <div key={item.step} className={`flex items-center gap-6 ${index % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'}`}>
                                <div className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground">{item.step}</div>
                                <Card className="w-full md:w-2/5">
                                    <CardHeader>
                                        <CardTitle>{item.title}</CardTitle>
                                        <CardDescription>{item.desc}</CardDescription>
                                    </CardHeader>
                                </Card>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>

        {/* Tutorial Section */}
        <section id="tutorial" className="w-full scroll-mt-14 py-12 md:py-20 lg:py-24">
          <div className="container">
            <div className="mx-auto max-w-xl text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Cara Mudah Melamar</h2>
              <p className="mt-4 text-muted-foreground">Ikuti langkah-langkah sederhana ini untuk memulai perjalanan karir Anda di Environesia.</p>
            </div>
            <div className="mt-12 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
                <StepCard icon={<User className="h-8 w-8" />} title="Buat Akun" description="Daftarkan diri Anda dengan email dan buat kata sandi." />
                <StepCard icon={<Search className="h-8 w-8" />} title="Cari Lowongan" description="Jelajahi berbagai posisi yang tersedia dan temukan yang paling cocok." />
                <StepCard icon={<FileText className="h-8 w-8" />} title="Kirim Lamaran" description="Unggah CV terbaru Anda dan kirimkan lamaran dengan sekali klik." />
                <StepCard icon={<UserCheck className="h-8 w-8" />} title="Pantau Proses" description="Lacak status lamaran Anda langsung dari dasbor kandidat." />
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section id="faq" className="w-full scroll-mt-14 bg-secondary py-12 md:py-20 lg:py-24">
          <div className="container max-w-4xl">
            <div className="mx-auto max-w-xl text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Pertanyaan Umum (FAQ)</h2>
              <p className="mt-4 text-muted-foreground">
                Menemukan jawaban atas pertanyaan umum seputar proses lamaran kerja di Environesia.
              </p>
            </div>
            <Accordion type="single" collapsible className="mt-12 w-full space-y-3">
              <AccordionItem value="item-1" className="rounded-lg border bg-card px-4">
                <AccordionTrigger>Apa saja yang harus saya siapkan sebelum melamar?</AccordionTrigger>
                <AccordionContent>
                  Pastikan Anda telah menyiapkan CV (Curriculum Vitae) terbaru dalam format PDF, surat lamaran (opsional), dan portofolio jika posisi yang dilamar memerlukannya (misalnya untuk desainer atau developer).
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-2" className="rounded-lg border bg-card px-4">
                <AccordionTrigger>Berapa lama proses rekrutmen biasanya berlangsung?</AccordionTrigger>
                <AccordionContent>
                  Proses rekrutmen kami biasanya memakan waktu 2-4 minggu dari penutupan lowongan. Namun, durasi ini bisa bervariasi tergantung pada posisi dan jumlah pelamar. Kami akan selalu memberikan informasi terbaru melalui email.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-3" className="rounded-lg border bg-card px-4">
                <AccordionTrigger>Apakah saya bisa melamar lebih dari satu posisi?</AccordionTrigger>
                <AccordionContent>
                  Ya, Anda dapat melamar hingga 3 posisi yang berbeda secara bersamaan. Namun, kami sarankan untuk fokus pada posisi yang paling sesuai dengan kualifikasi dan minat Anda.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-4" className="rounded-lg border bg-card px-4">
                <AccordionTrigger>Siapa yang bisa saya hubungi jika ada pertanyaan lebih lanjut?</AccordionTrigger>
                <AccordionContent>
                  Jika Anda memiliki pertanyaan yang tidak terjawab di sini, jangan ragu untuk menghubungi tim rekrutmen kami melalui email di careers@environesia.co.id.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </section>

      </main>

      <footer className="border-t">
        <div className="container flex flex-col-reverse items-center justify-between gap-4 py-6 md:flex-row">
            <p className="text-sm text-muted-foreground">
                © {new Date().getFullYear()} Environesia. All Rights Reserved.
            </p>
            <p className="text-sm text-muted-foreground">
              Karyawan Environesia?{' '}
              <Link href="/admin/login" className="font-medium text-primary underline-offset-4 hover:underline">
                Akses internal di sini
              </Link>
            </p>
        </div>
      </footer>
    </div>
  );
}
