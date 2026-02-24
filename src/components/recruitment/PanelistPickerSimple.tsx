'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';
import type { UserProfile, Brand } from '@/lib/types';

interface PanelistPickerSimpleProps {
  allUsers: UserProfile[];
  allBrands: Brand[];
  selectedIds: string[];
  onChange: (selectedIds: string[]) => void;
  className?: string;
}

export function PanelistPickerSimple({
  allUsers,
  allBrands,
  selectedIds,
  onChange,
  className,
}: PanelistPickerSimpleProps) {
  const [searchQuery, setSearchQuery] = React.useState('');

  const brandMap = React.useMemo(() => {
    if (!allBrands) return new Map<string, string>();
    return new Map(allBrands.map(brand => [brand.id!, brand.name]));
  }, [allBrands]);

  const usersWithDetails = React.useMemo(() => {
    return allUsers.map(user => {
      let brandDisplay = user.department || user.jobTitle || user.role;
      if (user.role === 'hrd' && Array.isArray(user.brandId)) {
        brandDisplay = user.brandId.map(id => brandMap.get(id)).filter(Boolean).join(', ') || 'All Brands';
      } else if (typeof user.brandId === 'string' && user.brandId) {
        brandDisplay = brandMap.get(user.brandId) || brandDisplay;
      }
      return {
        ...user,
        brandDisplay,
      };
    });
  }, [allUsers, brandMap]);

  const filteredUsers = React.useMemo(() => {
    if (!searchQuery) return usersWithDetails;
    const lowercasedQuery = searchQuery.toLowerCase();
    return usersWithDetails.filter(user =>
      user.fullName.toLowerCase().includes(lowercasedQuery) ||
      user.email.toLowerCase().includes(lowercasedQuery)
    );
  }, [searchQuery, usersWithDetails]);

  const selectedUsers = React.useMemo(() => {
    return selectedIds.map(id => usersWithDetails.find(user => user.uid === id)).filter(Boolean) as (typeof usersWithDetails[0])[];
  }, [selectedIds, usersWithDetails]);


  const handleToggle = (userId: string) => {
    const newSelectedIds = selectedIds.includes(userId)
      ? selectedIds.filter(id => id !== userId)
      : [...selectedIds, userId];
    onChange(newSelectedIds);
  };

  return (
    <div className={cn('space-y-3 rounded-md border p-3', className)}>
      {/* Selected Chips */}
      <div className="flex flex-wrap gap-2">
        {selectedUsers.length > 0 ? selectedUsers.map(user => (
          <Badge key={user.uid} variant="secondary">
            {user.fullName}
            <button
              type="button"
              aria-label={`Remove ${user.fullName}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleToggle(user.uid)}
              className="ml-1 rounded-full outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
            </button>
          </Badge>
        )) : <p className="text-xs text-muted-foreground">Pilih satu atau lebih panelis.</p>}
      </div>

      {/* Search Input */}
      <Input
        placeholder="Cari nama atau email..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      {/* User List */}
      <ScrollArea className="h-48">
        <div className="space-y-1 pr-2">
          {filteredUsers.map(user => {
            const isSelected = selectedIds.includes(user.uid);
            return (
              <div
                key={user.uid}
                role="button"
                tabIndex={0}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => user.isActive && handleToggle(user.uid)}
                onKeyDown={(e) => {
                    if (user.isActive && (e.key === ' ' || e.key === 'Enter')) {
                        e.preventDefault();
                        handleToggle(user.uid);
                    }
                }}
                className={cn(
                  "flex items-center gap-3 p-2 rounded-md",
                  user.isActive ? "cursor-pointer hover:bg-accent" : "opacity-50 cursor-not-allowed"
                )}
                aria-disabled={!user.isActive}
              >
                <Checkbox
                  checked={isSelected}
                  aria-label={`Select ${user.fullName}`}
                  className="pointer-events-none"
                />
                 <Avatar className="h-8 w-8">
                    <AvatarImage src={user.photoUrl} alt={user.fullName} />
                    <AvatarFallback>{getInitials(user.fullName)}</AvatarFallback>
                </Avatar>
                <div className="flex-grow">
                  <p className="font-medium text-sm">{user.fullName}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </div>
                <Badge variant="outline" className="text-xs">{user.brandDisplay}</Badge>
              </div>
            );
          })}
          {filteredUsers.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-4">Pengguna tidak ditemukan.</p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
