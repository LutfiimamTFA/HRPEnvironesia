'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Briefcase, ChevronDown, FileText, Leaf, MapPin, Search, User, UserCheck, ShieldCheck, BarChart, Globe } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import type { Job } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';


const LeafBlob = ({className}: {className?: string}) => (
    <svg viewBox="0 0 519 500" fill="none" xmlns="http://www.w3.org/2000/svg" className={cn("absolute pointer-events-none", className)}>
        <path d="M518.5 250C518.5 388.071 402.571 500 259.5 500C116.429 500 0.5 388.071 0.5 250C0.5 111.929 116.429 0 259.5 0C402.571 0 518.5 111.929 518.5 250Z" fill="currentColor" opacity="0.05"/>
        <path d="M381.66 182.213C386.66 134.213 358.16 95.713 331.66 62.213C293.16 16.213 229.66 1.71301 179.16 27.213C128.66 52.713 98.6599 108.213 98.1599 164.713C97.1599 221.213 125.66 288.713 179.16 322.213C232.66 355.713 289.66 350.213 331.66 313.213C373.66 276.213 376.66 230.213 381.66 182.213Z" fill="currentColor" opacity="0.05"/>
    </svg>
)

const JobCard = ({ job }: { job: Job }) => (
  <Card className="flex flex-col rounded-xl border-border/50 shadow-sm transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
    <CardHeader>
      <Badge variant="secondary" className="w-fit font-medium">{job.brandName || 'Environesia'}</Badge>
      <CardTitle className="pt-2 text-xl">{job.position}</CardTitle>
    </CardHeader>
    <CardContent className="flex-grow">
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5 capitalize"><Briefcase className="h-4 w-4" /> {job.statusJob}</span>
        <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" /> {job.location}</span>
      </div>
    </CardContent>
    <CardFooter>
      <Button variant="default" asChild className="w-full">
        <Link href={`/careers/jobs/${job.slug}`}>
          Lihat Detail <ArrowRight className="ml-2 h-4 w-4" />
        </Link>
      </Button>
    </CardFooter>
  </Card>
);

const JobCardSkeleton = () => (
    <Card className="flex flex-col rounded-xl">
        <CardHeader>
             <Skeleton className="h-6 w-20 rounded-full" />
             <Skeleton className="mt-2 h-7 w-3/4" />
        </CardHeader>
        <CardContent className="flex-grow">
             <div className="flex gap-4">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-5 w-20" />
            </div>
        </CardContent>
        <CardFooter>
            <Skeleton className="h-10 w-full" />
        </CardFooter>
    </Card>
)

