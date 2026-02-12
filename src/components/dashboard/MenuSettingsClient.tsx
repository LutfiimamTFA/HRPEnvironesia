'use client';

import { useState, useEffect } from 'react';
import { collection, doc } from 'firebase/firestore';
import { useCollection, useFirestore, useMemoFirebase, setDocumentNonBlocking } from '@/firebase';
import { UserRole, ROLES } from '@/lib/types';
import { ALL_MENU_ITEMS, MenuItem } from '@/lib/menu-config';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

type NavigationSettings = {
  id: string; // role name
  visibleMenuItems: string[];
}

export function MenuSettingsClient() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<Record<string, string[]>>({});

  const settingsCollectionRef = useMemoFirebase(() => collection(firestore, 'navigation_settings'), [firestore]);
  const { data: initialSettings, isLoading: isLoadingSettings } = useCollection<NavigationSettings>(settingsCollectionRef);

  useEffect(() => {
    if (initialSettings) {
      const newSettings: Record<string, string[]> = {};
      // Populate from fetched settings
      initialSettings.forEach(setting => {
        newSettings[setting.id] = setting.visibleMenuItems;
      });

      // Populate default settings for roles that don't have one yet
      Object.keys(ALL_MENU_ITEMS).forEach(role => {
        if (!newSettings[role]) {
          newSettings[role] = ALL_MENU_ITEMS[role].map(item => item.label);
        }
      });
      
      setSettings(newSettings);
    } else if (!isLoadingSettings) {
        // If there are no settings in firestore at all, create default ones
        const defaultSettings: Record<string, string[]> = {};
        Object.keys(ALL_MENU_ITEMS).forEach(role => {
            defaultSettings[role] = ALL_MENU_ITEMS[role].map(item => item.label);
        });
        setSettings(defaultSettings);
    }
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
      const docRef = doc(firestore, 'navigation_settings', role);
      setDocumentNonBlocking(docRef, { role, visibleMenuItems }, { merge: true });
    });

    toast({
        title: 'Settings Saved',
        description: 'Navigation menu settings have been updated.',
    });
    setLoading(false);
  };
  
  const rolesToDisplay = ROLES.filter(role => role !== 'super-admin' && ALL_MENU_ITEMS[role]);

  if (isLoadingSettings) {
    return (
        <div className="space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
        </div>
    );
  }

  return (
    <div className="space-y-6">
      <CardDescription>
        Configure which navigation menu items are visible for each user role. Unchecked items will be hidden from the sidebar for that role.
      </CardDescription>
      <Accordion type="multiple" className="w-full space-y-4" defaultValue={rolesToDisplay.map(role => `role-${role}`)}>
        {rolesToDisplay.map(role => (
          <AccordionItem value={`role-${role}`} key={role} className="border rounded-lg bg-card">
             <AccordionTrigger className="px-6 py-4 hover:no-underline capitalize">
                {role.replace('-', ' ')}
             </AccordionTrigger>
             <AccordionContent className="px-6 pt-2 pb-6 border-t">
                <div className="grid gap-4">
                    {ALL_MENU_ITEMS[role]?.map(menuItem => (
                        <div key={menuItem.label} className="flex items-center space-x-2">
                        <Checkbox
                            id={`${role}-${menuItem.label}`}
                            checked={(settings[role] || []).includes(menuItem.label)}
                            onCheckedChange={(checked) => handleCheckboxChange(role, menuItem.label, !!checked)}
                        />
                        <label
                            htmlFor={`${role}-${menuItem.label}`}
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                            {menuItem.label}
                        </label>
                        </div>
                    ))}
                </div>
             </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Changes
        </Button>
      </div>
    </div>
  );
}
