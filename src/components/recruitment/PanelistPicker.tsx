'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Check, X, ChevronsUpDown } from 'lucide-react';
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
import type { UserProfile, Brand } from '@/lib/types';
import { ScrollArea } from '../ui/scroll-area';

export type PanelistOption = {
  value: string;
  label: string;
};

interface PanelistPickerProps {
  allUsers: UserProfile[];
  allBrands: Brand[];
  selected: PanelistOption[];
  onChange: (selected: PanelistOption[]) => void;
  className?: string;
  placeholder?: string;
}

export function PanelistPicker({
  allUsers,
  allBrands,
  selected,
  onChange,
  className,
  placeholder = 'Pilih panelis...',
}: PanelistPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');

  const brandMap = React.useMemo(() => {
    if (!allBrands) return new Map<string, string>();
    return new Map(allBrands.map(brand => [brand.id!, brand.name]));
  }, [allBrands]);

  const getBrandDisplay = (user: UserProfile) => {
    if (user.role === 'hrd' && Array.isArray(user.brandId)) {
        return user.brandId.map(id => brandMap.get(id)).filter(Boolean).join(', ') || 'All Brands';
    }
    if (typeof user.brandId === 'string' && user.brandId) {
        return brandMap.get(user.brandId);
    }
    return user.department || user.jobTitle || user.role;
  }

  const userOptions = React.useMemo(() => {
    return allUsers.filter(u => u.isActive).map(user => ({
      ...user,
      brandDisplay: getBrandDisplay(user)
    }))
  }, [allUsers, brandMap]);


  const filteredUsers = React.useMemo(() => {
    if (!query) return userOptions;
    const lowercasedQuery = query.toLowerCase();
    return userOptions.filter(user =>
      user.fullName.toLowerCase().includes(lowercasedQuery) ||
      user.email.toLowerCase().includes(lowercasedQuery) ||
      (user.brandDisplay && user.brandDisplay.toLowerCase().includes(lowercasedQuery))
    );
  }, [query, userOptions]);

  const handleToggle = (user: UserProfile) => {
    const newOption = { value: user.uid, label: `${user.fullName} (${user.email})` };
    const isSelected = selected.some(s => s.value === newOption.value);
    if (isSelected) {
      onChange(selected.filter((s) => s.value !== newOption.value));
    } else {
      onChange([...selected, newOption]);
    }
  };

  const handleUnselect = (itemValue: string) => {
    onChange(selected.filter((s) => s.value !== itemValue));
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
                  className="mr-1 flex items-center"
                >
                  {item.label.split('(')[0].trim()}
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`Remove ${item.label}`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        handleUnselect(item.value);
                      }
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleUnselect(item.value);
                    }}
                    className="ml-1 rounded-full outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer"
                  >
                    <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                  </span>
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
          <CommandInput 
            placeholder="Cari nama, email, atau brand..."
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <ScrollArea className="h-64">
                <CommandEmpty>Tidak ada pengguna ditemukan.</CommandEmpty>
                <CommandGroup>
                {filteredUsers.map((user) => {
                    const isSelected = selected.some(s => s.value === user.uid);
                    return (
                        <CommandItem
                            key={user.uid}
                            onSelect={() => handleToggle(user)}
                        >
                            <Check
                                className={cn(
                                'mr-2 h-4 w-4',
                                isSelected ? 'opacity-100' : 'opacity-0'
                                )}
                            />
                            <div className="flex flex-col">
                                <span className="text-sm">{user.fullName}</span>
                                <span className="text-xs text-muted-foreground">{user.email} - {user.brandDisplay}</span>
                            </div>
                        </CommandItem>
                    );
                    })}
                </CommandGroup>
            </ScrollArea>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
