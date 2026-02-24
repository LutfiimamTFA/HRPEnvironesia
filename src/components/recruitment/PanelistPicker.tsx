'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown, X } from 'lucide-react';
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
import { ScrollArea } from '../ui/scroll-area';

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
  const [search, setSearch] = React.useState('');

  const handleToggle = (option: PanelistOption) => {
    const isSelected = selected.some((s) => s.value === option.value);
    if (isSelected) {
      onChange(selected.filter((s) => s.value !== option.value));
    } else {
      onChange([...selected, option]);
    }
  };

  const filteredUsers = React.useMemo(() => {
    if (!search) return allUsers;
    const lowercasedSearch = search.toLowerCase();
    return allUsers.filter(user =>
      user.fullName.toLowerCase().includes(lowercasedSearch) ||
      user.email.toLowerCase().includes(lowercasedSearch)
    );
  }, [allUsers, search]);

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
                    onChange(selected.filter((s) => s.value !== item.value));
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
          <CommandInput placeholder="Cari nama atau email..." value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>Tidak ada pengguna ditemukan.</CommandEmpty>
            <ScrollArea className="h-48">
              <CommandGroup>
                {filteredUsers.map(user => {
                  const option = { value: user.uid, label: `${user.fullName} (${user.email})` };
                  return (
                    <CommandItem
                      key={user.uid}
                      onSelect={() => handleToggle(option)}
                      disabled={!user.isActive}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          selected.some(s => s.value === user.uid)
                            ? 'opacity-100'
                            : 'opacity-0'
                        )}
                      />
                      {user.fullName} <span className="text-xs text-muted-foreground ml-2">{`(${user.email})`}</span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </ScrollArea>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
