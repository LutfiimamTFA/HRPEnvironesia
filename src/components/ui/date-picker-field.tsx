'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface DatePickerFieldProps {
  value: Date | null | undefined;
  onChange: (date: Date | undefined) => void;
  disabled?: (date: Date) => boolean;
  className?: string;
  fromDate?: Date;
  toDate?: Date;
}

export function DatePickerField({ value, onChange, disabled, className, fromDate, toDate }: DatePickerFieldProps) {
  const [open, setOpen] = React.useState(false);
  const hasDropdowns = fromDate !== undefined && toDate !== undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={'outline'}
          className={cn(
            'w-full justify-start text-left font-normal',
            !value && 'text-muted-foreground',
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? format(value, 'PPP', { locale: id }) : <span>Pilih tanggal</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 rounded-xl border bg-popover shadow-lg" align="start" portalled={false}>
        <Calendar
          locale={id}
          mode="single"
          selected={value ?? undefined}
          onSelect={(date) => {
            onChange(date);
            setOpen(false);
          }}
          disabled={disabled}
          initialFocus
          captionLayout={hasDropdowns ? "dropdown-buttons" : "buttons"}
          fromDate={fromDate}
          toDate={toDate}
        />
      </PopoverContent>
    </Popover>
  );
}
