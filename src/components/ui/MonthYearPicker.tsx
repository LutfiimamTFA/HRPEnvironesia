'use client';

import { useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MONTH_LABELS_ID, formatPeriodLabel, getCurrentPeriodKey } from '@/lib/period';

const MONTH_SHORT_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

interface MonthYearPickerProps {
  /** "all" or "YYYY-MM" */
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function MonthYearPicker({ value, onChange, className }: MonthYearPickerProps) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(() => {
    const [y] = (value !== 'all' ? value : getCurrentPeriodKey()).split('-');
    return Number(y);
  });

  const [selectedYear, selectedMonthStr] = value !== 'all' ? value.split('-') : [null, null];
  const selectedMonthIndex = selectedMonthStr ? Number(selectedMonthStr) - 1 : -1;

  const pick = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={`w-full h-10 justify-between rounded-xl border-slate-200 bg-white px-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:hover:bg-slate-900 ${className || ''}`}
        >
          <span className="truncate">{formatPeriodLabel(value)}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3 space-y-3">
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={value === 'all' ? 'default' : 'outline'}
            onClick={() => pick('all')}
            className="flex-1 rounded-lg text-xs font-semibold h-8"
          >
            Semua Periode
          </Button>
          <Button
            type="button"
            size="sm"
            variant={value === getCurrentPeriodKey() ? 'default' : 'outline'}
            onClick={() => pick(getCurrentPeriodKey())}
            className="flex-1 rounded-lg text-xs font-semibold h-8"
          >
            Bulan Ini
          </Button>
        </div>

        <div className="border-t border-slate-200 dark:border-slate-800 pt-3 space-y-2">
          <div className="flex items-center justify-between">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => setYear(y => y - 1)}
              className="h-7 w-7 rounded-lg"
              aria-label="Tahun sebelumnya"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{year}</span>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => setYear(y => y + 1)}
              className="h-7 w-7 rounded-lg"
              aria-label="Tahun berikutnya"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {MONTH_SHORT_ID.map((label, i) => {
              const isSelected = Number(selectedYear) === year && selectedMonthIndex === i;
              return (
                <button
                  key={label}
                  type="button"
                  title={MONTH_LABELS_ID[i]}
                  onClick={() => pick(`${year}-${String(i + 1).padStart(2, '0')}`)}
                  className={`h-8 rounded-lg text-xs font-semibold transition-colors ${
                    isSelected
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
