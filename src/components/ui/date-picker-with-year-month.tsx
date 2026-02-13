'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface DatePickerWithYearMonthProps {
  value: Date | null | undefined;
  onChange: (date: Date | undefined) => void;
  disabled?: (date: Date) => boolean;
  className?: string;
  fromDate?: Date;
  toDate?: Date;
}

export function DatePickerWithYearMonth({ value, onChange, disabled, className, fromDate, toDate }: DatePickerWithYearMonthProps) {
  const [open, setOpen] = React.useState(false);

  const sensibleDefault = React.useMemo(() => {
    const twentyFiveYearsAgo = new Date(new Date().setFullYear(new Date().getFullYear() - 25));
    if (fromDate && fromDate > twentyFiveYearsAgo) {
      return fromDate;
    }
    return twentyFiveYearsAgo;
  }, [fromDate]);

  const [month, setMonth] = React.useState<Date>(value || sensibleDefault);

  // When value changes, update the month view
  React.useEffect(() => {
    if (value) {
      setMonth(value);
    }
  }, [value]);

  // When popover closes, if there's no value, reset the view to default
  React.useEffect(() => {
    if (!open && !value) {
      setMonth(sensibleDefault);
    }
  }, [open, value, sensibleDefault]);

  const years = React.useMemo(() => {
    const startYear = fromDate?.getFullYear() || new Date().getFullYear() - 100;
    const endYear = toDate?.getFullYear() || new Date().getFullYear();
    return Array.from({ length: endYear - startYear + 1 }, (_, i) => startYear + i).reverse();
  }, [fromDate, toDate]);

  const months = React.useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => ({
      value: i,
      label: format(new Date(2000, i), 'MMMM', { locale: id }),
    }));
  }, []);

  const handleYearChange = (year: string) => {
    const newDate = new Date(month);
    newDate.setFullYear(parseInt(year, 10));
    setMonth(newDate);
  };

  const handleMonthChange = (monthIndex: string) => {
    const newDate = new Date(month);
    newDate.setMonth(parseInt(monthIndex, 10));
    setMonth(newDate);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={'outline'}
          className={cn('w-full justify-start text-left font-normal', !value && 'text-muted-foreground', className)}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? format(value, 'PPP', { locale: id }) : <span>Pilih tanggal</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 rounded-xl border bg-popover shadow-lg" align="start" portalled={false}>
        <div className="flex justify-center gap-2 p-3 pb-2">
          <Select
            value={String(month.getMonth())}
            onValueChange={handleMonthChange}
          >
            <SelectTrigger className="w-[120px] focus:ring-0">
              <SelectValue placeholder="Bulan" />
            </SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={String(month.getFullYear())}
            onValueChange={handleYearChange}
          >
            <SelectTrigger className="w-[90px] focus:ring-0">
              <SelectValue placeholder="Tahun" />
            </SelectTrigger>
            <SelectContent>
              {years.map((year) => (
                <SelectItem key={year} value={String(year)}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Calendar
          locale={id}
          mode="single"
          month={month}
          onMonthChange={setMonth}
          selected={value ?? undefined}
          onSelect={(date) => {
            onChange(date);
            setOpen(false);
          }}
          disabled={disabled}
          fromDate={fromDate}
          toDate={toDate}
          classNames={{ caption: 'hidden' }}
        />
      </PopoverContent>
    </Popover>
  );
}
