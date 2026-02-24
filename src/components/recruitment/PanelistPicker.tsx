'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  const [searchQuery, setSearchQuery] = React.useState('');

  const handleToggle = (option: PanelistOption) => {
    console.log("clicked panelist", option.value);
    const isSelected = selected.some((s) => s.value === option.value);
    if (isSelected) {
      onChange(selected.filter((s) => s.value !== option.value));
    } else {
      onChange([...selected, option]);
    }
  };

  const filteredUsers = React.useMemo(() => {
    if (!searchQuery) return allUsers.filter(u => u.isActive);
    const lowercasedQuery = searchQuery.toLowerCase();
    return allUsers.filter(user =>
      user.isActive &&
      (user.fullName.toLowerCase().includes(lowercasedQuery) ||
      user.email.toLowerCase().includes(lowercasedQuery))
    );
  }, [allUsers, searchQuery]);

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
        <div className="p-2 border-b">
           <Input
            placeholder="Cari nama atau email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9"
          />
        </div>
        <ScrollArea className="h-60">
            {filteredUsers.length > 0 ? (
                 <div className="p-1">
                    {filteredUsers.map(user => {
                        const option = { value: user.uid, label: `${user.fullName} (${user.email})` };
                        const isSelected = selected.some((s) => s.value === option.value);
                        return (
                            <button
                                type="button"
                                key={user.uid}
                                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                onClick={() => handleToggle(option)}
                                className={cn(
                                    "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 px-2 text-sm outline-none hover:bg-accent",
                                    "aria-selected:bg-accent aria-selected:text-accent-foreground",
                                    "data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                                )}
                                disabled={!user.isActive}
                            >
                                <Check
                                    className={cn(
                                    'mr-2 h-4 w-4',
                                    isSelected ? 'opacity-100' : 'opacity-0'
                                    )}
                                />
                                {user.fullName} <span className="text-xs text-muted-foreground ml-2">{`(${user.email})`}</span>
                            </button>
                        )
                    })}
                </div>
            ) : (
                <p className="py-6 text-center text-sm">Tidak ada pengguna ditemukan.</p>
            )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
