"use client";

import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function HrdScopeEmptyState({
  message = "Akses perusahaan belum diatur. Hubungi Super Admin.",
}: {
  message?: string;
}) {
  return (
    <Alert className="border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Akses HRD Belum Diatur</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
