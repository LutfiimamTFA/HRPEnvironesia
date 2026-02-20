'use client';

import React, { useMemo, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight, FileText, Leaf, Search, User, UserCheck, ShieldCheck, BarChart, Globe, Menu, X, Users } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/navigation';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import imagePlaceholders from '@/lib/placeholder-images.json';
import { JobExplorerSkeleton } from '@/components/careers/JobExplorer';

const JobExplorerClient = dynamic(() => 
  import('@/components/careers/JobExplorer').then((mod) => mod.JobExplorerClient), 
  {
    ssr: false,
    loading: () => <JobExplorerSkeleton />,
  }
);


// --- Header Component ---
const Header = () => {
    const t = useTranslations('CareersLanding.Header');
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
        { href: '#lowongan', label: t('jobs') },
        { href: '#proses', label: t('process') },
        { href: '#faq', label: t('faq') },
        { href: 'https://environesia.co.id/', label: t('companyProfile'), external: true },
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
                           <a key={item.label} href={item.href} target={item.external ? '_blank' : '_self'} rel={item.external ? 'noopener noreferrer' : ''} className="text-muted-foreground transition-colors hover:text-primary">
                                {item.label}
                           </a>
                        ))}
                    </nav>
                    <div className="hidden items-center gap-2 md:flex">
                        <LanguageSwitcher />
                        <Button variant="secondary" asChild>
                            <Link href="/careers/login">{t('signIn')}</Link>
                        </Button>
                        <Button asChild>
                            <Link href="/careers/register">{t('signUp')}</Link>
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
                                           <a key={item.label} href={item.href} target={item.external ? '_blank' : '_self'} rel={item.external ? 'noopener noreferrer' : ''} className="text-lg font-medium text-foreground transition-colors hover:text-primary" onClick={() => setMobileMenuOpen(false)}>
                                                {item.label}
                                           </a>
                                        ))}
                                    </nav>
                                    <div className="mt-auto p-4 space-y-2 border-t">
                                        <LanguageSwitcher />
                                        <Button variant="secondary" asChild className="w-full">
                                            <Link href="/careers/login">{t('signIn')}</Link>
                                        </Button>
                                        <Button asChild className="w-full">
                                            <Link href="/careers/register">{t('signUp')}</Link>
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
const HeroSection = () => {
    const t = useTranslations('CareersLanding.Hero');
    return (
        <section id="hero" className="relative w-full overflow-hidden bg-background">
            <div className="absolute inset-0">
                <Image
                    src={imagePlaceholders.careers_hero.src}
                    alt={imagePlaceholders.careers_hero.alt}
                    data-ai-hint={imagePlaceholders.careers_hero.ai_hint}
                    fill
                    priority
                    className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
                <div className="absolute inset-0 bg-background/50" />
            </div>
            <div className="relative z-10 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="flex min-h-[70vh] flex-col items-center justify-center pb-20 pt-32 text-center lg:min-h-dvh">
                    <h1 className="text-4xl font-extrabold tracking-tight text-white md:text-6xl lg:text-7xl">
                        {t('title')}
                    </h1>
                    <p className="mt-6 max-w-2xl text-lg text-slate-300">
                        {t('subtitle')}
                    </p>
                    <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 w-full max-w-xs sm:max-w-none">
                      <Button size="lg" className="h-12 px-8 text-base w-full sm:w-auto" asChild>
                        <a href="#lowongan">{t('ctaPrimary')}</a>
                      </Button>
                      <Button size="lg" variant="secondary" className="h-12 px-8 text-base w-full sm:w-auto" asChild>
                        <Link href="/careers/login">{t('ctaSecondary')}</Link>
                      </Button>
                    </div>
                     <div className="mt-16 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-sm text-slate-400">
                        <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary"/> {t('badgeProjects')}</span>
                        <span className="flex items-center gap-2"><Globe className="h-4 w-4 text-primary"/> {t('badgeProvinces')}</span>
                        <span className="flex items-center gap-2"><BarChart className="h-4 w-4 text-primary"/> {t('badgeServices')}</span>
                    </div>
                </div>
            </div>
        </section>
    );
}

// --- Job Explorer Section ---
const JobExplorerSection = () => {
    const t = useTranslations('CareersLanding.JobExplorer');
    
    return (
        <section id="lowongan" className="w-full scroll-mt-20 py-16 lg:py-24">
            <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-2xl text-center">
                    <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{t('title')}</h2>
                    <p className="mt-4 text-lg text-muted-foreground">{t('subtitle')}</p>
                </div>
                <JobExplorerClient />
            </div>
        </section>
    );
}

