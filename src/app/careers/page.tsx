'use client';

import React, { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Briefcase, ChevronRight, FileText, Leaf, MapPin, Search, User, UserCheck, ShieldCheck, BarChart, Globe, Menu, X, Building, Users, Clock } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import type { Job } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';

// --- Header Component ---
const Header = () => {
    const [scrolled, setScrolled] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 10);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const menuItems = [
        { href: '#lowongan', label: 'Lowongan' },
        { href: '#proses', label: 'Proses' },
        { href: '#faq', label: 'FAQ' },
        { href: 'https://environesia.co.id/', label: 'Company Profile', external: true },
    ];

    return (
        <header className={cn("sticky top-0 z-50 w-full transition-all duration-300", scrolled ? "bg-background/80 backdrop-blur-lg border-b" : "bg-transparent")}>
            <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="flex h-20 items-center justify-between">
                    <Link href="/careers" className="flex items-center gap-2">
                        <Leaf className="h-7 w-7 text-primary" />
                        <span className="text-xl font-bold tracking-tight">Environesia Karir</span>
                    </Link>
                    <nav className="hidden items-center gap-8 text-sm font-medium md:flex">
                        {menuItems.map((item) => (
                           <Link key={item.label} href={item.href} target={item.external ? '_blank' : '_self'} rel={item.external ? 'noopener noreferrer' : ''} className="text-muted-foreground transition-colors hover:text-primary">
                                {item.label}
                           </Link>
                        ))}
                    </nav>
                    <div className="hidden items-center gap-2 md:flex">
                        <Button variant="secondary" asChild>
                            <Link href="/careers/login">Masuk Kandidat</Link>
                        </Button>
                        <Button asChild>
                            <Link href="/careers/register">Daftar Sekarang</Link>
                        </Button>
                    </div>
                    <div className="md:hidden">
                        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                            <SheetTrigger asChild>
                                <Button variant="ghost" size="icon">
                                    <Menu />
                                </Button>
                            </SheetTrigger>
                            <SheetContent side="left" className="w-[80vw] p-0">
                                <div className="flex flex-col h-full">
                                    <div className="p-4 border-b">
                                        <Link href="/careers" className="flex items-center gap-2" onClick={() => setMobileMenuOpen(false)}>
                                            <Leaf className="h-6 w-6 text-primary" />
                                            <span className="text-lg font-bold">Environesia Karir</span>
                                        </Link>
                                    </div>
                                    <nav className="flex flex-col gap-4 p-4">
                                        {menuItems.map((item) => (
                                           <Link key={item.label} href={item.href} target={item.external ? '_blank' : '_self'} rel={item.external ? 'noopener noreferrer' : ''} className="text-lg font-medium text-foreground transition-colors hover:text-primary" onClick={() => setMobileMenuOpen(false)}>
                                                {item.label}
                                           </Link>
                                        ))}
                                    </nav>
                                    <div className="mt-auto p-4 space-y-2 border-t">
                                        <Button variant="secondary" asChild className="w-full">
                                            <Link href="/careers/login">Masuk Kandidat</Link>
                                        </Button>
                                        <Button asChild className="w-full">
                                            <Link href="/careers/register">Daftar Sekarang</Link>
                                        </Button>
                                    </div>
                                </div>
                            </SheetContent>
                        </Sheet>
                    </div>
                </div>
            </div>
        </header>
    );
};


