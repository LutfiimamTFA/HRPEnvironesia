"use client";

import * as React from "react";
import { useState, useEffect, useCallback } from "react";
import { collection, doc, setDoc, serverTimestamp } from "firebase/firestore";
import {
  useCollection,
  useFirestore,
  useMemoFirebase,
} from "@/firebase";
import {
  ALL_MENU_GROUPS,
  MENU_CONFIG,
  normalizeMenuVisibilityKeys,
} from "@/lib/menu-config";
import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, AlertCircle, CheckCircle2, Lock, RotateCcw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

type NavigationSettings = {
  id: string;
  visibleMenuItems: string[];
  updatedAt?: any;
  updatedByUid?: string;
  updatedByName?: string;
  menuSettingsVersion?: number;
};

type DisplayRole = {
  id: string;
  label: string;
};

const rolesToDisplay: DisplayRole[] = [
  { id: "super-admin", label: "Super Admin" },
  { id: "hrd", label: "HRD" },
  { id: "manager", label: "Manager" },
  { id: "karyawan", label: "Karyawan (Penuh Waktu)" },
  { id: "karyawan-magang", label: "Karyawan (Magang)" },
  { id: "karyawan-training", label: "Karyawan (Training)" },
  { id: "kandidat", label: "Kandidat" },
];

// Keys that must always be checked for Super Admin — cannot be unchecked
const SUPER_ADMIN_REQUIRED_KEYS = new Set([
  "admin.users",
  "admin.structure",
  "admin.master",
  "admin.access",
  "admin.session-security",
  "admin.audit-log",
]);

const CURRENT_MENU_SETTINGS_VERSION = 1;

function getDefaultMenuKeys(roleId: string): string[] {
  const groups = MENU_CONFIG[roleId] || [];
  return groups.flatMap((g) => g.items.map((i) => i.key));
}

function enforceRequiredMenuKeys(roleId: string, keys: string[]) {
  if (roleId !== "super-admin") return normalizeMenuVisibilityKeys(keys);
  return normalizeMenuVisibilityKeys([
    ...keys,
    ...Array.from(SUPER_ADMIN_REQUIRED_KEYS),
  ]);
}

function formatTimestamp(ts: any): string | null {
  if (!ts) return null;
  try {
    const d = typeof ts.toDate === "function" ? ts.toDate() : new Date(ts);
    return d.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return null;
  }
}

