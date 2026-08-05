'use client';

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RotateCcw, Search } from "lucide-react";
import type { Brand } from '@/lib/types';
import type { FilterState } from "./HrdDashboardTypes";
import { GoogleDatePicker } from "@/components/ui/google-date-picker";

interface GlobalFilterBarProps {
  brands: Brand[];
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  /** HRD with exactly one allowed brand — pin the filter, show a static label instead of a dropdown (mirrors Monitoring Absensi). */
  singleBrand?: Brand | null;
  isSuperAdmin?: boolean;
  isLoadingBrands?: boolean;
}

export function GlobalFilterBar({ brands, filters, setFilters, singleBrand, isSuperAdmin, isLoadingBrands }: GlobalFilterBarProps) {

  const handleDateChange = (date: Date | null) => {
    if (date) setFilters(prev => ({ ...prev, date }));
  };

  const handleBrandChange = (brandId: string) => {
    setFilters(prev => ({ ...prev, brandId: brandId === 'all' ? undefined : brandId }));
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters(prev => ({ ...prev, searchTerm: e.target.value }));
  };

  const toggleNeedsAction = (checked: boolean) => {
    setFilters(prev => ({ ...prev, needsActionOnly: checked }));
  };

  const handleReset = () => {
    setFilters({ date: new Date(), brandId: undefined, siteId: undefined, employmentType: undefined, searchTerm: '', needsActionOnly: false });
  };

  const selectTriggerClass = "w-full sm:w-[220px] bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400";
  const allBrandsLabel = isSuperAdmin ? 'Semua Brand' : 'Semua Brand Saya';

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-white dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 p-3">
      <div>
        <Label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1">Tanggal</Label>
        <GoogleDatePicker value={filters.date} onChange={handleDateChange} className="w-full sm:w-auto" />
      </div>

      <div>
        <Label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1">Perusahaan / Brand</Label>
        {singleBrand ? (
          <div className="h-9 flex items-center px-2.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 text-sm font-medium text-slate-700 dark:text-slate-200">
            {singleBrand.name}
          </div>
        ) : (
          <Select value={filters.brandId || 'all'} onValueChange={handleBrandChange} disabled={isLoadingBrands}>
            <SelectTrigger className={selectTriggerClass}>
              <SelectValue placeholder={allBrandsLabel} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{allBrandsLabel}</SelectItem>
              {brands.map(brand => (
                <SelectItem key={brand.id!} value={brand.id!}>{brand.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="relative flex-grow min-w-[200px]">
        <Label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1">Cari</Label>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400 dark:text-slate-500" />
          <Input
            placeholder="Cari nama / ID karyawan..."
            value={filters.searchTerm}
            onChange={handleSearchChange}
            className="pl-8 bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
          />
        </div>
      </div>

      <div className="flex items-center space-x-2 self-end pb-0.5">
        <Switch id="needs-action-toggle" checked={filters.needsActionOnly} onCheckedChange={toggleNeedsAction} />
        <Label htmlFor="needs-action-toggle" className="text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
          Butuh Aksi
        </Label>
      </div>

      <Button
        onClick={handleReset}
        variant="ghost"
        size="sm"
        className="self-end text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <RotateCcw className="mr-2 h-4 w-4" />
        Reset
      </Button>
    </div>
  );
}
