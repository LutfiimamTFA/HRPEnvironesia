"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Users, CheckCircle, Clock, AlertCircle, TrendingUp, AlertTriangle, Zap } from "lucide-react";

interface AttendanceSummaryStats {
  total: number;
  hadir: number;
  belumTapIn: number;
  sedangBekerja: number;
  selesai: number;
  terlambat: number;
  tidakValid: number;
  perluReview: number;
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
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
      {summaryCards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <Card key={idx} className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40">
            <CardContent className="p-4">
              <div className={`${card.color} rounded-lg p-3 mb-2 w-fit`}>
                <Icon className="h-5 w-5" />
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mb-1">
                {card.label}
              </p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {card.value}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                {stats.total > 0 ? `${Math.round((card.value / stats.total) * 100)}%` : "0%"}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