const StepCard = ({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) => (
    <div className="rounded-xl border bg-card p-6 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            {icon}
        </div>
        <h3 className="mb-2 text-lg font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
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
    <div className="flex min-h-dvh flex-col bg-background font-body text-foreground">
      
      {/* Hero Section */}
      <section id="hero" className="relative w-full overflow-hidden bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(var(--primary)/0.8)] text-primary-foreground">
        <LeafBlob className="left-[-250px] top-[-150px] h-[544px] w-[578px] text-white/10" />
        <LeafBlob className="right-[-350px] bottom-[-150px] h-[644px] w-[678px] text-white/10" />
        
        <header className="absolute top-0 z-50 w-full">
            <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="flex h-20 items-center justify-between">
                    <Link href="/careers" className="flex items-center gap-2">
                        <Leaf className="h-7 w-7 text-white" />
                        <span className="text-xl font-bold tracking-tight text-white">Environesia Karir</span>
                    </Link>
                    <nav className="hidden items-center gap-8 text-sm font-medium md:flex">
                        <Link href="#lowongan" className="text-primary-foreground/80 transition-colors hover:text-white">Lowongan</Link>
                        <Link href="#tahapan-rekrutmen" className="text-primary-foreground/80 transition-colors hover:text-white">Proses</Link>
                        <Link href="#faq" className="text-primary-foreground/80 transition-colors hover:text-white">FAQ</Link>
                    </nav>
                    <div className="hidden items-center gap-2 md:flex">
                        <Button variant="outline" asChild className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-white">
                        <Link href="/careers/login">Masuk Kandidat</Link>
                        </Button>
                        <Button asChild className="bg-white/90 text-primary hover:bg-white">
                        <Link href="/careers/register">Daftar</Link>
                        </Button>
                    </div>
                </div>
            </div>
        </header>

        <div className="relative z-10 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex min-h-[70vh] flex-col items-center justify-center pb-20 pt-32 text-center lg:min-h-[80vh]">
                <h1 className="text-4xl font-semibold tracking-tight md:text-6xl lg:text-7xl">
                    Mari Buat Perubahan Bersama Kami
                </h1>
                <p className="mt-6 max-w-2xl text-lg text-primary-foreground/80">
                    Jadilah bagian dari tim inovatif yang berdedikasi untuk menciptakan solusi lingkungan berkelanjutan. Temukan peran Anda di Environesia.
                </p>
                <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
                  <Button size="lg" className="h-12 px-8 text-base bg-white/90 text-primary hover:bg-white" asChild>
                    <Link href="#lowongan">
                      Lihat Lowongan <ChevronDown className="ml-2 h-5 w-5" />
                    </Link>
                  </Button>
                </div>
                 <div className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-sm text-primary-foreground/60">
                    <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4"/> 560+ Proyek Terselesaikan</span>
                    <span className="flex items-center gap-2"><Globe className="h-4 w-4"/> 38 Provinsi di Indonesia</span>
                    <span className="flex items-center gap-2"><BarChart className="h-4 w-4"/> Lab & Konsultansi</span>
                </div>
            </div>
        </div>
      </section>

      <main className="flex-1">
        {/* Lowongan Section */}
        <section id="lowongan" className="w-full scroll-mt-20 py-16 lg:py-24">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Temukan Peluang Anda</h2>
              <p className="mt-4 text-lg text-muted-foreground">
                Kami mencari individu berbakat untuk bergabung dengan berbagai tim kami. Jelajahi posisi yang sesuai dengan keahlian Anda.
              </p>
            </div>

            <Tabs defaultValue="fulltime" className="mt-12">
              <div className="flex justify-center">
                <TabsList className="h-12 rounded-full p-2">
                  <TabsTrigger value="fulltime" className="px-6 py-2 text-base rounded-full">Full-time</TabsTrigger>
                  <TabsTrigger value="internship" className="px-6 py-2 text-base rounded-full">Internship</TabsTrigger>
                  <TabsTrigger value="contract" className="px-6 py-2 text-base rounded-full">Contract</TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="fulltime" className="mt-8">
                 <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {isLoading && <> <JobCardSkeleton/> <JobCardSkeleton/> <JobCardSkeleton/> </>}
                    {!isLoading && filterJobs('fulltime').map(job => <JobCard key={job.id} job={job} />)}
                 </div>
                 {!isLoading && filterJobs('fulltime').length === 0 && <div className="text-center text-muted-foreground mt-12 rounded-lg border-2 border-dashed p-12"><p>Belum ada lowongan full-time saat ini.</p></div>}
              </TabsContent>
               <TabsContent value="internship" className="mt-8">
                 <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {isLoading && <> <JobCardSkeleton/> <JobCardSkeleton/> </>}
                    {!isLoading && filterJobs('internship').map(job => <JobCard key={job.id} job={job} />)}
                 </div>
                 {!isLoading && filterJobs('internship').length === 0 && <div className="text-center text-muted-foreground mt-12 rounded-lg border-2 border-dashed p-12"><p>Belum ada lowongan magang saat ini.</p></div>}
              </TabsContent>
              <TabsContent value="contract" className="mt-8">
                 <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {isLoading && <> <JobCardSkeleton/> <JobCardSkeleton/> </>}
                    {!isLoading && filterJobs('contract').map(job => <JobCard key={job.id} job={job} />)}
                 </div>
                 {!isLoading && filterJobs('contract').length === 0 && <div className="text-center text-muted-foreground mt-12 rounded-lg border-2 border-dashed p-12"><p>Belum ada lowongan kontrak saat ini.</p></div>}
              </TabsContent>
            </Tabs>
          </div>
        </section>
        
        {/* Tahapan Rekrutmen Section */}
        <section id="tahapan-rekrutmen" className="w-full scroll-mt-14 bg-secondary py-16 lg:py-24">
            <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-xl text-center">
                    <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Proses Rekrutmen Kami</h2>
                    <p className="mt-4 text-lg text-muted-foreground">
                        Kami merancang proses yang adil dan transparan untuk menemukan talenta terbaik.
                    </p>
                </div>
                <div className="relative mt-16">
                    <div className="absolute left-1/2 top-4 hidden h-full w-[2px] -translate-x-1/2 bg-border md:block" />
                    <div className="grid gap-8 md:grid-cols-1 md:gap-y-20">
                        {[
                            { step: 1, title: 'Daftar Online', desc: 'Lengkapi profil dan kirimkan lamaran Anda melalui portal karir kami.' },
                            { step: 2, title: 'Psikotes', desc: 'Kerjakan tes psikologi untuk mengukur potensi dan kesesuaian Anda.' },
                            { step: 3, title: 'Seleksi Administrasi', desc: 'Tim rekrutmen akan meninjau kelengkapan profil dan hasil psikotes Anda.' },
                            { step: 4, title: 'Wawancara', desc: 'Bertemu dengan HR dan calon user untuk diskusi lebih mendalam.' },
                            { step: 5, title: 'Tawaran Kerja', desc: 'Kandidat terpilih akan menerima tawaran kerja resmi.' },
                        ].map((item, index) => (
                            <div key={item.step} className={cn('relative flex items-center gap-8', index % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse')}>
                                <div className="z-10 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground shadow-lg">{item.step}</div>
                                <Card className="w-full shadow-md md:w-2/5">
                                    <CardHeader>
                                        <CardTitle className="text-xl">{item.title}</CardTitle>
                                        <CardDescription className="pt-1">{item.desc}</CardDescription>
                                    </CardHeader>
                                </Card>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>

        {/* Tutorial Section */}
        <section id="tutorial" className="w-full scroll-mt-14 py-16 lg:py-24">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-xl text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Cara Mudah Melamar</h2>
              <p className="mt-4 text-lg text-muted-foreground">Ikuti langkah-langkah sederhana ini untuk memulai perjalanan karir Anda di Environesia.</p>
            </div>
            <div className="mt-16 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
                <StepCard icon={<User className="h-8 w-8" />} title="Buat Akun" description="Daftarkan diri Anda dengan email dan buat kata sandi." />
                <StepCard icon={<Search className="h-8 w-8" />} title="Cari Lowongan" description="Jelajahi berbagai posisi yang tersedia dan temukan yang paling cocok." />
                <StepCard icon={<FileText className="h-8 w-8" />} title="Kirim Lamaran" description="Unggah CV terbaru Anda dan kirimkan lamaran dengan sekali klik." />
                <StepCard icon={<UserCheck className="h-8 w-8" />} title="Pantau Proses" description="Lacak status lamaran Anda langsung dari dasbor kandidat." />
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section id="faq" className="w-full scroll-mt-14 bg-secondary py-16 lg:py-24">
          <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-xl text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Pertanyaan Umum (FAQ)</h2>
              <p className="mt-4 text-lg text-muted-foreground">
                Menemukan jawaban atas pertanyaan umum seputar proses lamaran kerja di Environesia.
              </p>
            </div>
            <Accordion type="single" collapsible className="mt-12 w-full space-y-4">
              <AccordionItem value="item-1" className="rounded-xl border bg-card px-6 shadow-sm">
                <AccordionTrigger className="py-5 text-lg">Apa saja yang harus saya siapkan sebelum melamar?</AccordionTrigger>
                <AccordionContent className="pt-2 text-base text-muted-foreground">
                  Pastikan Anda telah menyiapkan CV (Curriculum Vitae) terbaru dalam format PDF, surat lamaran (opsional), dan portofolio jika posisi yang dilamar memerlukannya (misalnya untuk desainer atau developer).
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-2" className="rounded-xl border bg-card px-6 shadow-sm">
                <AccordionTrigger className="py-5 text-lg">Berapa lama proses rekrutmen biasanya berlangsung?</AccordionTrigger>
                <AccordionContent className="pt-2 text-base text-muted-foreground">
                  Proses rekrutmen kami biasanya memakan waktu 2-4 minggu dari penutupan lowongan. Namun, durasi ini bisa bervariasi tergantung pada posisi dan jumlah pelamar. Kami akan selalu memberikan informasi terbaru melalui email.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-3" className="rounded-xl border bg-card px-6 shadow-sm">
                <AccordionTrigger className="py-5 text-lg">Apakah saya bisa melamar lebih dari satu posisi?</AccordionTrigger>
                <AccordionContent className="pt-2 text-base text-muted-foreground">
                  Ya, Anda dapat melamar hingga 3 posisi yang berbeda secara bersamaan. Namun, kami sarankan untuk fokus pada posisi yang paling sesuai dengan kualifikasi dan minat Anda.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-4" className="rounded-xl border bg-card px-6 shadow-sm">
                <AccordionTrigger className="py-5 text-lg">Siapa yang bisa saya hubungi jika ada pertanyaan lebih lanjut?</AccordionTrigger>
                <AccordionContent className="pt-2 text-base text-muted-foreground">
                  Jika Anda memiliki pertanyaan yang tidak terjawab di sini, jangan ragu untuk menghubungi tim rekrutmen kami melalui email di careers@environesia.co.id.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </section>

      </main>

      <footer className="border-t">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col-reverse items-center justify-between gap-4 py-8 md:flex-row">
                <p className="text-sm text-muted-foreground">
                    © {new Date().getFullYear()} Environesia. All Rights Reserved.
                </p>
                 <div>
                    <a href="https://environesia.co.id/" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-primary">
                        Company Profile
                    </a>
                </div>
                <p className="text-sm text-muted-foreground">
                  Karyawan Environesia?{' '}
                  <Link href="/admin/login" className="font-medium text-primary underline-offset-4 hover:underline">
                    Akses internal di sini
                  </Link>
                </p>
            </div>
        </div>
      </footer>
    </div>
  );
}
