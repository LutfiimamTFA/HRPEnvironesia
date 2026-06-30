'use client';

import { AdminLoginForm } from '@/components/auth/AdminLoginForm';
import { useAuth } from '@/providers/auth-provider';
import { Loader2, Users, Clock, FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Image from 'next/image';

export default function AdminLoginPage() {
  const { userProfile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && userProfile && userProfile.role !== 'kandidat') {
      router.replace('/admin');
    }
  }, [userProfile, loading, router]);

  if (loading || (userProfile && userProfile.role !== 'kandidat')) {
    return (
      <div className="flex min-h-[100dvh] w-full items-center justify-center bg-white dark:bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
      </div>
    );
  }

  return (
    // Root: min-h-[100dvh] + overflow-y-auto — conten bisa scroll jika layar pendek
    <div className="relative min-h-[100dvh] w-full overflow-y-auto bg-slate-50 dark:bg-[#10141b]">

      {/* Background glow — pointer-events-none agar tidak ganggu scroll */}
      <div className="pointer-events-none fixed -left-40 top-32 h-96 w-96 rounded-full bg-teal-500/15 blur-3xl" />
      <div className="pointer-events-none fixed -right-40 bottom-32 h-96 w-96 rounded-full bg-teal-500/10 blur-3xl" />

      {/* ===== DESKTOP LAYOUT (lg+) ===== */}
      <div className="hidden lg:flex flex-col min-h-[100dvh]">

        {/* LOGO — padding alih-alih persentase tinggi */}
        <div className="relative flex w-full flex-shrink-0 items-center justify-center py-8 xl:py-10">
          <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 flex justify-center">
            <div
              className="rounded-full bg-gradient-to-b from-teal-500/40 via-teal-500/20 to-transparent blur-3xl"
              style={{ width: '800px', height: '280px' }}
            />
          </div>
          <Image
            src="/images/hrp-logo.svg"
            alt="HRP Environesia Logo"
            width={700}
            height={280}
            className="h-auto w-[min(600px,75vw)] xl:w-[680px] object-contain drop-shadow-2xl"
            priority
          />
        </div>

        {/* TWO-COLUMN CONTENT — flex-1 isi sisa ruang, tidak overflow */}
        <div className="flex flex-1 justify-center px-6 pb-10">

          {/* LEFT PANEL — Branding */}
          <div className="flex w-1/2 flex-col items-center border-r border-slate-200 px-6 pb-8 pt-2 dark:border-slate-800/50 dark:bg-transparent bg-white">
            <div className="w-full max-w-[480px] space-y-5">

              {/* Company name & description */}
              <div className="space-y-3 text-center">
                <div>
                  <h1 className="text-4xl xl:text-5xl font-black tracking-tight text-slate-900 dark:text-white">
                    HRP
                  </h1>
                  <p className="mt-1 text-sm font-bold uppercase tracking-[0.5em] text-teal-600 dark:text-teal-400">
                    Environesia
                  </p>
                </div>
                <div className="space-y-2 pt-1">
                  <h2 className="text-xl xl:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                    Human Resource Portal
                  </h2>
                  <p className="text-xs xl:text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                    Kelola kehadiran, izin, cuti, dinas, dan data karyawan dalam
                    satu portal internal yang terintegrasi.
                  </p>
                </div>
              </div>

              {/* Feature list */}
              <div className="space-y-3 border-t border-slate-200 dark:border-slate-800/50 pt-4 text-center">
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-slate-600 dark:text-slate-500">
                  Fitur Utama
                </p>
                <div className="space-y-1.5">
                  {[
                    { icon: Users,    title: 'Data Karyawan', desc: 'Kelola profil dan informasi.' },
                    { icon: Clock,    title: 'Izin & Cuti',   desc: 'Pengajuan dan persetujuan.' },
                    { icon: FileText, title: 'Monitoring',    desc: 'Laporan real-time akurat.' },
                  ].map(({ icon: Icon, title, desc }) => (
                    <div
                      key={title}
                      className="flex flex-col items-center gap-0.5 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1.5 dark:border-teal-500/20 dark:bg-teal-500/5"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-md border border-teal-300 bg-teal-100 dark:border-teal-500/25 dark:bg-teal-500/10">
                        <Icon className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
                      </div>
                      <p className="text-xs font-semibold text-slate-900 dark:text-white">{title}</p>
                      <p className="text-xs text-slate-600 dark:text-slate-500">{desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT PANEL — Login form */}
          <div className="flex w-1/2 flex-col items-center px-6 pb-8 pt-2">
            <div className="w-full max-w-[480px]">
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-200/50 backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/70 dark:shadow-2xl dark:shadow-black/40">
                <div className="border-b border-slate-200 bg-slate-50 px-8 py-5 dark:border-slate-800/50 dark:bg-transparent">
                  <p className="mb-2 text-xs font-bold uppercase tracking-[0.3em] text-teal-600 dark:text-teal-400">
                    Login Portal
                  </p>
                  <h3 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                    Masuk ke HRP
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                    Gunakan akun dari HRD atau Admin untuk mengakses portal.
                  </p>
                </div>
                <div className="px-8 py-6">
                  <AdminLoginForm />
                </div>
              </div>
              <p className="mt-3 text-center text-xs text-slate-500 dark:text-slate-600">
                © Environesia Group — HRP Internal System
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ===== MOBILE / TABLET LAYOUT (< lg) ===== */}
      <div className="flex lg:hidden flex-col">

        {/* LOGO */}
        <div className="relative flex w-full flex-shrink-0 items-center justify-center py-6">
          <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 flex justify-center">
            <div
              className="rounded-full bg-gradient-to-b from-teal-500/35 to-transparent blur-2xl"
              style={{ width: '400px', height: '160px' }}
            />
          </div>
          <Image
            src="/images/hrp-logo.svg"
            alt="HRP Environesia Logo"
            width={320}
            height={128}
            className="h-auto w-[min(288px,72vw)] object-contain drop-shadow-lg"
            priority
          />
        </div>

        {/* CONTENT */}
        <div className="flex flex-col items-center px-4 pb-10 sm:px-6">

          {/* Company info */}
          <div className="mb-5 w-full max-w-md space-y-1.5 text-center">
            <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white">
              HRP
            </h1>
            <p className="text-sm font-bold uppercase tracking-[0.45em] text-teal-600 dark:text-teal-400">
              Environesia
            </p>
            <h2 className="pt-1 text-xl font-bold text-slate-900 dark:text-white">
              Human Resource Portal
            </h2>
            <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              Kelola kehadiran, izin, cuti, dinas, dan data karyawan dalam satu portal terintegrasi.
            </p>
          </div>

          {/* Login card */}
          <div className="w-full max-w-md">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-200/40 backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/70 dark:shadow-xl dark:shadow-black/30">
              <div className="border-b border-slate-200 bg-slate-50 px-6 py-5 dark:border-slate-800/50 dark:bg-transparent">
                <p className="mb-1 text-xs font-bold uppercase tracking-[0.3em] text-teal-600 dark:text-teal-400">
                  Login
                </p>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                  Masuk ke HRP
                </h3>
              </div>
              <div className="px-6 py-5">
                <AdminLoginForm />
              </div>
            </div>

            {/* Footer */}
            <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-600">
              © Environesia Group — HRP Internal System
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