// --- Hero Section ---
const HeroSection = () => (
    <section id="hero" className="relative w-full overflow-hidden">
        <div className="absolute inset-0">
            <Image
                src="https://images.unsplash.com/photo-1532302486494-030999a8138d?q=80&w=2940&auto=format&fit=crop"
                alt="AI generated environmental background"
                fill
                className="object-cover"
                priority
                data-ai-hint="nature abstract"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
            <div className="absolute inset-0 bg-background/60" />
        </div>
        <div className="relative z-10 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex min-h-[70vh] flex-col items-center justify-center pb-20 pt-32 text-center lg:min-h-dvh">
                <h1 className="text-4xl font-extrabold tracking-tight md:text-6xl lg:text-7xl">
                    Mari Buat Perubahan Bersama Kami
                </h1>
                <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
                    Jadilah bagian dari tim inovatif yang berdedikasi untuk menciptakan solusi lingkungan berkelanjutan. Temukan karier berdampak Anda di Environesia.
                </p>
                <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 w-full max-w-xs sm:max-w-none">
                  <Button size="lg" className="h-12 px-8 text-base w-full sm:w-auto" asChild>
                    <Link href="#lowongan">
                      Lihat Lowongan
                    </Link>
                  </Button>
                  <Button size="lg" variant="secondary" className="h-12 px-8 text-base w-full sm:w-auto">
                    Kirim Lamaran Cepat
                  </Button>
                </div>
                 <div className="mt-16 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary"/> 560+ Proyek</span>
                    <span className="flex items-center gap-2"><Globe className="h-4 w-4 text-primary"/> 38 Provinsi</span>
                    <span className="flex items-center gap-2"><BarChart className="h-4 w-4 text-primary"/> Lab & Konsultan</span>
                </div>
            </div>
        </div>
    </section>
);


// --- Job Card Component ---
const JobCard = ({ job }: { job: Job }) => (
    <Card className="flex flex-col rounded-xl shadow-md transition-all duration-300 hover:shadow-primary/20 hover:-translate-y-1.5 border-transparent hover:border-primary/30">
      <CardHeader>
        <div className="flex justify-between items-start">
            <Badge variant="secondary" className="font-medium">{job.brandName || 'Environesia'}</Badge>
            <span className="text-xs text-muted-foreground capitalize flex items-center gap-1"><Clock className="h-3 w-3" />{job.statusJob}</span>
        </div>
        <CardTitle className="pt-2 text-xl">{job.position}</CardTitle>
      </CardHeader>
      <CardContent className="flex-grow">
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" /> {job.location}</span>
          <span className="flex items-center gap-1.5"><Building className="h-4 w-4" /> {job.division}</span>
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
            <div className="flex justify-between items-start">
                <Skeleton className="h-6 w-24 rounded-full" />
                <Skeleton className="h-5 w-16" />
            </div>
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
);

