'use client';

import { useState, useEffect } from 'react';
import { collection, doc } from 'firebase/firestore';
import { useCollection, useFirestore, useMemoFirebase, setDocumentNonBlocking } from '@/firebase';
import { UserRole, ROLES } from '@/lib/types';
import { ALL_MENU_ITEMS } from '@/lib/menu-config';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

type NavigationSettings = {
  id: string; // role name
  visibleMenuItems: string[];
}

// Get all unique menu items from the config, preserving their original icon/href data.
const allMenus = Object.values(ALL_MENU_ITEMS).flat();
const uniqueMenus = Array.from(new Map(allMenus.map(item => [item.label, item])).values())
  .sort((a, b) => a.label.localeCompare(b.label));

const rolesToDisplay = ROLES.filter(role => role !== 'super-admin' && ALL_MENU_ITEMS[role as UserRole]);

export function MenuSettingsClient() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<Record<string, string[]>>({});

  const settingsCollectionRef = useMemoFirebase(() => collection(firestore, 'navigation_settings'), [firestore]);
  const { data: initialSettings, isLoading: isLoadingSettings } = useCollection<NavigationSettings>(settingsCollectionRef);

  useEffect(() => {
    const newSettings: Record<string, string[]> = {};
    
    // Define all roles that can have settings
    const configurableRoles = ROLES.filter(r => r !== 'super-admin');

    // First, apply defaults for all configurable roles from menu-config
    configurableRoles.forEach(role => {
      newSettings[role] = ALL_MENU_ITEMS[role]?.map(item => item.label) || [];
    });

    // Then, overwrite with any settings fetched from Firestore
    if (initialSettings) {
      initialSettings.forEach(setting => {
        if (newSettings[setting.id]) { // Check if the role is a configurable one
          newSettings[setting.id] = setting.visibleMenuItems;
        }
      });
    }
    
    setSettings(newSettings);

  }, [initialSettings, isLoadingSettings]);

  const handleCheckboxChange = (role: string, menuItemLabel: string, checked: boolean) => {
    setSettings(prevSettings => {
      const currentItems = prevSettings[role] || [];
      const newItems = checked
        ? [...currentItems, menuItemLabel]
        : currentItems.filter(label => label !== menuItemLabel);
      return { ...prevSettings, [role]: newItems };
    });
  };

  const handleSave = () => {
    setLoading(true);
    
    Object.entries(settings).forEach(([role, visibleMenuItems]) => {
      if (rolesToDisplay.includes(role as UserRole)) { // Only save for configurable roles
        const docRef = doc(firestore, 'navigation_settings', role);
        setDocumentNonBlocking(docRef, { role, visibleMenuItems }, { merge: true });
      }
    });

    toast({
        title: 'Settings Saved',
        description: 'Navigation menu settings have been updated.',
    });
    setLoading(false);
  };
  
  if (isLoadingSettings) {
    return (
        <div className="space-y-4">
            <Skeleton className="h-48 w-full" />
            <div className="flex justify-end">
              <Skeleton className="h-10 w-32" />
            </div>
        </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Menu Visibility Settings</CardTitle>
           <CardDescription>
            Configure which navigation menu items are visible for each user role. A menu must be defined for a role to be assignable.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-semibold">Menu Item</TableHead>
                  {rolesToDisplay.map(role => (
                    <TableHead key={role} className="text-center font-semibold capitalize">{role.replace('-', ' ')}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {uniqueMenus.map(menuItem => (
                  <TableRow key={menuItem.label}>
                    <TableCell className="font-medium">{menuItem.label}</TableCell>
                    {rolesToDisplay.map(role => {
                      const isApplicable = ALL_MENU_ITEMS[role as UserRole]?.some(item => item.label === menuItem.label);
                      return (
                        <TableCell key={role} className="text-center">
                          <Checkbox
                            disabled={!isApplicable}
                            checked={isApplicable && (settings[role] || []).includes(menuItem.label)}
                            onCheckedChange={(checked) => handleCheckboxChange(role, menuItem.label, !!checked)}
                            id={`${role}-${menuItem.label}`}
                            aria-label={`Toggle ${menuItem.label} for ${role}`}
                          />
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Changes
        </Button>
      </div>
    </div>
  );
}
