/**
 * Shared "YYYY-MM" period helpers — the single format every month/year
 * filter in the app should use instead of separate month + year dropdowns.
 */

export const MONTH_LABELS_ID = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

export function formatPeriodLabel(period?: string | null): string {
  if (!period || period === "all") return "Semua Periode";

  const [year, month] = String(period).split("-");
  const monthIndex = Number(month) - 1;

  if (!year || Number.isNaN(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    return "Semua Periode";
  }

  return `${MONTH_LABELS_ID[monthIndex]} ${year}`;
}

export function getPeriodKeyFromDate(date: Date | string | number | null | undefined): string {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}

export function getCurrentPeriodKey(): string {
  return getPeriodKeyFromDate(new Date());
}

/** Matches a request/adjustment's date against the selected "YYYY-MM" filter ("all" always matches). */
export function matchesPeriod(itemDate: Date | string | number | null | undefined, selectedPeriod: string): boolean {
  if (!selectedPeriod || selectedPeriod === "all") return true;
  return getPeriodKeyFromDate(itemDate) === selectedPeriod;
}