// --- Job Explorer Section ---
const JobExplorerSection = () => {
    const firestore = useFirestore();
    const [searchTerm, setSearchTerm] = useState('');
    const [activeFilters, setActiveFilters] = useState<string[]>([]);
  
    const publishedJobsQuery = useMemoFirebase(
      () => query(collection(firestore, 'jobs'), where('publishStatus', '==', 'published')), 
      [firestore]
    );
  
    const { data: jobs, isLoading } = useCollection<Job>(publishedJobsQuery);
  
    const filteredJobs = useMemo(() => {
        if (!jobs) return [];
        return jobs.filter(job => {
            const matchesSearch = searchTerm === '' || job.position.toLowerCase().includes(searchTerm.toLowerCase()) || job.division.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesFilter = activeFilters.length === 0 || activeFilters.includes(job.statusJob);
            return matchesSearch && matchesFilter;
        }).sort((a, b) => (b.createdAt.toMillis() - a.createdAt.toMillis()));
    }, [jobs, searchTerm, activeFilters]);

    const toggleFilter = (filter: string) => {
        setActiveFilters(prev => prev.includes(filter) ? prev.filter(f => f !== filter) : [...prev, filter]);
    }

    const filterChips = ['fulltime', 'internship', 'contract'];

    return (
        <section id="lowongan" className="w-full scroll-mt-20 py-16 lg:py-24">
            <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-2xl text-center">
                    <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Temukan Peluang Anda</h2>
                    <p className="mt-4 text-lg text-muted-foreground">Kami mencari individu berbakat untuk bergabung dengan berbagai tim kami. Jelajahi posisi yang sesuai dengan keahlian Anda.</p>
                </div>

                <div className="mt-12 max-w-3xl mx-auto">
                    <div className="relative mb-4">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                        <Input 
                            placeholder="Cari posisi atau divisi..." 
                            className="h-12 pl-12 text-base rounded-full"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                        {filterChips.map(filter => (
                            <Button 
                                key={filter} 
                                variant={activeFilters.includes(filter) ? 'default' : 'outline'}
                                onClick={() => toggleFilter(filter)}
                                className="capitalize rounded-full"
                            >
                                {filter}
                            </Button>
                        ))}
                    </div>
                </div>

                <div className="mt-12">
                    {isLoading ? (
                        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                            <JobCardSkeleton /><JobCardSkeleton /><JobCardSkeleton />
                        </div>
                    ) : filteredJobs.length > 0 ? (
                        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                           {filteredJobs.map(job => <JobCard key={job.id} job={job} />)}
                        </div>
                    ) : (
                        <div className="text-center text-muted-foreground mt-12 rounded-lg border-2 border-dashed p-12 max-w-2xl mx-auto flex flex-col items-center">
                            <Search className="h-12 w-12 text-muted-foreground/50 mb-4" />
                            <h3 className="text-xl font-semibold text-foreground">Tidak Ada Lowongan Sesuai Filter</h3>
                            <p className="mt-2 mb-6">Coba sesuaikan kata kunci atau filter Anda, atau bergabunglah dengan talent pool kami untuk mendapatkan pemberitahuan lowongan baru.</p>
                            <Button>Join Talent Pool</Button>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}

// --- Value Props Section ---
const ValuePropsSection = () => {
    const values = [
        { title: "Karier Berdampak", description: "Bekerja pada proyek-proyek lingkungan nyata di seluruh Indonesia.", icon: Globe },
        { title: "Pertumbuhan Profesional", description: "Kami berinvestasi pada pengembangan diri Anda melalui pelatihan dan sertifikasi.", icon: BarChart },
        { title: "Kolaborasi Inovatif", description: "Bergabunglah dengan tim ahli yang solid dan saling mendukung.", icon: Users },
        { title: "Keseimbangan Hidup", description: "Kami menghargai waktu pribadi Anda untuk menciptakan lingkungan kerja yang sehat.", icon: ShieldCheck }
    ];
    return (
        <section className="w-full py-16 lg:py-24 bg-card">
            <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-2xl text-center">
                    <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Mengapa Environesia?</h2>
                    <p className="mt-4 text-lg text-muted-foreground">Kami lebih dari sekadar tempat kerja. Kami adalah komunitas yang berkomitmen untuk masa depan bumi.</p>
                </div>
                <div className="mt-16 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
                    {values.map(v => (
                        <div key={v.title} className="text-center">
                            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary mb-4">
                                <v.icon className="h-8 w-8" />
                            </div>
                            <h3 className="font-semibold text-lg">{v.title}</h3>
                            <p className="text-sm text-muted-foreground mt-1">{v.description}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

// --- Recruitment Process Section ---
const RecruitmentProcessSection = () => {
    const steps = [
        { title: 'Daftar Online', description: 'Lengkapi profil dan kirimkan lamaran Anda melalui portal karir kami.' },
        { title: 'Psikotes', description: 'Kerjakan tes psikologi untuk mengukur potensi dan kesesuaian Anda.' },
        { title: 'Seleksi Administrasi', description: 'Tim rekrutmen akan meninjau kelengkapan profil dan hasil psikotes Anda.' },
        { title: 'Wawancara', description: 'Bertemu dengan HR dan calon user untuk diskusi lebih mendalam.' },
        { title: 'Tawaran Kerja', description: 'Kandidat terpilih akan menerima tawaran kerja resmi dari kami.' },
    ];
    return (
        <section id="proses" className="w-full scroll-mt-14 py-16 lg:py-24">
            <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-xl text-center">
                    <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Proses Rekrutmen Kami</h2>
                    <p className="mt-4 text-lg text-muted-foreground">Kami merancang proses yang adil dan transparan untuk menemukan talenta terbaik.</p>
                </div>
                <div className="relative mt-16 max-w-2xl mx-auto">
                    <div className="absolute left-6 top-0 h-full w-0.5 bg-border/40 md:left-1/2 md:-translate-x-1/2" />
                    <div className="space-y-12">
                        {steps.map((step, index) => (
                            <div key={index} className="relative flex items-start gap-6 md:gap-8">
                               <div className="z-10 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground shadow-lg md:absolute md:left-1/2 md:-translate-x-1/2">
                                    {index + 1}
                                </div>
                                <div className={cn("flex-1 md:w-1/2", index % 2 === 0 ? "md:pl-[calc(50%+2.5rem)]" : "md:text-right md:pr-[calc(50%+2.5rem)] md:self-end")}>
                                     <h3 className="text-xl font-semibold">{step.title}</h3>
                                     <p className="mt-1 text-muted-foreground">{step.description}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
};


// --- Office Spotlight Section ---
const OfficeSpotlightSection = () => (
    <section className="py-16 lg:py-24">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <Card className="overflow-hidden relative flex items-end min-h-[500px] rounded-2xl">
                 <Image
                    src="https://images.unsplash.com/photo-1568992687947-868a62a9f521?q=80&w=2832&auto=format&fit=crop"
                    alt="Environesia Office Building"
                    fill
                    className="object-cover"
                    data-ai-hint="office building"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                <div className="relative z-10 p-8 text-white">
                    <h2 className="text-3xl font-bold">Basecamp Environesia</h2>
                    <p className="mt-2 max-w-lg text-white/80">Tempat ide-ide hebat lahir. Kantor pusat kami di Yogyakarta adalah pusat kolaborasi, inovasi, dan aksi nyata untuk lingkungan.</p>
                </div>
            </Card>
        </div>
    </section>
);


// --- How To Apply Section ---
const HowToApplySection = () => {
    const steps = [
        { icon: User, title: "Buat Akun", description: "Daftarkan diri Anda dengan email dan buat kata sandi." },
        { icon: Search, title: "Cari Lowongan", description: "Jelajahi berbagai posisi yang tersedia dan temukan yang cocok." },
        { icon: FileText, title: "Kirim Lamaran", description: "Unggah CV terbaru Anda dan kirimkan lamaran dengan mudah." },
        { icon: UserCheck, title: "Pantau Proses", description: "Lacak status lamaran Anda langsung dari dasbor kandidat." },
    ];
    return (
        <section className="w-full py-16 lg:py-24 bg-card">
            <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-xl text-center">
                    <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Cara Mudah Melamar</h2>
                    <p className="mt-4 text-lg text-muted-foreground">Ikuti langkah-langkah sederhana ini untuk memulai perjalanan karir Anda di Environesia.</p>
                </div>
                <div className="mt-16 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
                    {steps.map(step => (
                        <div key={step.title} className="text-center">
                            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-background shadow-md border">
                                <step.icon className="h-8 w-8 text-primary" />
                            </div>
                            <h3 className="mb-2 text-lg font-semibold">{step.title}</h3>
                            <p className="text-sm text-muted-foreground">{step.description}</p>
                        </div>
                    ))}
                </div>
                 <div className="mt-16 text-center">
                    <Button size="lg" asChild>
                        <Link href="/careers/register">Daftar Akun Sekarang <ArrowRight className="ml-2 h-4 w-4" /></Link>
                    </Button>
                </div>
            </div>
        </section>
    );
};

// --- FAQ Section ---
const FaqSection = () => (
    <section id="faq" className="w-full scroll-mt-14 py-16 lg:py-24">
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-xl text-center">
                <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Pertanyaan Umum (FAQ)</h2>
                <p className="mt-4 text-lg text-muted-foreground">Jawaban atas pertanyaan umum seputar proses lamaran kerja di Environesia.</p>
            </div>
            <Accordion type="single" collapsible className="mt-12 w-full space-y-4">
              <AccordionItem value="item-1" className="rounded-xl border bg-card px-6 shadow-sm">
                <AccordionTrigger className="py-5 text-lg">Apa saja yang harus saya siapkan sebelum melamar?</AccordionTrigger>
                <AccordionContent className="pt-2 text-base text-muted-foreground">Pastikan Anda telah menyiapkan CV (Curriculum Vitae) terbaru dalam format PDF, surat lamaran (opsional), dan portofolio jika posisi yang dilamar memerlukannya.</AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-2" className="rounded-xl border bg-card px-6 shadow-sm">
                <AccordionTrigger className="py-5 text-lg">Berapa lama proses rekrutmen biasanya berlangsung?</AccordionTrigger>
                <AccordionContent className="pt-2 text-base text-muted-foreground">Proses rekrutmen kami biasanya memakan waktu 2-4 minggu dari penutupan lowongan, namun bisa bervariasi. Kami akan memberikan informasi terbaru melalui email.</AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-3" className="rounded-xl border bg-card px-6 shadow-sm">
                <AccordionTrigger className="py-5 text-lg">Apakah saya bisa melamar lebih dari satu posisi?</AccordionTrigger>
                <AccordionContent className="pt-2 text-base text-muted-foreground">Ya, Anda dapat melamar hingga 3 posisi yang berbeda secara bersamaan. Namun, kami sarankan fokus pada posisi yang paling sesuai kualifikasi Anda.</AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-4" className="rounded-xl border bg-card px-6 shadow-sm">
                <AccordionTrigger className="py-5 text-lg">Siapa yang bisa saya hubungi jika ada pertanyaan?</AccordionTrigger>
                <AccordionContent className="pt-2 text-base text-muted-foreground">Jika Anda memiliki pertanyaan, jangan ragu untuk menghubungi tim rekrutmen kami melalui email di <a href="mailto:careers@environesia.co.id" className="text-primary hover:underline">careers@environesia.co.id</a>.</AccordionContent>
              </AccordionItem>
            </Accordion>
        </div>
    </section>
);


// --- Footer Component ---
const Footer = () => (
    <footer className="border-t bg-card">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="py-8 grid grid-cols-1 md:grid-cols-3 gap-8">
                <div>
                    <div className="flex items-center gap-2">
                        <Leaf className="h-6 w-6 text-primary" />
                        <span className="text-lg font-bold">Environesia Karir</span>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">Membangun karier, menjaga bumi.</p>
                </div>
                <div className="grid grid-cols-2 gap-8 md:col-span-2">
                    <div>
                        <h4 className="font-semibold">Navigasi</h4>
                        <ul className="mt-4 space-y-2 text-sm">
                            <li><Link href="#lowongan" className="text-muted-foreground hover:text-primary">Lowongan</Link></li>
                            <li><Link href="#proses" className="text-muted-foreground hover:text-primary">Proses</Link></li>
                            <li><Link href="#faq" className="text-muted-foreground hover:text-primary">FAQ</Link></li>
                        </ul>
                    </div>
                     <div>
                        <h4 className="font-semibold">Perusahaan</h4>
                        <ul className="mt-4 space-y-2 text-sm">
                             <li><a href="https://environesia.co.id/" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary">Company Profile</a></li>
                             <li><Link href="/admin/login" className="text-muted-foreground hover:text-primary">Akses Internal</Link></li>
                        </ul>
                    </div>
                </div>
            </div>
            <div className="py-6 border-t">
                <p className="text-sm text-center text-muted-foreground">
                    © {new Date().getFullYear()} Environesia. All Rights Reserved.
                </p>
            </div>
        </div>
    </footer>
);

// --- Main Page Component ---
export default function CareersPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-background font-body text-foreground">
      <Header />
      <main className="flex-1">
        <HeroSection />
        <JobExplorerSection />
        <ValuePropsSection />
        <RecruitmentProcessSection />
        <OfficeSpotlightSection />
        <HowToApplySection />
        <FaqSection />
      </main>
      <Footer />
    </div>
  );
}
