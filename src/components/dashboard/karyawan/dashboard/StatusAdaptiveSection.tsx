import { GraduationCap, ClipboardCheck, FileSignature, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EmploymentStageKey } from "@/lib/employee-dashboard-stage";

function formatRupiah(value: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

function SectionShell({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof GraduationCap;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-slate-100 dark:border-slate-800 shadow-sm">
      <CardHeader className="border-b pb-4 flex flex-row items-center gap-2.5">
        <Icon className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
        <CardTitle className="text-sm font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-5">{children}</CardContent>
    </Card>
  );
}

function InternshipGuideCard() {
  return (
    <SectionShell icon={GraduationCap} title="Panduan Magang">
      <ul className="space-y-2.5 text-sm text-slate-600 dark:text-slate-300">
        <li className="flex gap-2.5">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
          Fokus pada kedisiplinan absensi — tap in dan tap out setiap hari kerja.
        </li>
        <li className="flex gap-2.5">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
          Ajukan izin lebih awal jika berhalangan hadir agar pembimbing dapat menyesuaikan jadwal.
        </li>
        <li className="flex gap-2.5">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
          Selalu koordinasikan progres dan kendala dengan pembimbing/HRD.
        </li>
      </ul>
      <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-900/50 dark:text-slate-400">
        Cuti tahunan belum tersedia untuk status Magang.
      </p>
    </SectionShell>
  );
}

function ProbationEvaluationCard({
  periodLabel,
}: {
  periodLabel: string | null;
}) {
  return (
    <SectionShell icon={ClipboardCheck} title="Status Evaluasi Probation">
      <div className="flex items-center gap-3">
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black uppercase tracking-wider text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
          Dalam Masa Evaluasi
        </span>
      </div>
      <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
        {periodLabel
          ? `Periode probation: ${periodLabel}.`
          : "Periode probation Anda belum diatur oleh HRD."}{" "}
        Evaluasi dilakukan oleh atasan langsung dan HRD menjelang akhir periode.
      </p>
      <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-900/50 dark:text-slate-400">
        Cuti tahunan menyesuaikan hasil evaluasi dan kebijakan status kepegawaian Anda.
      </p>
    </SectionShell>
  );
}

function ContractActiveCard({
  startLabel,
  endLabel,
  contractType,
}: {
  startLabel: string;
  endLabel: string;
  contractType: string;
}) {
  return (
    <SectionShell icon={FileSignature} title="Kontrak Aktif">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Mulai Kontrak</p>
          <p className="mt-0.5 text-sm font-bold text-slate-800 dark:text-slate-100">{startLabel}</p>
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Akhir Kontrak</p>
          <p className="mt-0.5 text-sm font-bold text-slate-800 dark:text-slate-100">{endLabel}</p>
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Jenis Kontrak</p>
          <p className="mt-0.5 text-sm font-bold text-slate-800 dark:text-slate-100">{contractType}</p>
        </div>
      </div>
    </SectionShell>
  );
}

function BenefitSummaryCard({
  gajiPokok,
  tunjanganTetap,
  thr,
}: {
  gajiPokok?: number;
  tunjanganTetap?: number;
  thr?: number;
}) {
  return (
    <SectionShell icon={Wallet} title="Ringkasan Benefit">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {!!gajiPokok && (
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Gaji Pokok</p>
            <p className="mt-0.5 text-sm font-bold text-slate-800 dark:text-slate-100">{formatRupiah(gajiPokok)}</p>
          </div>
        )}
        {!!tunjanganTetap && (
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tunjangan Tetap</p>
            <p className="mt-0.5 text-sm font-bold text-slate-800 dark:text-slate-100">
              {formatRupiah(tunjanganTetap)}
            </p>
          </div>
        )}
        {!!thr && (
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">THR</p>
            <p className="mt-0.5 text-sm font-bold text-slate-800 dark:text-slate-100">{formatRupiah(thr)}</p>
          </div>
        )}
      </div>
      <p className="mt-3 text-[11px] text-slate-400">
        Rincian lengkap payroll dikelola oleh HRD.
      </p>
    </SectionShell>
  );
}

export type StatusAdaptiveSectionProps = {
  stage: EmploymentStageKey;
  probationPeriodLabel: string | null;
  contractStartLabel: string;
  contractEndLabel: string;
  contractTypeLabel: string;
  benefit: { gajiPokok?: number; tunjanganTetap?: number; thr?: number } | null;
};

export function StatusAdaptiveSection({
  stage,
  probationPeriodLabel,
  contractStartLabel,
  contractEndLabel,
  contractTypeLabel,
  benefit,
}: StatusAdaptiveSectionProps) {
  if (stage === "magang") return <InternshipGuideCard />;
  if (stage === "probation") return <ProbationEvaluationCard periodLabel={probationPeriodLabel} />;
  if (stage === "kontrak") {
    return (
      <ContractActiveCard startLabel={contractStartLabel} endLabel={contractEndLabel} contractType={contractTypeLabel} />
    );
  }
  if (stage === "tetap") {
    if (!benefit || (!benefit.gajiPokok && !benefit.tunjanganTetap && !benefit.thr)) return null;
    return <BenefitSummaryCard {...benefit} />;
  }
  return null;
}
