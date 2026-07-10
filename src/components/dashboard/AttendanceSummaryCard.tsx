"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Users, CheckCircle, Clock, AlertCircle, TrendingUp, AlertTriangle, Zap, HeartPulse, ShieldCheck } from "lucide-react";

interface AttendanceSummaryStats {
  total: number;
  hadir: number;
  belumTapIn: number;
  sedangBekerja: number;
  selesai: number;
  terlambat: number;
  tidakValid: number;
  perluReview: number;
  kondisiKhusus?: number;
  validOtomatis?: number;
}

interface AttendanceSummaryCardProps {
  stats: AttendanceSummaryStats;
}

export function AttendanceSummaryCard({ stats }: AttendanceSummaryCardProps) {
  const summaryCards = [
    {
      label: "Total Web Absen",
      value: stats.total,
      icon: Users,
      color: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
    },
    {
      label: "Hadir",
      value: stats.hadir,
      icon: CheckCircle,
      color: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300",
    },
    {
      label: "Belum Tap In",
      value: stats.belumTapIn,
      icon: Clock,
      color: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300",
    },
    {
      label: "Sedang Bekerja",
      value: stats.sedangBekerja,
      icon: TrendingUp,
      color: "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300",
    },
    {
      label: "Selesai",
      value: stats.selesai,
      icon: CheckCircle,
      color: "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300",
    },
    {
      label: "Terlambat",
      value: stats.terlambat,
      icon: AlertTriangle,
      color: "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300",
    },
    {
      label: "Perlu Review",
      value: stats.perluReview,
      icon: AlertCircle,
      color: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300",
    },
    {
      label: "Kondisi Khusus",
      value: stats.kondisiKhusus ?? 0,
      icon: HeartPulse,
      color: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300",
    },
    {
      label: "Valid Otomatis",
      value: stats.validOtomatis ?? 0,
      icon: ShieldCheck,
      color: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300",
    },
  ];

  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}
    >
      {summaryCards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <Card key={idx} className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40">
            <CardContent className="p-3.5 h-[90px] flex items-center gap-3">
              <div className={`${card.color} rounded-lg p-2.5 shrink-0`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-slate-600 dark:text-slate-400 font-medium leading-tight truncate">
                  {card.label}
                </p>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <p className="text-2xl font-bold text-slate-900 dark:text-white leading-none">
                    {card.value}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-500">
                    {stats.total > 0 ? `${Math.round((card.value / stats.total) * 100)}%` : "0%"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
