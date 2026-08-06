'use client';

import { useEffect, useLayoutEffect, useState, useMemo, useRef } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Save, LocateFixed, Search, MapPin, Plus, Trash2, AlertTriangle, Split } from 'lucide-react';
import type { AttendanceSite, Brand, WorkScheduleDay } from '@/lib/types';
import { useFirestore, setDocumentNonBlocking } from '@/firebase';
import { doc, serverTimestamp, Timestamp, collection, writeBatch } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/providers/auth-provider';
import { useHrdScopeContext } from '@/providers/hrd-scope-provider';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '../ui/switch';
import { Checkbox } from '../ui/checkbox';
import { Slider } from '../ui/slider';
import { Badge } from '../ui/badge';
import { getWorkScheduleLines, formatDaysRangeLabel } from '@/lib/attendance-helpers';

/** Coerces a possibly-string/undefined/NaN Firestore field into a finite number, never silently falling through to `fallback` when a real (if oddly-typed) value is already present. */
function toFiniteNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icon not showing in Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png').default.src,
  iconUrl: require('leaflet/dist/images/marker-icon.png').default.src,
  shadowUrl: require('leaflet/dist/images/marker-shadow.png').default.src,
});

const ALL_DAYS: { value: WorkScheduleDay; label: string }[] = [
  { value: 'monday', label: 'Senin' },
  { value: 'tuesday', label: 'Selasa' },
  { value: 'wednesday', label: 'Rabu' },
  { value: 'thursday', label: 'Kamis' },
  { value: 'friday', label: 'Jumat' },
  { value: 'saturday', label: 'Sabtu' },
  { value: 'sunday', label: 'Minggu' },
];
const MON_FRI: WorkScheduleDay[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
const MON_SAT: WorkScheduleDay[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const TIME_REGEX = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;

const workScheduleGroupSchema = z.object({
  days: z.array(z.string()).min(1, 'Pilih minimal satu hari.'),
  startTime: z.string().regex(TIME_REGEX, 'Format HH:MM.'),
  endTime: z.string().regex(TIME_REGEX, 'Format HH:MM.'),
  breakStart: z.string().regex(TIME_REGEX, 'Format HH:MM.').or(z.literal('')).optional(),
  breakEnd: z.string().regex(TIME_REGEX, 'Format HH:MM.').or(z.literal('')).optional(),
});

const formSchema = z.object({
  name: z.string().min(3, 'Nama site minimal 3 karakter.'),
  brandIds: z.array(z.string()).min(1, 'Minimal pilih satu brand.'),
  isActive: z.boolean().default(true),
  office: z.object({
    lat: z.coerce.number().min(-90, 'Latitude tidak valid.').max(90, 'Latitude tidak valid.'),
    lng: z.coerce.number().min(-180, 'Longitude tidak valid.').max(180, 'Longitude tidak valid.'),
  }),
  checkInRadiusMeters: z.coerce.number().int().min(10, 'Radius minimal 10 meter.').max(500, 'Radius maksimal 500 meter.'),
  checkOutRadiusMeters: z.coerce.number().int().min(10, 'Radius minimal 10 meter.').max(500, 'Radius maksimal 500 meter.'),
  useSameRadiusForCheckOut: z.boolean().default(true),
  validAddressKeywords: z.string().optional(),
  locationValidationMode: z.enum(['radius_only', 'address_only', 'radius_and_address', 'hybrid']).default('hybrid'),
  activeDays: z.array(z.string()).min(1, 'Pilih minimal satu hari aktif.'),
  workSchedules: z.array(workScheduleGroupSchema).min(1, 'Minimal satu jadwal kerja.'),
  lateToleranceMinutes: z.coerce.number().int().min(0, 'Tidak boleh negatif.'),
  earliestCheckIn: z.string().regex(TIME_REGEX, 'Format HH:MM.'),
  latestCheckInWithoutReview: z.string().regex(TIME_REGEX, 'Format HH:MM.'),
  minimumWorkMinutes: z.coerce.number().int().min(0, 'Tidak boleh negatif.'),
});

type FormValues = z.infer<typeof formSchema>;

interface AttendanceSiteFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  site: AttendanceSite | null;
  brands: Brand[];
  /** Every site this HRD can currently see (AttendanceSettingsClient's visibleSites) — used only for the duplicate-active-site-per-brand check below, never fetched independently here. */
  sites: AttendanceSite[];
  /** Closes this dialog and opens a fresh blank "create" dialog instead — offered as an escape hatch when the site being edited has brands outside this HRD's scope and can't be saved. */
  onCreateNewInstead?: () => void;
  /** Called after a create/update actually commits — lets the parent refetch attendance_sites (its useHrdScopedCollection query has no realtime listener) so the new/edited site shows up immediately instead of only after a manual reload. */
  onSaved?: () => void;
}

const DEFAULT_SCHEDULE_GROUP = { days: [...MON_FRI], startTime: '08:00', endTime: '17:00', breakStart: '12:00', breakEnd: '13:00' };

function buildDefaultValues(site: AttendanceSite | null): FormValues {
  if (!site) {
    return {
      name: '',
      brandIds: [],
      isActive: true,
      office: { lat: -7.7956, lng: 110.3695 },
      checkInRadiusMeters: 20,
      checkOutRadiusMeters: 20,
      useSameRadiusForCheckOut: true,
      validAddressKeywords: '',
      locationValidationMode: 'hybrid',
      activeDays: [...MON_FRI],
      workSchedules: [DEFAULT_SCHEDULE_GROUP],
      lateToleranceMinutes: 15,
      earliestCheckIn: '06:00',
      latestCheckInWithoutReview: '09:00',
      minimumWorkMinutes: 480,
    };
  }

  const brandIds = Array.isArray(site.brandIds) ? site.brandIds : (site.brandId ? [site.brandId] : []);
  // Number(...) guards against a legacy doc storing these as strings (e.g.
  // "35" instead of 35) — Number("35") is still 35, so this never changes
  // behavior for already-numeric fields, it only stops a string-typed value
  // from breaking downstream consumers (the radius Slider in particular)
  // that expect an actual number.
  const checkInRadius = toFiniteNumber(site.checkInRadiusMeters ?? site.radiusM, 20);
  const checkOutRadius = toFiniteNumber(site.checkOutRadiusMeters ?? site.radiusM, 20);
  const activeDays = site.activeDays && site.activeDays.length > 0
    ? site.activeDays
    : (site.workDays?.map((code) => ({ Mon: 'monday', Tue: 'tuesday', Wed: 'wednesday', Thu: 'thursday', Fri: 'friday', Sat: 'saturday', Sun: 'sunday' } as Record<string, WorkScheduleDay>)[code]).filter(Boolean) as WorkScheduleDay[] ?? [...MON_FRI]);
  const workSchedules = site.workSchedules && site.workSchedules.length > 0
    ? site.workSchedules
    : [{
        days: activeDays,
        startTime: site.shift?.startTime || '08:00',
        endTime: site.shift?.endTime || '17:00',
        breakStart: site.breakStart || '',
        breakEnd: site.breakEnd || '',
      }];

  return {
    name: site.name || '',
    brandIds,
    isActive: site.isActive ?? true,
    office: { lat: site.office?.lat ?? -7.7956, lng: site.office?.lng ?? 110.3695 },
    checkInRadiusMeters: checkInRadius,
    checkOutRadiusMeters: checkOutRadius,
    useSameRadiusForCheckOut: site.useSameRadiusForCheckOut ?? (checkInRadius === checkOutRadius),
    validAddressKeywords: (site.validAddressKeywords || []).join(', '),
    locationValidationMode: site.locationValidationMode || 'hybrid',
    activeDays,
    workSchedules: workSchedules as any,
    lateToleranceMinutes: toFiniteNumber(site.lateToleranceMinutes ?? site.shift?.graceLateMinutes, 15),
    earliestCheckIn: site.earliestCheckIn || '06:00',
    latestCheckInWithoutReview: site.latestCheckInWithoutReview || '09:00',
    minimumWorkMinutes: toFiniteNumber(site.minimumWorkMinutes, 480),
  };
}

export function AttendanceSiteFormDialog({ open, onOpenChange, site, brands, sites, onCreateNewInstead, onSaved }: AttendanceSiteFormDialogProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const { userProfile } = useAuth();
  const { isSuperAdmin, isAllCompanies, allowedBrandIds } = useHrdScopeContext();
  const [isSaving, setIsSaving] = useState(false);
  const [isFetchingLocation, setIsFetchingLocation] = useState(false);
  const [addressSearch, setAddressSearch] = useState('');
  const [activeTab, setActiveTab] = useState('informasi');
  const mode = site ? 'Edit' : 'Create';

  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: buildDefaultValues(null),
  });

  const scheduleFieldArray = useFieldArray({ control: form.control, name: 'workSchedules' });

  const watchedLat = form.watch('office.lat');
  const watchedLng = form.watch('office.lng');
  const watchedCheckInRadius = form.watch('checkInRadiusMeters');
  const watchedUseSameRadius = form.watch('useSameRadiusForCheckOut');
  const watchedActiveDays = form.watch('activeDays') as WorkScheduleDay[];
  const watchedBrandIds = form.watch('brandIds');

  // A per-brand name ("Absensi PT Environesia Global Saraya") makes it obvious
  // this site is one company's own rule set, not a generic shared bucket like
  // the old "Environesia Company" default that made HRD think several brands'
  // absensi rules were all the same. Only offered as a one-click suggestion —
  // never auto-fills over whatever the user already typed.
  const suggestedSiteName = useMemo(() => {
    const names = watchedBrandIds
      .map((id) => brands.find((b) => b.id === id)?.name)
      .filter((n): n is string => !!n);
    if (names.length === 0) return null;
    if (names.length === 1) return `Absensi ${names[0]}`;
    return `Absensi Group ${names.join(' & ')}`;
  }, [watchedBrandIds, brands]);

  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const [isSplitting, setIsSplitting] = useState(false);
  const [showSplitConfirm, setShowSplitConfirm] = useState(false);

  const mapId = useMemo(() => `attendance-site-map-${site?.id ?? 'new'}`, [site]);

  // Brands the site being edited already carries that this HRD isn't
  // allowed to touch — a leftover multi-brand site (e.g. the old
  // "Environesia Company" bucket) that includes even one brand outside
  // allowedBrandIds. These ids never appear as a checkbox in "Brand
  // Terkait" (that list only ever renders `brands`, this HRD's own scope),
  // so there is no way for the HRD to remove them from the form — meaning
  // save must be blocked here, with a clear explanation, rather than
  // silently failing at Firestore's rules layer with a generic error.
  // Super Admin / "all companies" HRD scope never hit this.
  const unauthorizedBrandIds = useMemo(() => {
    if (isSuperAdmin || isAllCompanies || !site) return [];
    const siteBrandIds = Array.isArray(site.brandIds) && site.brandIds.length > 0
      ? site.brandIds
      : (site.brandId ? [site.brandId] : []);
    return siteBrandIds.filter((id) => !allowedBrandIds.includes(id));
  }, [isSuperAdmin, isAllCompanies, site, allowedBrandIds]);
  const unauthorizedBrandNames = unauthorizedBrandIds.map((id) => site?.brandNames?.[site.brandIds?.indexOf(id) ?? -1] || id);

  // Keep check-out radius mirrored to check-in radius whenever "samakan radius" is on.
  useEffect(() => {
    if (watchedUseSameRadius) {
      form.setValue('checkOutRadiusMeters', watchedCheckInRadius, { shouldValidate: true });
    }
  }, [watchedUseSameRadius, watchedCheckInRadius, form]);

  // Synchronous, before paint — a plain useEffect here would run AFTER the
  // dialog's first paint, so for one frame PreviewPanel (which reads
  // form.watch()) and every field would still show whatever the form last
  // held (the blank "create" defaults, or the PREVIOUS site's values if the
  // dialog was already open for a different site) instead of this site's
  // actual data. That one-frame staleness is what made the preview panel
  // disagree with the site card in the reported bug.
  useLayoutEffect(() => {
    if (!open) return;
    setActiveTab('informasi');
    setShowSplitConfirm(false);
    const initialValues = buildDefaultValues(site);
    // HRD scoped to exactly one brand can never pick a different one — the
    // "Brand Terkait" field below renders as a locked, non-interactive label
    // in that case, so nothing else ever calls field.onChange to actually
    // put the brand id into form state. Without this, a brand-new site's
    // brandIds silently stayed [] forever for a single-brand HRD.
    if (!isSuperAdmin && !isAllCompanies && brands.length === 1 && initialValues.brandIds.length === 0) {
      initialValues.brandIds = [brands[0].id!];
    }
    form.reset(initialValues);
  }, [open, site, form, brands, isSuperAdmin, isAllCompanies]);

  useEffect(() => {
    if (!open) return;
    const initialValues = buildDefaultValues(site);
    const timer = setTimeout(() => {
      const mapContainer = document.getElementById(mapId);
      if (mapContainer && !mapRef.current) {
        const map = L.map(mapId).setView([initialValues.office.lat, initialValues.office.lng], 16);
        mapRef.current = map;

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(map);

        const marker = L.marker([initialValues.office.lat, initialValues.office.lng], { draggable: true }).addTo(map);
        markerRef.current = marker;

        const circle = L.circle([initialValues.office.lat, initialValues.office.lng], { radius: initialValues.checkInRadiusMeters }).addTo(map);
        circleRef.current = circle;

        marker.on('dragend', (e) => {
          const { lat, lng } = e.target.getLatLng();
          form.setValue('office', { lat, lng }, { shouldValidate: true });
        });

        setTimeout(() => map.invalidateSize(), 400);
      }
    }, 100);

    return () => {
      clearTimeout(timer);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
        circleRef.current = null;
      }
    };
  }, [open, site, form, mapId]);

  useEffect(() => {
    if (mapRef.current && markerRef.current) {
      const newLatLng: [number, number] = [watchedLat, watchedLng];
      mapRef.current.setView(newLatLng, mapRef.current.getZoom());
      markerRef.current.setLatLng(newLatLng);
    }
    if (circleRef.current) {
      circleRef.current.setLatLng([watchedLat, watchedLng]);
    }
  }, [watchedLat, watchedLng]);

  useEffect(() => {
    if (circleRef.current) {
      circleRef.current.setRadius(watchedCheckInRadius);
    }
  }, [watchedCheckInRadius]);

  // Reverse Geocoding Effect
  useEffect(() => {
    const handler = setTimeout(async () => {
      if (watchedLat && watchedLng) {
        setIsResolvingAddress(true);
        try {
          const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${watchedLat}&lon=${watchedLng}`);
          if (!response.ok) throw new Error('Failed to fetch address');
          const data = await response.json();
          setResolvedAddress(data.display_name || 'Alamat tidak dapat ditemukan.');
        } catch (error) {
          setResolvedAddress('Gagal mengambil alamat.');
        } finally {
          setIsResolvingAddress(false);
        }
      }
    }, 500);

    return () => clearTimeout(handler);
  }, [watchedLat, watchedLng]);

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast({ variant: 'destructive', title: 'Error', description: 'Geolocation tidak didukung oleh browser Anda.' });
      return;
    }
    setIsFetchingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        form.setValue('office', { lat: latitude, lng: longitude }, { shouldValidate: true });
        setIsFetchingLocation(false);
        toast({ title: 'Lokasi Ditemukan', description: 'Titik lokasi telah diperbarui.' });
      },
      () => {
        toast({ variant: 'destructive', title: 'Izin Lokasi Ditolak', description: 'Aktifkan izin lokasi di browser Anda.' });
        setIsFetchingLocation(false);
      }
    );
  };

  const handleAddressSearch = async () => {
    if (!addressSearch) return;
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressSearch)}&limit=1`);
      const data = await response.json();
      if (data && data.length > 0) {
        const { lat, lon, display_name } = data[0];
        form.setValue('office', { lat: parseFloat(lat), lng: parseFloat(lon) }, { shouldValidate: true });
        toast({ title: 'Alamat Ditemukan', description: display_name });
      } else {
        toast({ variant: 'destructive', title: 'Alamat Tidak Ditemukan' });
      }
    } catch (error) {
      toast({ variant: 'destructive', title: 'Gagal mencari alamat' });
    }
  };

  const handleUseDefaultLocation = () => {
    const defaultLocation = { lat: -7.761699, lng: 110.367134 };
    form.setValue('office', defaultLocation, { shouldValidate: true });
    toast({ title: 'Lokasi Default Digunakan' });
  };

  const applyDayPreset = (preset: WorkScheduleDay[]) => {
    form.setValue('activeDays', preset, { shouldValidate: true });
  };

  const toggleActiveDay = (day: WorkScheduleDay, checked: boolean) => {
    const current = form.getValues('activeDays') as WorkScheduleDay[];
    const next = checked ? [...current, day] : current.filter((d) => d !== day);
    form.setValue('activeDays', next, { shouldValidate: true });
  };

  const onSubmit = async (values: FormValues) => {
    if (!userProfile) return;

    const selectedBrandIds = values.brandIds || [];

    // Zod's `min(1)` already blocks the native submit for this, but a plain
    // check here gives the exact spec'd message instead of a generic form
    // validation string, and guards the same thing at the actual save point.
    if (selectedBrandIds.length === 0) {
      toast({ variant: 'destructive', title: 'Pilih perusahaan terlebih dahulu.' });
      return;
    }

    // Re-validate brandIds against this HRD's own scope — the Save button is
    // already disabled below when unauthorizedBrandIds is non-empty, but
    // this stays as a hard block too (defense in depth against a stale form
    // state actually reaching Firestore). Super Admin and "all companies"
    // HRD scope are exempt; both are legitimately allowed to touch every brand.
    if (!isSuperAdmin && !isAllCompanies) {
      const outOfScope = selectedBrandIds.filter((id) => !allowedBrandIds.includes(id));
      if (outOfScope.length > 0) {
        const names = outOfScope.map((id) => {
          const idx = site?.brandIds?.indexOf(id) ?? -1;
          return (idx >= 0 ? site?.brandNames?.[idx] : null) || brands.find((b) => b.id === id)?.name || id;
        });
        toast({
          variant: 'destructive',
          title: 'Site ini berisi perusahaan di luar akses HRD Anda',
          description: `Anda tidak memiliki akses untuk mengatur:\n${names.map((n) => `- ${n}`).join('\n')}\n\nPisahkan site absensi per perusahaan atau hubungi Super Admin.`,
        });
        return;
      }
    }

    // 1 brand = 1 aturan absensi aktif — two active sites both claiming the
    // same brand would leave resolveSiteForBrand to pick between them
    // arbitrarily (first match in array order), so Monitoring Absensi/Detail
    // modal/Rekap Payroll could silently apply the wrong schedule/tolerance.
    // Only checked when this site is being saved as active; inactive sites
    // are never returned by resolveSiteForBrand and so can't conflict.
    if (values.isActive) {
      const conflictingSite = sites.find((other) => {
        if (other.id === site?.id) return false; // editing the same doc is never a conflict with itself
        if (!other.isActive) return false;
        const otherBrandIds = [...(other.brandIds || []), other.brandId].filter(Boolean);
        return selectedBrandIds.some((id) => otherBrandIds.includes(id));
      });
      if (conflictingSite) {
        toast({
          variant: 'destructive',
          title: 'Aturan absensi bentrok',
          description: `Perusahaan ini sudah memiliki aturan absensi aktif ("${conflictingSite.name}"). Nonaktifkan aturan lama atau edit aturan yang sudah ada.`,
        });
        return;
      }
    }

    const docRef = site ? doc(firestore, 'attendance_sites', site.id!) : doc(collection(firestore, 'attendance_sites'));
    // Never embed a raw id as a "name" — an unresolved brandId (e.g. one
    // outside this HRD's scope) is dropped, not stringified into brandNames.
    const selectedBrandNames = selectedBrandIds
      .map((id) => brands.find((b) => b.id === id)?.name)
      .filter((name): name is string => !!name);
    const checkOutRadius = values.useSameRadiusForCheckOut ? values.checkInRadiusMeters : values.checkOutRadiusMeters;
    const firstSchedule = values.workSchedules[0];
    const keywords = (values.validAddressKeywords || '')
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    const displayName = (userProfile as any).displayName || (userProfile as any).fullName || userProfile.email || 'HRD';
    const siteName = values.name || `Absensi ${selectedBrandNames[0] || 'Perusahaan'}`;

    const payload: Omit<AttendanceSite, 'id'> = {
      name: siteName,
      // Mirrors `name` — some external readers were seen expecting this key;
      // this app's own code always reads `name`, never `siteName`.
      siteName,
      brandIds: selectedBrandIds,
      brandId: selectedBrandIds[0],
      brandNames: selectedBrandNames,
      brandName: selectedBrandNames[0] || '',
      isActive: values.isActive,
      office: values.office,
      address: resolvedAddress || (site as any)?.address || '',
      checkInRadiusMeters: Number(values.checkInRadiusMeters),
      checkOutRadiusMeters: Number(checkOutRadius),
      useSameRadiusForCheckOut: values.useSameRadiusForCheckOut,
      // Legacy single radius — mirrors checkInRadiusMeters for older readers.
      radiusM: Number(values.checkInRadiusMeters),
      validAddressKeywords: keywords,
      locationValidationMode: values.locationValidationMode,
      timezone: 'Asia/Jakarta',
      activeDays: values.activeDays as WorkScheduleDay[],
      workSchedules: values.workSchedules.map((g) => ({
        ...g,
        days: g.days as WorkScheduleDay[],
        breakStart: g.breakStart || undefined,
        breakEnd: g.breakEnd || undefined,
      })),
      // Legacy fields — derived from the first schedule group so old readers keep working.
      workDays: (values.activeDays as WorkScheduleDay[]).map((d) => ({
        monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
      } as Record<WorkScheduleDay, string>)[d]),
      shift: {
        startTime: firstSchedule?.startTime || '08:00',
        endTime: firstSchedule?.endTime || '17:00',
        graceLateMinutes: Number(values.lateToleranceMinutes),
      },
      breakStart: firstSchedule?.breakStart || undefined,
      breakEnd: firstSchedule?.breakEnd || undefined,
      lateToleranceMinutes: Number(values.lateToleranceMinutes),
      earliestCheckIn: values.earliestCheckIn || '06:00',
      latestCheckInWithoutReview: values.latestCheckInWithoutReview || '09:00',
      minimumWorkMinutes: Number(values.minimumWorkMinutes),
      createdByUid: site ? (site as any).createdByUid || userProfile.uid : userProfile.uid,
      createdByName: site ? (site as any).createdByName || displayName : displayName,
      createdAt: site ? (site as any).createdAt : (serverTimestamp() as Timestamp),
      updatedByUid: userProfile.uid,
      updatedByName: displayName,
      updatedAt: serverTimestamp() as Timestamp,
      updatedBy: userProfile.uid,
    };

    console.log('[ATTENDANCE_SITE_CREATE_DEBUG]', {
      currentUserUid: userProfile.uid,
      role: (userProfile as any).role ?? null,
      allowedBrandIds,
      selectedBrandIds,
      selectedBrandNames,
      payload,
    });

    setIsSaving(true);
    try {
      await setDocumentNonBlocking(docRef, payload, { merge: true });
      toast({ title: site ? 'Pengaturan Disimpan' : 'Site absensi berhasil ditambahkan.' });
      onSaved?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error('[ATTENDANCE_SITE_CREATE_ERROR]', {
        code: error?.code,
        message: error?.message,
        payload,
        allowedBrandIds,
        selectedBrandIds,
      });
      toast({ variant: 'destructive', title: 'Gagal Menyimpan', description: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  // Super Admin only — turns one legacy multi-brand site (e.g. the old
  // "Environesia Company" bucket) into one new active site per brand, each
  // copying the old site's rules as a starting point (radius, schedule,
  // tolerance, ...) so they can then be tuned per company. The OLD site is
  // deliberately left untouched/active here — "boleh dinonaktifkan" (may be
  // deactivated) in the spec is optional, and auto-deactivating a still-live
  // attendance rule the moment a batch write succeeds is a needless risk if
  // anything about the split needs fixing first. Super Admin turns it off
  // manually (Aktifkan Site Ini → off → Simpan) once the new sites are verified.
  const siteBrandIdsForSplit = site
    ? (Array.isArray(site.brandIds) && site.brandIds.length > 0 ? site.brandIds : (site.brandId ? [site.brandId] : []))
    : [];

  const handleSplitSiteByBrand = async () => {
    if (!site || !userProfile || siteBrandIdsForSplit.length < 2) return;
    setIsSplitting(true);
    try {
      const batch = writeBatch(firestore);
      for (const brandId of siteBrandIdsForSplit) {
        const idx = siteBrandIdsForSplit.indexOf(brandId);
        const brandName = brands.find((b) => b.id === brandId)?.name || site.brandNames?.[idx] || brandId;
        const newDocRef = doc(collection(firestore, 'attendance_sites'));
        const newSite: Omit<AttendanceSite, 'id'> = {
          name: `Absensi ${brandName}`,
          brandIds: [brandId],
          brandId,
          brandNames: [brandName],
          isActive: true,
          office: site.office,
          checkInRadiusMeters: toFiniteNumber(site.checkInRadiusMeters ?? site.radiusM, 20),
          checkOutRadiusMeters: toFiniteNumber(site.checkOutRadiusMeters ?? site.radiusM, 20),
          useSameRadiusForCheckOut: site.useSameRadiusForCheckOut ?? true,
          radiusM: toFiniteNumber(site.checkInRadiusMeters ?? site.radiusM, 20),
          validAddressKeywords: site.validAddressKeywords || [],
          locationValidationMode: site.locationValidationMode || 'hybrid',
          timezone: 'Asia/Jakarta',
          activeDays: site.activeDays || [],
          workSchedules: site.workSchedules || [],
          workDays: site.workDays || [],
          shift: site.shift,
          breakStart: site.breakStart,
          breakEnd: site.breakEnd,
          lateToleranceMinutes: toFiniteNumber(site.lateToleranceMinutes ?? site.shift?.graceLateMinutes, 15),
          earliestCheckIn: site.earliestCheckIn || '06:00',
          latestCheckInWithoutReview: site.latestCheckInWithoutReview || '09:00',
          minimumWorkMinutes: toFiniteNumber(site.minimumWorkMinutes, 480),
          createdFromSiteId: site.id,
          createdByUid: userProfile.uid,
          createdAt: serverTimestamp() as Timestamp,
          updatedByUid: userProfile.uid,
          updatedAt: serverTimestamp() as Timestamp,
        };
        batch.set(newDocRef, newSite);
      }
      await batch.commit();
      toast({
        title: 'Site berhasil dipecah',
        description: `${siteBrandIdsForSplit.length} site baru dibuat, satu per brand. Site lama ("${site.name}") masih aktif — nonaktifkan setelah memverifikasi jadwal/toleransi tiap site baru.`,
      });
      setShowSplitConfirm(false);
      onOpenChange(false);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Gagal memecah site', description: error.message });
    } finally {
      setIsSplitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[92vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-4 border-b">
          <DialogTitle>{mode} Site Absensi</DialogTitle>
          <DialogDescription>
            Atur lokasi kantor, radius, hari &amp; jadwal kerja, serta aturan absensi untuk brand yang Anda pegang.
          </DialogDescription>
        </DialogHeader>

        {!isSuperAdmin && !isAllCompanies && unauthorizedBrandIds.length > 0 && (
          <div className="px-6 pt-4 flex-shrink-0">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Site ini berisi perusahaan di luar akses HRD Anda</AlertTitle>
              <AlertDescription>
                <p className="mb-1">Anda tidak memiliki akses untuk mengatur:</p>
                <ul className="list-disc pl-5 mb-2">
                  {unauthorizedBrandNames.map((name) => <li key={name}>{name}</li>)}
                </ul>
                <p className="mb-2">Penyimpanan dinonaktifkan. Pisahkan site absensi per perusahaan atau hubungi Super Admin — atau buat site baru khusus brand yang Anda pegang.</p>
                {onCreateNewInstead && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => { onOpenChange(false); onCreateNewInstead(); }}
                  >
                    Buat Site Baru untuk Brand Saya
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          </div>
        )}

        <div className="flex-grow overflow-hidden flex flex-col">
          <Form {...form}>
            <form id="site-form" onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col h-full overflow-hidden">
              <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setTimeout(() => mapRef.current?.invalidateSize(), 50); }} className="flex flex-col h-full overflow-hidden">
                <div className="px-6 pt-4">
                  <TabsList className="grid grid-cols-4 w-full">
                    <TabsTrigger value="informasi">Informasi Site</TabsTrigger>
                    <TabsTrigger value="lokasi">Lokasi &amp; Radius</TabsTrigger>
                    <TabsTrigger value="jadwal">Hari &amp; Jadwal</TabsTrigger>
                    <TabsTrigger value="aturan">Aturan Absensi</TabsTrigger>
                  </TabsList>
                </div>

                <div className="flex-grow overflow-y-auto px-6 py-4">
                  {/* ── Informasi Site ───────────────────────────────────────── */}
                  <TabsContent value="informasi" forceMount className="data-[state=inactive]:hidden mt-0 space-y-4">
                    <div>
                      <h3 className="font-semibold text-sm">Informasi Dasar</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">Nama site dan brand yang akan mengikuti aturan absensi ini.</p>
                    </div>
                    <FormField control={form.control} name="name" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nama Site</FormLabel>
                        <FormControl><Input placeholder="Absensi PT Environesia Global Saraya" {...field} /></FormControl>
                        <FormDescription>
                          Gunakan nama yang spesifik per perusahaan (mis. &quot;Absensi PT Environesia Global Saraya&quot;), bukan nama umum seperti &quot;Environesia Company&quot; — kecuali brand yang digabung di sini memang punya aturan absensi yang sama persis.
                        </FormDescription>
                        {suggestedSiteName && suggestedSiteName !== field.value && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => form.setValue('name', suggestedSiteName, { shouldValidate: true })}
                          >
                            Gunakan: {suggestedSiteName}
                          </Button>
                        )}
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField
                      control={form.control}
                      name="brandIds"
                      render={() => (
                        <FormItem>
                          <FormLabel>Brand Terkait</FormLabel>
                          {brands.length === 1 ? (
                            <div className="rounded-md border p-3 text-sm font-medium bg-muted/40">
                              {brands[0].name}
                              <FormDescription className="mt-1">Anda hanya memegang satu perusahaan — brand ini otomatis terpilih.</FormDescription>
                            </div>
                          ) : (
                            <div className="max-h-40 w-full rounded-md border p-4 overflow-y-auto">
                              {brands.map((brand) => (
                                <FormField key={brand.id} control={form.control} name="brandIds" render={({ field }) => (
                                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 mb-2">
                                    <FormControl>
                                      <Checkbox
                                        checked={field.value?.includes(brand.id!)}
                                        onCheckedChange={(checked) => checked
                                          ? field.onChange([...(field.value || []), brand.id!])
                                          : field.onChange((field.value || []).filter((v) => v !== brand.id!))}
                                      />
                                    </FormControl>
                                    <FormLabel className="font-normal">{brand.name}</FormLabel>
                                  </FormItem>
                                )} />
                              ))}
                            </div>
                          )}
                          <FormDescription>Hanya menampilkan perusahaan yang Anda pegang. Karyawan diarahkan ke site berdasarkan brand mereka.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {isSuperAdmin && siteBrandIdsForSplit.length > 1 && (
                      <Alert>
                        <Split className="h-4 w-4" />
                        <AlertTitle>Site ini menggabungkan {siteBrandIdsForSplit.length} brand</AlertTitle>
                        <AlertDescription>
                          <p className="mb-2">
                            Jika aturan absensi tiap brand berbeda (jam masuk, toleransi, radius, dll), pecah site ini
                            menjadi satu site aktif per brand — masing-masing dimulai dari salinan aturan site ini,
                            lalu bisa disesuaikan sendiri-sendiri.
                          </p>
                          {!showSplitConfirm ? (
                            <Button type="button" size="sm" variant="outline" onClick={() => setShowSplitConfirm(true)}>
                              <Split className="mr-1.5 h-3.5 w-3.5" /> Pecah Site per Brand
                            </Button>
                          ) : (
                            <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-900/10 p-3">
                              <p className="text-xs">
                                Akan dibuat {siteBrandIdsForSplit.length} site baru (aktif), satu per brand. Site ini
                                ("{site?.name}") tetap aktif apa adanya — nonaktifkan sendiri setelah memverifikasi
                                site-site baru.
                              </p>
                              <div className="flex gap-2">
                                <Button type="button" size="sm" onClick={handleSplitSiteByBrand} disabled={isSplitting}>
                                  {isSplitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                                  Ya, Pecah Sekarang
                                </Button>
                                <Button type="button" size="sm" variant="ghost" onClick={() => setShowSplitConfirm(false)} disabled={isSplitting}>
                                  Batal
                                </Button>
                              </div>
                            </div>
                          )}
                        </AlertDescription>
                      </Alert>
                    )}

                    <FormField control={form.control} name="isActive" render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                        <FormLabel>Aktifkan Site Ini</FormLabel>
                        <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                      </FormItem>
                    )} />
                  </TabsContent>

                  {/* ── Lokasi & Radius ──────────────────────────────────────── */}
                  <TabsContent value="lokasi" forceMount className="data-[state=inactive]:hidden mt-0 space-y-4">
                    <div>
                      <h3 className="font-semibold text-sm">Titik Lokasi Kantor</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">Geser penanda, cari alamat, atau ambil lokasi Anda saat ini untuk menentukan titik kantor.</p>
                    </div>
                    <div id={mapId} className="w-full h-[280px] rounded-xl overflow-hidden z-0 bg-muted" />
                    <div className="text-xs p-2.5 bg-muted rounded-md min-h-[3.5rem] border">
                      <p className="font-semibold text-muted-foreground">Alamat Terdeteksi</p>
                      {isResolvingAddress ? (
                        <p className="italic text-muted-foreground">Mencari alamat...</p>
                      ) : (
                        <p className="text-muted-foreground">{resolvedAddress || 'Geser penanda untuk melihat alamat.'}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>Cari Alamat</Label>
                      <div className="flex gap-2">
                        <Input placeholder="Cari nama jalan/tempat..." value={addressSearch} onChange={(e) => setAddressSearch(e.target.value)} />
                        <Button type="button" onClick={handleAddressSearch}><Search className="h-4 w-4" /></Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" onClick={getCurrentLocation} disabled={isFetchingLocation}>
                        {isFetchingLocation ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LocateFixed className="mr-2 h-4 w-4" />}
                        Ambil Lokasi Saya
                      </Button>
                      <Button type="button" size="sm" variant="secondary" onClick={handleUseDefaultLocation}>Gunakan Lokasi Default</Button>
                    </div>
                    <Accordion type="single" collapsible>
                      <AccordionItem value="advanced-location">
                        <AccordionTrigger>Pengaturan Lanjutan (Koordinat Manual)</AccordionTrigger>
                        <AccordionContent className="pt-4 space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField control={form.control} name="office.lat" render={({ field }) => (<FormItem><FormLabel>Latitude</FormLabel><FormControl><Input type="number" step="any" {...field} /></FormControl><FormMessage /></FormItem>)} />
                            <FormField control={form.control} name="office.lng" render={({ field }) => (<FormItem><FormLabel>Longitude</FormLabel><FormControl><Input type="number" step="any" {...field} /></FormControl><FormMessage /></FormItem>)} />
                          </div>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              const lat = form.getValues('office.lat');
                              const lng = form.getValues('office.lng');
                              if (mapRef.current && typeof lat === 'number' && typeof lng === 'number') {
                                const newLatLng: [number, number] = [lat, lng];
                                mapRef.current.setView(newLatLng, 17);
                                if (markerRef.current) markerRef.current.setLatLng(newLatLng);
                              }
                            }}
                          >
                            <MapPin className="mr-2 h-4 w-4" />
                            Pusatkan Peta ke Koordinat
                          </Button>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>

                    <div className="space-y-4 p-4 border rounded-lg">
                      <h3 className="font-semibold text-sm">Radius Absensi</h3>
                      <FormField control={form.control} name="checkInRadiusMeters" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Radius Masuk: {field.value} meter</FormLabel>
                          <FormControl><Slider min={10} max={500} step={5} value={[field.value]} onValueChange={(vals) => field.onChange(vals[0])} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="useSameRadiusForCheckOut" render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                          <FormLabel className="font-normal">Samakan radius masuk dan pulang</FormLabel>
                          <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                        </FormItem>
                      )} />
                      {!watchedUseSameRadius && (
                        <FormField control={form.control} name="checkOutRadiusMeters" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Radius Pulang: {field.value} meter</FormLabel>
                            <FormControl><Slider min={10} max={500} step={5} value={[field.value]} onValueChange={(vals) => field.onChange(vals[0])} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      )}
                    </div>

                    <div className="space-y-4 p-4 border rounded-lg">
                      <h3 className="font-semibold text-sm">Validasi Lokasi Berbasis Alamat</h3>
                      <FormField control={form.control} name="locationValidationMode" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Mode Validasi</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value="hybrid">Hybrid (radius atau nama jalan)</SelectItem>
                              <SelectItem value="radius_only">Hanya Radius</SelectItem>
                              <SelectItem value="address_only">Hanya Nama Jalan</SelectItem>
                              <SelectItem value="radius_and_address">Radius dan Nama Jalan (keduanya wajib)</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="validAddressKeywords" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nama Jalan / Alias Alamat</FormLabel>
                          <FormControl>
                            <Textarea placeholder="Jalan Selokan Mataram, Jl. Selokan Mataram, Sinduadi, Mlati, Sleman" {...field} />
                          </FormControl>
                          <FormDescription>Pisahkan dengan koma. Jika alamat absensi mengandung salah satu keyword ini, lokasi dianggap valid meski di luar radius.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                  </TabsContent>

                  {/* ── Hari & Jadwal Kerja ──────────────────────────────────── */}
                  <TabsContent value="jadwal" forceMount className="data-[state=inactive]:hidden mt-0 space-y-4">
                    <div className="space-y-3 p-4 border rounded-lg">
                      <h3 className="font-semibold text-sm">Hari Aktif Kerja</h3>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => applyDayPreset(MON_FRI)}>Senin–Jumat</Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => applyDayPreset(MON_SAT)}>Senin–Sabtu</Button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {ALL_DAYS.map((d) => (
                          <label key={d.value} className="flex items-center gap-2 text-sm rounded-md border p-2 cursor-pointer">
                            <Checkbox
                              checked={watchedActiveDays?.includes(d.value)}
                              onCheckedChange={(checked) => toggleActiveDay(d.value, !!checked)}
                            />
                            {d.label}
                          </label>
                        ))}
                      </div>
                      <FormMessage>{form.formState.errors.activeDays?.message}</FormMessage>
                    </div>

                    <div className="space-y-3 p-4 border rounded-lg">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-sm">Jadwal Kerja Mingguan</h3>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => scheduleFieldArray.append({ days: [], startTime: '08:00', endTime: '17:00', breakStart: '12:00', breakEnd: '13:00' })}
                        >
                          <Plus className="h-4 w-4 mr-1" /> Tambah Jadwal Berbeda
                        </Button>
                      </div>
                      <FormDescription>Contoh: Senin–Kamis satu jadwal, Jumat jadwal berbeda. Hari yang sama tidak boleh dipilih di lebih dari satu jadwal.</FormDescription>
                      {scheduleFieldArray.fields.map((field, index) => (
                        <div key={field.id} className="p-3 border rounded-md space-y-3 bg-muted/20">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase text-muted-foreground">Jadwal {index + 1}</span>
                            {scheduleFieldArray.fields.length > 1 && (
                              <Button type="button" size="icon" variant="ghost" onClick={() => scheduleFieldArray.remove(index)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                          <FormField control={form.control} name={`workSchedules.${index}.days`} render={({ field: daysField }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Berlaku untuk hari</FormLabel>
                              <div className="flex flex-wrap gap-2">
                                {ALL_DAYS.filter((d) => watchedActiveDays?.includes(d.value)).map((d) => (
                                  <label key={d.value} className="flex items-center gap-1.5 text-xs rounded border px-2 py-1 cursor-pointer">
                                    <Checkbox
                                      checked={daysField.value?.includes(d.value)}
                                      onCheckedChange={(checked) => {
                                        const next = checked
                                          ? [...(daysField.value || []), d.value]
                                          : (daysField.value || []).filter((v: string) => v !== d.value);
                                        daysField.onChange(next);
                                      }}
                                    />
                                    {d.label}
                                  </label>
                                ))}
                              </div>
                              <FormMessage />
                            </FormItem>
                          )} />
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <FormField control={form.control} name={`workSchedules.${index}.startTime`} render={({ field }) => (<FormItem><FormLabel className="text-xs">Jam Masuk</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>)} />
                            <FormField control={form.control} name={`workSchedules.${index}.endTime`} render={({ field }) => (<FormItem><FormLabel className="text-xs">Jam Pulang</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>)} />
                            <FormField control={form.control} name={`workSchedules.${index}.breakStart`} render={({ field }) => (<FormItem><FormLabel className="text-xs">Mulai Istirahat</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>)} />
                            <FormField control={form.control} name={`workSchedules.${index}.breakEnd`} render={({ field }) => (<FormItem><FormLabel className="text-xs">Selesai Istirahat</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>)} />
                          </div>
                        </div>
                      ))}
                      <FormMessage>{(form.formState.errors.workSchedules as any)?.message}</FormMessage>
                    </div>
                  </TabsContent>

                  {/* ── Aturan Absensi ───────────────────────────────────────── */}
                  <TabsContent value="aturan" forceMount className="data-[state=inactive]:hidden mt-0 space-y-4">
                    <div>
                      <h3 className="font-semibold text-sm">Aturan Keterlambatan &amp; Review</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Absen pulang tidak pernah diblokir — pulang lebih awal atau lebih lambat dari jadwal hanya tercatat sebagai status informasi di Monitoring Absensi, bukan alasan untuk menolak absen.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 p-4 border rounded-lg">
                      <FormField control={form.control} name="lateToleranceMinutes" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Toleransi Telat (menit)</FormLabel>
                          <FormControl><Input type="number" {...field} /></FormControl>
                          <FormDescription>Contoh: jam masuk 08:00 dan toleransi 15 menit, maka lewat 08:15 dianggap terlambat.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="minimumWorkMinutes" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Minimal Jam Kerja (opsional)</FormLabel>
                          <FormControl><Input type="number" {...field} /></FormControl>
                          <FormDescription>Digunakan untuk informasi rekap, tidak menghalangi karyawan absen pulang.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="earliestCheckIn" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Jam Absen Masuk Paling Awal</FormLabel>
                          <FormControl><Input type="time" {...field} /></FormControl>
                          <FormDescription>Karyawan tidak disarankan tap in sebelum jam ini.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="latestCheckInWithoutReview" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Check-in Perlu Review Setelah Jam</FormLabel>
                          <FormControl><Input type="time" {...field} /></FormControl>
                          <FormDescription>Jika karyawan tap in setelah jam ini, sistem menandai Perlu Review.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                  </TabsContent>
                </div>

                {/* ── Preview Pengaturan — always visible, updates live from the form ── */}
                <div className="px-6 pb-4 pt-2 border-t bg-muted/30 flex-shrink-0">
                  <PreviewPanel form={form} brands={brands} />
                </div>
              </Tabs>
            </form>
          </Form>
        </div>
        <DialogFooter className="flex-shrink-0 p-6 pt-4 border-t">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button type="submit" form="site-form" disabled={isSaving || unauthorizedBrandIds.length > 0}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Save className="mr-2 h-4 w-4" />
            Simpan Pengaturan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const LOCATION_MODE_SHORT_LABEL: Record<string, string> = {
  hybrid: 'Hybrid',
  radius_only: 'Radius Saja',
  address_only: 'Nama Jalan Saja',
  radius_and_address: 'Radius + Nama Jalan',
};

/** Live "Preview Pengaturan" recap — short mini-blocks (not a paragraph), reads the in-progress form values so HRD sees the effect of their changes before saving. */
function PreviewPanel({ form, brands }: { form: ReturnType<typeof useForm<FormValues>>; brands: Brand[] }) {
  const values = form.watch();
  const brandNames = (values.brandIds || []).map((id) => brands.find((b) => b.id === id)?.name).filter((n): n is string => !!n);
  const scheduleLines = getWorkScheduleLines({ workSchedules: values.workSchedules as any });
  const checkOutRadius = values.useSameRadiusForCheckOut ? values.checkInRadiusMeters : values.checkOutRadiusMeters;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Preview Pengaturan</h4>
        <Badge variant={values.isActive ? 'default' : 'outline'} className="text-[10px]">
          {values.isActive ? 'Aktif' : 'Non-Aktif'}
        </Badge>
        <Badge variant="outline" className="text-[10px]">{LOCATION_MODE_SHORT_LABEL[values.locationValidationMode] ?? values.locationValidationMode}</Badge>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div>
          <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-1">Brand</p>
          <p className="text-slate-700 dark:text-slate-300">{brandNames.length > 0 ? brandNames.join(', ') : 'Belum dipilih'}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-1">Hari Aktif</p>
          <p className="text-slate-700 dark:text-slate-300">{formatDaysRangeLabel(values.activeDays as WorkScheduleDay[])}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-1">Jadwal</p>
          {scheduleLines.length > 0 ? scheduleLines.map((line, i) => (
            <p key={i} className="text-slate-700 dark:text-slate-300">{line.daysLabel} {line.timeLabel}</p>
          )) : <p className="text-muted-foreground">Belum diatur</p>}
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-1">Radius</p>
          <p className="text-slate-700 dark:text-slate-300">Masuk {values.checkInRadiusMeters}m, Pulang {checkOutRadius}m</p>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Toleransi telat {values.lateToleranceMinutes} menit &middot; Absen masuk paling awal {values.earliestCheckIn || '-'} &middot; Perlu review jika tap in setelah {values.latestCheckInWithoutReview || '-'}.
      </p>
    </div>
  );
}