// --- Value Props Section ---
const ValuePropsSection = () => {
    const t = useTranslations('CareersLanding.ValueProps');
    const values = t.raw('values' as any) as {title: string; description: string}[];
    const icons = [Globe, BarChart, Users, ShieldCheck];
    return (
        <section className="w-full py-16 lg:py-24 bg-card">
            <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-2xl text-center">
                    <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{t('title')}</h2>
                    <p className="mt-4 text-lg text-muted-foreground">{t('subtitle')}</p>
                </div>
                <div className="mt-16 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
                    {values.map((v, i) => (
                        <div key={v.title} className="text-center">
                            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary mb-4">
                                {React.createElement(icons[i], { className: "h-8 w-8" })}
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
    const t = useTranslations('CareersLanding.RecruitmentProcess');
    const steps = t.raw('steps' as any) as {title: string; description: string}[];

    return (
        <section id="proses" className="w-full scroll-mt-14 py-16 lg:py-24">
            <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-xl text-center">
                    <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{t('title')}</h2>
                    <p className="mt-4 text-lg text-muted-foreground">{t('subtitle')}</p>
                </div>
                <div className="relative mt-16 max-w-2xl mx-auto">
                    <div className="absolute left-6 top-0 h-full w-0.5 bg-border/40 md:left-1/2 md:-translate-x-1/2" />
                    <div className="space-y-12">
                        {steps.map((step, index) => (
                            <div key={index} className="relative flex items-start gap-6 md:gap-8">
                               <div className="z-10 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground shadow-lg md:absolute md:left-1/2 md:-translate-x-1/2">
                                    {index + 1}
                                </div>
                                <div className={cn("flex-1", index % 2 === 0 ? "md:pl-[calc(50%+2.5rem)]" : "md:text-right md:pr-[calc(50%+2.5rem)]")}>
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
const OfficeSpotlightSection = () => {
    const t = useTranslations('CareersLanding.OfficeSpotlight');
    return (
    <section className="w-full py-16 lg:py-24 bg-card">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <Card className="overflow-hidden relative flex items-end min-h-[500px] rounded-2xl shadow-lg">
                 <Image
                    src={imagePlaceholders.careers_office_spotlight.src}
                    alt={imagePlaceholders.careers_office_spotlight.alt}
                    data-ai-hint={imagePlaceholders.careers_office_spotlight.ai_hint}
                    fill
                    className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                <div className="relative z-10 p-8 md:p-12 text-white">
                    <h2 className="text-3xl md:text-4xl font-bold">{t('title')}</h2>
                    <p className="mt-2 max-w-lg text-white/80">{t('subtitle')}</p>
                </div>
            </Card>
        </div>
    </section>
)};


// --- How To Apply Section ---
const HowToApplySection = () => {
    const t = useTranslations('CareersLanding.HowToApply');
    const steps = t.raw('steps' as any) as {title: string; description: string}[];
    const icons = [User, Search, FileText, UserCheck];
    return (
        <section className="w-full py-16 lg:py-24">
            <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-xl text-center">
                    <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{t('title')}</h2>
                    <p className="mt-4 text-lg text-muted-foreground">{t('subtitle')}</p>
                </div>
                <div className="mt-16 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
                    {steps.map((step, i) => (
                        <div key={step.title} className="text-center">
                            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-background shadow-md border">
                                {React.createElement(icons[i], { className: "h-8 w-8 text-primary" })}
                            </div>
                            <h3 className="mb-2 text-lg font-semibold">{step.title}</h3>
                            <p className="text-sm text-muted-foreground">{step.description}</p>
                        </div>
                    ))}
                </div>
                 <div className="mt-16 text-center">
                    <Button size="lg" asChild>
                        <Link href="/careers/register">{t('cta')} <ArrowRight className="ml-2 h-4 w-4" /></Link>
                    </Button>
                </div>
            </div>
        </section>
    );
};

// --- FAQ Section ---
const FaqSection = () => {
    const t = useTranslations('CareersLanding.FAQ');
    const questions = t.raw('questions' as any) as {q: string; a: string}[];
    return (
    <section id="faq" className="w-full scroll-mt-14 py-16 lg:py-24 bg-card">
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-xl text-center">
                <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{t('title')}</h2>
                <p className="mt-4 text-lg text-muted-foreground">{t('subtitle')}</p>
            </div>
            <Accordion type="single" collapsible className="mt-12 w-full space-y-4">
                {questions.map((item, i) => (
                    <AccordionItem key={i} value={`item-${i}`} className="rounded-xl border bg-background px-6 shadow-sm">
                        <AccordionTrigger className="py-5 text-lg text-left">{item.q}</AccordionTrigger>
                        <AccordionContent className="pt-2 text-base text-muted-foreground">{item.a}</AccordionContent>
                    </AccordionItem>
                ))}
            </Accordion>
        </div>
    </section>
)};


// --- Footer Component ---
const Footer = () => {
    const t = useTranslations('CareersLanding.Footer');
    return (
    <footer className="border-t">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="py-8 grid grid-cols-1 md:grid-cols-3 gap-8">
                <div>
                    <div className="flex items-center gap-2">
                        <Leaf className="h-6 w-6 text-primary" />
                        <span className="text-lg font-bold">Environesia Karir</span>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{t('tagline')}</p>
                </div>
                <div className="grid grid-cols-2 gap-8 md:col-span-2">
                    <div>
                        <h4 className="font-semibold">{t('navigation')}</h4>
                        <ul className="mt-4 space-y-2 text-sm">
                            <li><a href="#lowongan" className="text-muted-foreground hover:text-primary">{useTranslations('CareersLanding.Header')('jobs')}</a></li>
                            <li><a href="#proses" className="text-muted-foreground hover:text-primary">{useTranslations('CareersLanding.Header')('process')}</a></li>
                            <li><a href="#faq" className="text-muted-foreground hover:text-primary">{useTranslations('CareersLanding.Header')('faq')}</a></li>
                        </ul>
                    </div>
                     <div>
                        <h4 className="font-semibold">{t('company')}</h4>
                        <ul className="mt-4 space-y-2 text-sm">
                             <li><a href="https://environesia.co.id/" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary">{useTranslations('CareersLanding.Header')('companyProfile')}</a></li>
                             <li><Link href="/admin/login" className="text-muted-foreground hover:text-primary">{t('internalAccess')}</Link></li>
                        </ul>
                    </div>
                </div>
            </div>
            <div className="py-6 border-t">
                <p className="text-sm text-center text-muted-foreground">
                    {t('copyright', {year: new Date().getFullYear()})}
                </p>
            </div>
        </div>
    </footer>
)};

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