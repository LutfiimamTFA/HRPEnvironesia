'use client';

import * as React from 'react';
import { Check, X, ChevronsUpDown } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import type { UserProfile } from '@/lib/types';

export type PanelistOption = {
  value: string;
  label: string;
};

interface PanelistPickerProps {
  allUsers: UserProfile[];
  selected: PanelistOption[];
  onChange: (selected: PanelistOption[]) => void;
  className?: string;
  placeholder?: string;
}

export function PanelistPicker({
  allUsers,
  selected,
  onChange,
  className,
  placeholder = 'Pilih panelis...',
}: PanelistPickerProps) {
  const [open, setOpen] = React.useState(false);

  const handleUnselect = (item: PanelistOption) => {
    onChange(selected.filter((s) => s.value !== item.value));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('w-full justify-between h-auto min-h-10', className)}
        >
          <div className="flex gap-1 flex-wrap">
            {selected.length > 0 ? (
              selected.map((item) => (
                <Badge
                  variant="secondary"
                  key={item.value}
                  className="mr-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleUnselect(item);
                  }}
                >
                  {item.label.split('(')[0].trim()}
                  <X className="ml-1 h-3 w-3 cursor-pointer" />
                </Badge>
              ))
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </div>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput placeholder="Cari nama atau email..." />
          <CommandList>
            <CommandEmpty>Tidak ada pengguna ditemukan.</CommandEmpty>
            <CommandGroup>
              {allUsers
                .filter((u) => u.isActive)
                .map((user) => {
                  const option = {
                    value: user.uid,
                    label: `${user.fullName} (${user.email})`,
                  };
                  const isSelected = selected.some(
                    (s) => s.value === user.uid
                  );
                  return (
                    <CommandItem
                      key={user.uid}
                      onSelect={() => {
                        if (isSelected) {
                          onChange(
                            selected.filter((s) => s.value !== user.uid)
                          );
                        } else {
                          onChange([...selected, option]);
                        }
                      }}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          isSelected ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      {option.label}
                    </CommandItem>
                  );
                })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
