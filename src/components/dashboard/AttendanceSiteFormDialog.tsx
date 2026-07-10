'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Save, LocateFixed, Search, MapPin, Plus, Trash2 } from 'lucide-react';
import type { AttendanceSite, Brand, WorkScheduleDay } from '@/lib/types';
import { useFirestore, setDocumentNonBlocking } from '@/firebase';
import { doc, serverTimestamp, Timestamp, collection } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/providers/auth-provider';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '../ui/switch';
import { Checkbox } from '../ui/checkbox';
import { Slider } from '../ui/slider';
import { Badge } from '../ui/badge';
import { getWorkScheduleLines, formatDaysRangeLabel } from '@/lib/attendance-helpers';
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
  const checkInRadius = site.checkInRadiusMeters ?? site.radiusM ?? 20;
  const checkOutRadius = site.checkOutRadiusMeters ?? site.radiusM ?? 20;
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
    lateToleranceMinutes: site.lateToleranceMinutes ?? site.shift?.graceLateMinutes ?? 15,
    earliestCheckIn: site.earliestCheckIn || '06:00',
    latestCheckInWithoutReview: site.latestCheckInWithoutReview || '09:00',
    minimumWorkMinutes: site.minimumWorkMinutes ?? 480,
  };
}

export function AttendanceSiteFormDialog({ open, onOpenChange, site, brands }: AttendanceSiteFormDialogProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const { userProfile } = useAuth();
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

  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);

  const mapId = useMemo(() => `attendance-site-map-${site?.id ?? 'new'}`, [site]);

  // Keep check-out radius mirrored to check-in radius whenever "samakan radius" is on.
  useEffect(() => {
    if (watchedUseSameRadius) {
      form.setValue('checkOutRadiusMeters', watchedCheckInRadius, { shouldValidate: true });
    }
  }, [watchedUseSameRadius, watchedCheckInRadius, form]);

  useEffect(() => {
    if (open) {
      setActiveTab('informasi');
      const initialValues = buildDefaultValues(site);
      form.reset(initialValues);

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
    }
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
    setIsSaving(true);
    try {
      const docRef = site ? doc(firestore, 'attendance_sites', site.id!) : doc(collection(firestore, 'attendance_sites'));
      // Never embed a raw id as a "name" — an unresolved brandId (e.g. one
      // outside this HRD's scope) is dropped, not stringified into brandNames.
      const brandNames = values.brandIds
        .map((id) => brands.find((b) => b.id === id)?.name)
        .filter((name): name is string => !!name);
      const checkOutRadius = values.useSameRadiusForCheckOut ? values.checkInRadiusMeters : values.checkOutRadiusMeters;
      const firstSchedule = values.workSchedules[0];
      const keywords = (values.validAddressKeywords || '')
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);

      const payload: Omit<AttendanceSite, 'id'> = {
        name: values.name,
        brandIds: values.brandIds,
        brandId: values.brandIds[0],
        brandNames,
        isActive: values.isActive,
        office: values.office,
        checkInRadiusMeters: values.checkInRadiusMeters,
        checkOutRadiusMeters: checkOutRadius,
        useSameRadiusForCheckOut: values.useSameRadiusForCheckOut,
        // Legacy single radius — mirrors checkInRadiusMeters for older readers.
        radiusM: values.checkInRadiusMeters,
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
          graceLateMinutes: values.lateToleranceMinutes,
        },
        breakStart: firstSchedule?.breakStart || undefined,
        breakEnd: firstSchedule?.breakEnd || undefined,
        lateToleranceMinutes: values.lateToleranceMinutes,
        earliestCheckIn: values.earliestCheckIn,
        latestCheckInWithoutReview: values.latestCheckInWithoutReview,
        minimumWorkMinutes: values.minimumWorkMinutes,
        createdByUid: site ? (site as any).createdByUid || userProfile.uid : userProfile.uid,
        updatedByUid: userProfile.uid,
        updatedAt: serverTimestamp() as Timestamp,
        updatedBy: userProfile.uid,
      };
      await setDocumentNonBlocking(docRef, payload, { merge: true });
      toast({ title: 'Pengaturan Disimpan' });
      onOpenChange(false);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Gagal Menyimpan', description: error.message });
    } finally {
      setIsSaving(false);
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
                      <FormItem><FormLabel>Nama Site</FormLabel><FormControl><Input placeholder="Kantor Pusat Yogyakarta" {...field} /></FormControl><FormMessage /></FormItem>
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
          <Button type="submit" form="site-form" disabled={isSaving}>
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
