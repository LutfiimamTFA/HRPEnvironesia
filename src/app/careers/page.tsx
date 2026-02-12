'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Briefcase, Building2, Check, ChevronDown, FileText, Leaf, MapPin, Search, User, UserCheck } from 'lucide-react';

const JobCard = ({ title, type, location, brand }: { title: string, type: string, location: string, brand: string }) => (
  <Card>
    <CardHeader>
      <CardTitle className="text-lg">{title}</CardTitle>
      <CardDescription className="flex items-center gap-4 pt-1">
        <span className="flex items-center gap-1.5"><Briefcase className="h-4 w-4" /> {type}</span>
        <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" /> {location}</span>
      </CardDescription>
    </CardHeader>
    <CardFooter className="flex justify-between">
      <Badge variant="secondary">{brand}</Badge>
      <Button variant="default">
        Lamar Sekarang <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </CardFooter>
  </Card>
);

const StepCard = ({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) => (
    <div className="flex flex-col items-center text-center p-4">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
            {icon}
        </div>
        <h3 className="mb-2 text-lg font-semibold">{title}</h3>
        <p className="text-muted-foreground">{description}</p>
    </div>
);

export default function CareersPage() {
  const handleScroll = () => {
    const lowonganSection = document.getElementById('lowongan');
    if (lowonganSection) {
      lowonganSection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background font-body">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between">
          <Link href="/careers" className="flex items-center gap-2">
            <Leaf className="h-7 w-7 text-primary" />
            <span className="text-xl font-bold tracking-tight text-foreground">Environesia Karir</span>
          </Link>
          <nav className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/careers/login">Masuk Kandidat</Link>
            </Button>
            <Button asChild>
              <Link href="/careers/register">Daftar</Link>
            </Button>
             <Button variant="ghost" asChild>
              <Link href="/login">Masuk Karyawan</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section id="hero" className="relative h-[60vh] w-full">
            <Image
                src="https://picsum.photos/seed/career-hero/1800/1200"
                alt="Tim Environesia"
                fill
                className="object-cover"
                data-ai-hint="office team collaboration"
            />
            <div className="absolute inset-0 bg-black/50" />
            <div className="relative z-10 flex h-full flex-col items-center justify-center text-center text-white p-4">
                <h1 className="text-4xl md:text-6xl font-bold tracking-tighter !leading-tight">
                    Bangun Masa Depan Anda Bersama Kami
                </h1>
                <p className="mt-4 max-w-2xl text-lg text-primary-foreground/80">
                    Jadilah bagian dari tim inovatif yang berdedikasi untuk menciptakan solusi berkelanjutan. Temukan peran Anda di Environesia.
                </p>
                <Button size="lg" className="mt-8" onClick={handleScroll}>
                    Lihat Lowongan <ChevronDown className="ml-2 h-5 w-5" />
                </Button>
            </div>
        </section>

        {/* Lowongan Section */}
        <section id="lowongan" className="w-full py-12 md:py-20 lg:py-24 bg-secondary">
          <div className="container">
            <div className="mx-auto max-w-xl text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Lowongan Tersedia</h2>
              <p className="mt-4 text-muted-foreground">
                Filter berdasarkan tipe pekerjaan atau brand yang Anda minati.
              </p>
            </div>

            <Tabs defaultValue="fulltime" className="mt-8">
              <div className="flex justify-center">
                <TabsList>
                  <TabsTrigger value="fulltime">Full-time</TabsTrigger>
                  <TabsTrigger value="internship">Internship</TabsTrigger>
                  <TabsTrigger value="contract">Contract</TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="fulltime" className="mt-8 space-y-4">
                <JobCard title="Sustainability Consultant" type="Full-time" location="Yogyakarta" brand="Environesia" />
                <JobCard title="Frontend Developer" type="Full-time" location="Jakarta" brand="Tech Innovate" />
              </TabsContent>
              <TabsContent value="internship" className="mt-8 space-y-4">
                 <JobCard title="Marketing Intern" type="Internship" location="Surabaya" brand="Creative Labs" />
                 <JobCard title="HR Intern" type="Internship" location="Yogyakarta" brand="Environesia" />
              </TabsContent>
              <TabsContent value="contract" className="mt-8 space-y-4">
                <JobCard title="Project Manager (6 Bulan)" type="Contract" location="Bandung" brand="Build-It" />
              </TabsContent>
            </Tabs>
          </div>
        </section>
        
        {/* Tahapan Rekrutmen Section */}
        <section className="w-full py-12 md:py-20 lg:py-24">
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
                            { step: 2, title: 'Seleksi CV', desc: 'Tim rekrutmen kami akan meninjau setiap lamaran yang masuk.' },
                            { step: 3, title: 'Psikotes', desc: 'Tes psikologi untuk mengukur potensi dan kesesuaian Anda.' },
                            { step: 4, title: 'Wawancara', desc: 'Bertemu dengan HR dan calon user untuk diskusi lebih mendalam.' },
                            { step: 5, title: 'Tawaran Kerja', desc: 'Kandidat terpilih akan menerima tawaran kerja resmi.' },
                        ].map((item, index) => (
                            <div key={item.step} className={`flex items-center gap-6 ${index % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'}`}>
                                <div className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold">{item.step}</div>
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
        <section id="tutorial" className="w-full py-12 md:py-20 lg:py-24 bg-secondary">
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

      </main>

      <footer className="border-t py-6">
        <div className="container text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} Environesia. All Rights Reserved.
        </div>
      </footer>
    </div>
  );
}