export function MenuSettingsClient() {
  const firestore = useFirestore();
  const { firebaseUser, userProfile } = useAuth();
  const { toast } = useToast();

  const [settings, setSettings] = useState<Record<string, string[]>>({});
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [dirtyRoles, setDirtyRoles] = useState<Set<string>>(new Set());
  const [savedMeta, setSavedMeta] = useState<{
    updatedAt: any;
    updatedByName: string | null;
    isDefault: boolean;
  } | null>(null);

  const settingsCollectionRef = useMemoFirebase(
    () => collection(firestore, "navigation_settings"),
    [firestore],
  );
  const { data: firestoreSettings, isLoading: isLoadingSettings } =
    useCollection<NavigationSettings>(settingsCollectionRef);

  useEffect(() => {
    if (isLoadingSettings || isInitialized) return;

    const newSettings: Record<string, string[]> = {};
    let anyDocExists = false;
    let latestUpdatedAt: any = null;
    let latestUpdatedByName: string | null = null;

    rolesToDisplay.forEach((role) => {
      const saved = firestoreSettings?.find((s) => s.id === role.id);
      if (saved) {
        anyDocExists = true;
        newSettings[role.id] = enforceRequiredMenuKeys(
          role.id,
          saved.visibleMenuItems,
        );

        const ts = saved.updatedAt?.seconds ?? 0;
        if (saved.updatedAt && ts > (latestUpdatedAt?.seconds ?? 0)) {
          latestUpdatedAt = saved.updatedAt;
          latestUpdatedByName = saved.updatedByName ?? null;
        }
      } else {
        newSettings[role.id] = enforceRequiredMenuKeys(
          role.id,
          getDefaultMenuKeys(role.id),
        );
      }
    });

    setSavedMeta({
      updatedAt: latestUpdatedAt,
      updatedByName: latestUpdatedByName,
      isDefault: !anyDocExists,
    });
    setSettings(newSettings);
    setHasUnsaved(false);
    setDirtyRoles(new Set());
    setIsInitialized(true);
  }, [firestoreSettings, isLoadingSettings, isInitialized]);

  const handleCheckboxChange = useCallback(
    (roleId: string, menuItemKey: string, checked: boolean) => {
      if (roleId === "super-admin" && !checked && SUPER_ADMIN_REQUIRED_KEYS.has(menuItemKey)) {
        toast({
          variant: "destructive",
          title: "Menu wajib aktif",
          description: "Menu ini harus selalu aktif untuk Super Admin demi keamanan sistem.",
        });
        return;
      }
      setSettings((prev) => {
        const current = prev[roleId] || [];
        const updated = checked
          ? [...current, menuItemKey]
          : current.filter((k) => k !== menuItemKey);
        return { ...prev, [roleId]: normalizeMenuVisibilityKeys(updated) };
      });
      setDirtyRoles((prev) => {
        const next = new Set(prev);
        next.add(roleId);
        return next;
      });
      setHasUnsaved(true);
    },
    [toast],
  );

  const handleResetRoleToDefault = useCallback((roleId: string) => {
    setSettings((prev) => ({
      ...prev,
      [roleId]: enforceRequiredMenuKeys(roleId, getDefaultMenuKeys(roleId)),
    }));
    setDirtyRoles((prev) => {
      const next = new Set(prev);
      next.add(roleId);
      return next;
    });
    setHasUnsaved(true);
    toast({
      title: "Role direset ke default",
      description: "Klik Save Changes untuk menyimpan default role ini.",
    });
  }, [toast]);

  const handleSave = useCallback(async () => {
    if (!firebaseUser) {
      toast({ variant: "destructive", title: "Tidak terautentikasi", description: "Silakan login ulang." });
      return;
    }

    setIsSaving(true);
    const actorName = userProfile?.fullName || firebaseUser.email || firebaseUser.uid;
    const now = serverTimestamp();

    try {
      const rolesToSave = Array.from(dirtyRoles);
      if (rolesToSave.length === 0) {
        setHasUnsaved(false);
        setIsSaving(false);
        return;
      }

      const promises = rolesToSave.map((roleId) => {
        const normalized = enforceRequiredMenuKeys(roleId, settings[roleId] || []);
        const docRef = doc(firestore, "navigation_settings", roleId);
        return setDoc(
          docRef,
          {
            role: roleId,
            visibleMenuItems: normalized,
            menuSettingsVersion: CURRENT_MENU_SETTINGS_VERSION,
            updatedAt: now,
            updatedByUid: firebaseUser.uid,
            updatedByName: actorName,
          },
          { merge: true },
        );
      });

      await Promise.all(promises);

      setSettings((prev) => {
        const next = { ...prev };
        for (const roleId of rolesToSave) {
          next[roleId] = enforceRequiredMenuKeys(roleId, next[roleId] || []);
        }
        return next;
      });
      setSavedMeta({
        updatedAt: { toDate: () => new Date() },
        updatedByName: actorName,
        isDefault: false,
      });
      setDirtyRoles(new Set());
      setHasUnsaved(false);

      toast({
        title: "Pengaturan disimpan",
        description: `Visibilitas menu berhasil diperbarui untuk ${rolesToSave.length} role.`,
      });
    } catch (err: any) {
      console.error("MenuSettings save error:", err);
      const isPermission = err?.code === "permission-denied";
      toast({
        variant: "destructive",
        title: isPermission ? "Akses ditolak" : "Gagal menyimpan",
        description: isPermission
          ? "Anda tidak memiliki izin untuk mengubah pengaturan menu."
          : `Terjadi kesalahan: ${err?.message ?? "Unknown error"}`,
      });
    } finally {
      setIsSaving(false);
    }
  }, [settings, dirtyRoles, firebaseUser, userProfile, firestore, toast]);

  if (!isInitialized) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-96 w-full" />
        <div className="flex justify-end">
          <Skeleton className="h-10 w-32" />
        </div>
      </div>
    );
  }

  const savedAtText = savedMeta?.updatedAt ? formatTimestamp(savedMeta.updatedAt) : null;

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Status indicator */}
        {hasUnsaved ? (
          <div className="flex items-center gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>Ada perubahan yang belum disimpan</span>
          </div>
        ) : savedMeta?.isDefault ? (
          <div className="flex items-center gap-2 rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-800">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>Belum ada konfigurasi tersimpan — menggunakan default</span>
          </div>
        ) : savedAtText ? (
          <div className="flex items-center gap-2 rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>
              Konfigurasi terakhir disimpan pada <strong>{savedAtText}</strong>
              {savedMeta?.updatedByName && (
                <> oleh <strong>{savedMeta.updatedByName}</strong></>
              )}
            </span>
          </div>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Access & Roles — Menu Visibility</CardTitle>
            <CardDescription>
              Atur menu mana yang terlihat untuk setiap role. Perubahan disimpan permanen ke Firestore.
              Menu bertanda <Lock className="inline h-3 w-3 mx-0.5 text-muted-foreground" /> wajib aktif untuk Super Admin.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-semibold min-w-[180px]">Menu Item</TableHead>
                    {rolesToDisplay.map((role) => (
                      <TableHead
                        key={role.id}
                        className="text-center font-semibold capitalize min-w-[100px]"
                      >
                        <div className="flex flex-col items-center gap-1.5">
                          <span>{role.label}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[11px] text-slate-500 hover:text-slate-800"
                            onClick={() => handleResetRoleToDefault(role.id)}
                          >
                            <RotateCcw className="mr-1 h-3 w-3" />
                            Reset Role Ini ke Default
                          </Button>
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ALL_MENU_GROUPS.map((group, groupIndex) => (
                    <React.Fragment key={group.title || `group-${groupIndex}`}>
                      {group.title && (
                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                          <TableCell
                            colSpan={rolesToDisplay.length + 1}
                            className="py-2 px-4"
                          >
                            <h4 className="font-semibold text-sm">{group.title}</h4>
                          </TableCell>
                        </TableRow>
                      )}
                      {group.items.map((menuItem) => {
                        const isRequiredForSuperAdmin = SUPER_ADMIN_REQUIRED_KEYS.has(menuItem.key);
                        return (
                          <TableRow key={menuItem.key}>
                            <TableCell className="pl-8 font-medium">
                              <span className="flex items-center gap-1.5">
                                {menuItem.label}
                                {isRequiredForSuperAdmin && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Lock className="h-3 w-3 text-muted-foreground cursor-help shrink-0" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Menu wajib aktif untuk Super Admin</p>
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </span>
                            </TableCell>
                            {rolesToDisplay.map((role) => {
                              const isVisible = (settings[role.id] || []).includes(menuItem.key);
                              const isLocked = role.id === "super-admin" && isRequiredForSuperAdmin;

                              return (
                                <TableCell
                                  key={`${role.id}-${menuItem.key}`}
                                  className="text-center"
                                >
                                  {isLocked ? (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="inline-flex items-center justify-center">
                                          <Checkbox
                                            checked={true}
                                            disabled
                                            className="opacity-60 cursor-not-allowed data-[state=checked]:bg-teal-600 data-[state=checked]:border-teal-600"
                                            aria-label={`${menuItem.label} wajib aktif untuk ${role.label}`}
                                          />
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>Menu wajib aktif untuk Super Admin</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  ) : (
                                    <Checkbox
                                      checked={isVisible}
                                      onCheckedChange={(checked) =>
                                        handleCheckboxChange(role.id, menuItem.key, !!checked)
                                      }
                                      id={`${role.id}-${menuItem.key}`}
                                      aria-label={`Toggle ${menuItem.label} for ${role.label}`}
                                    />
                                  )}
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between">
          <div>
            {hasUnsaved && (
              <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">
                Perubahan belum disimpan
              </Badge>
            )}
          </div>
          <Button
            onClick={handleSave}
            disabled={isSaving || !hasUnsaved}
            className="bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {isSaving ? "Menyimpan..." : "Save Changes"}
          </Button>
        </div>
      </div>
    </TooltipProvider>
  );
}
