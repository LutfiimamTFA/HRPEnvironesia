'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown, User, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import type { JobApplication, UserProfile } from '@/lib/types';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where, limit } from 'firebase/firestore';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { getInitials } from '@/lib/utils';
import { Separator } from '../ui/separator';

export type PanelistOption = {
  value: string;
  label: string;
};

interface PanelistPickerProps {
  job?: JobApplication;
  selected: PanelistOption[];
  onChange: (selected: PanelistOption[]) => void;
  className?: string;
}

export function PanelistPicker({ job, selected, onChange, className }: PanelistPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const firestore = useFirestore();

  // Query for suggested users based on job division/department
  const suggestedUsersQuery = useMemoFirebase(() => {
    if (!job?.division) return null;
    return query(
        collection(firestore, 'users'), 
        where('department', '==', job.division),
        where('isActive', '==', true),
        limit(5)
    );
  }, [firestore, job]);
  const { data: suggestedUsers } = useCollection<UserProfile>(suggestedUsersQuery);

  // Query for users based on search term
  const searchUsersQuery = useMemoFirebase(() => {
    if (!search) return null;
    return query(
        collection(firestore, 'users'),
        where('nameLower', '>=', search.toLowerCase()),
        where('nameLower', '<=', search.toLowerCase() + '\uf8ff'),
        where('isActive', '==', true),
        limit(10)
    );
  }, [firestore, search]);
  const { data: searchedUsers } = useCollection<UserProfile>(searchUsersQuery);

  const handleSelect = (user: UserProfile) => {
    const option = { value: user.uid, label: `${user.fullName} (${user.email})` };
    const isSelected = selected.some(s => s.value === option.value);
    if (isSelected) {
      onChange(selected.filter(s => s.value !== option.value));
    } else {
      onChange([...selected, option]);
    }
  };

  const allSuggestedUsers = (suggestedUsers || []).filter(u => !selected.some(s => s.value === u.uid));
  const allSearchedUsers = (searchedUsers || []).filter(u => !selected.some(s => s.value === u.uid) && !allSuggestedUsers.some(s => s.uid === u.uid));

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
              selected.map(item => (
                <Badge
                  variant="secondary"
                  key={item.value}
                  className="mr-1 mb-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(selected.filter(s => s.value !== item.value));
                  }}
                >
                  {item.label.split('(')[0].trim()}
                  <X className="ml-1 h-3 w-3 cursor-pointer" />
                </Badge>
              ))
            ) : (
              <span className="text-muted-foreground">Pilih panelis...</span>
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
            
            {allSuggestedUsers.length > 0 && search.length < 2 && (
              <CommandGroup heading="Disarankan">
                {allSuggestedUsers.map(user => (
                  <CommandItem key={user.uid} onSelect={() => handleSelect(user)}>
                    <Check className={cn('mr-2 h-4 w-4', selected.some(s => s.value === user.uid) ? 'opacity-100' : 'opacity-0')} />
                    {user.fullName} <span className="text-xs text-muted-foreground ml-2">{`(${user.email})`}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {search.length > 1 && allSearchedUsers.length > 0 && (
                 <CommandGroup heading="Hasil Pencarian">
                    {allSearchedUsers.map(user => (
                        <CommandItem key={user.uid} onSelect={() => handleSelect(user)}>
                           <Check className={cn('mr-2 h-4 w-4', selected.some(s => s.value === user.uid) ? 'opacity-100' : 'opacity-0')} />
                           {user.fullName} <span className="text-xs text-muted-foreground ml-2">{`(${user.email})`}</span>
                        </CommandItem>
                    ))}
                </CommandGroup>
            )}

          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
