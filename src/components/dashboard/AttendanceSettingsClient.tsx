'use client';

import { useState, useMemo, type ElementType, type ReactNode } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/hooks/use-toast';
import { useCollection, useFirestore, useMemoFirebase, deleteDocumentNonBlocking } from '@/firebase';
import { collection, doc } from 'firebase/firestore';
import type { AttendanceSite, Brand } from '@/lib/types';
import { getActiveDaysLabel, getBrandNamesForSite, getWorkScheduleLines } from '@/lib/attendance-helpers';
import { useHrdScopeContext } from '@/providers/hrd-scope-provider';
import { useHrdScopedBrands } from '@/hooks/useHrdScopedCollection';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, PlusCircle, Trash2, Edit, Building2, CalendarDays, Clock, Radar, ChevronDown, ChevronUp, MapPinned } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Badge } from '../ui/badge';
import { DeleteConfirmationDialog } from './DeleteConfirmationDialog';
import { AttendanceSiteFormDialog } from './AttendanceSiteFormDialog';

const LOCATION_MODE_LABEL: Record<string, string> = {
  hybrid: 'Hybrid (radius atau nama jalan)',
  radius_only: 'Hanya Radius',
  address_only: 'Hanya Nama Jalan',
  radius_and_address: 'Radius dan Nama Jalan',
};

function SummaryBlock({ icon: Icon, label, children }: { icon: ElementType; label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="text-sm text-slate-700 dark:text-slate-200 space-y-0.5">{children}</div>
    </div>
  );
}

function BrandChips({ names }: { names: string[] }) {
  if (names.length === 0) {
    return <span className="text-sm text-muted-foreground">Brand tidak ditemukan</span>;
  }
  const visible = names.slice(0, 3);
  const rest = names.length - visible.length;
  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((name) => (
        <Badge key={name} variant="secondary" className="font-normal">{name}</Badge>
      ))}
      {rest > 0 && <Badge variant="outline" className="font-normal">+{rest} lainnya</Badge>}
    </div>
  );
}

function SiteCard({
  site,
  brandMap,
  onEdit,
  onDelete,
}: {
  site: AttendanceSite;
  brandMap: Map<string, string>;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const brandNames = getBrandNamesForSite(site, brandMap);
  const scheduleLines = getWorkScheduleLines(site);
  const checkInRadius = site.checkInRadiusMeters ?? site.radiusM;
  const checkOutRadius = site.checkOutRadiusMeters ?? site.radiusM;

  return (
    <Card className="border-slate-200 dark:border-slate-800 shadow-sm rounded-xl">
      <CardContent className="p-4">
        <div className="flex flex-col lg:flex-row lg:items-start gap-4">
          {/* Left: identity */}
          <div className="flex items-start gap-3 lg:w-52 shrink-0">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 shrink-0">
              <Building2 className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm text-slate-900 dark:text-white truncate">{site.name}</p>
              <Badge variant={site.isActive ? 'default' : 'outline'} className="mt-1.5 text-[10px]">
                {site.isActive ? 'Aktif' : 'Non-Aktif'}
              </Badge>
            </div>
          </div>

          {/* Middle: mini summary blocks */}
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <SummaryBlock icon={Building2} label="Brand Terkait">
              <BrandChips names={brandNames} />
            </SummaryBlock>
            <SummaryBlock icon={CalendarDays} label="Hari Aktif">
              {getActiveDaysLabel(site)}
            </SummaryBlock>
            <SummaryBlock icon={Clock} label="Jadwal Kerja">
              {scheduleLines.length > 0 ? scheduleLines.map((line, i) => (
                <div key={i}>{line.daysLabel ? `${line.daysLabel} ` : ''}{line.timeLabel}</div>
              )) : <span className="text-muted-foreground">Belum diatur</span>}
            </SummaryBlock>
            <SummaryBlock icon={Radar} label="Radius">
              <div>Masuk {checkInRadius}m</div>
              <div>Pulang {checkOutRadius}m</div>
            </SummaryBlock>
          </div>

          {/* Right: actions */}
          <div className="flex lg:flex-col gap-1.5 shrink-0">
            <Button variant="outline" size="sm" className="text-xs justify-start" onClick={() => setExpanded((v) => !v)}>
              {expanded ? <ChevronUp className="h-3.5 w-3.5 mr-1.5" /> : <ChevronDown className="h-3.5 w-3.5 mr-1.5" />}
              Lihat Ringkasan
            </Button>
            <div className="flex gap-1.5">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
                <Edit className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onDelete}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        </div>

        {expanded && (
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Brand Terkait</p>
              {brandNames.length > 0 ? (
                <ul className="space-y-0.5">
                  {brandNames.map((name) => <li key={name}>{name}</li>)}
                </ul>
              ) : <span className="text-muted-foreground">Brand tidak ditemukan</span>}
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Istirahat</p>
              {scheduleLines.some((l) => l.breakLabel) ? scheduleLines.map((line, i) => (
                line.breakLabel ? <div key={i}>{line.daysLabel ? `${line.daysLabel} ` : ''}{line.breakLabel}</div> : null
              )) : <span className="text-muted-foreground">Tidak diatur</span>}
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Toleransi Telat</p>
              <p>{site.lateToleranceMinutes ?? site.shift?.graceLateMinutes ?? 0} menit</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Earliest Check-in</p>
              <p>{site.earliestCheckIn || '-'}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Latest Check-in Tanpa Review</p>
              <p>{site.latestCheckInWithoutReview || '-'}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1"><MapPinned className="h-3 w-3" /> Mode Validasi Lokasi</p>
              <p>{LOCATION_MODE_LABEL[site.locationValidationMode || 'hybrid']}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Minimal Jam Kerja</p>
              <p>{site.minimumWorkMinutes ? `${site.minimumWorkMinutes} menit` : '-'}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AttendanceSettingsClient() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const { emptyStateMessage, isConfigured, isSuperAdmin } = useHrdScopeContext();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [selectedSite, setSelectedSite] = useState<AttendanceSite | null>(null);

  // attendance_sites is intentionally read unscoped here — Firestore rules
  // (hrdCanAccessSiteData) already filter the result set down to sites whose
  // brandIds intersect this HRD's allowedBrandIds (or everything for Super
  // Admin), so a client-side brandId "in" query isn't needed for this
  // collection. `brands` IS scoped client-side via useHrdScopedBrands so the
  // create/edit dropdown only ever offers brands this HRD actually holds.
  const { data: sites, isLoading: isLoadingSites } = useCollection<AttendanceSite>(
    useMemoFirebase(() => collection(firestore, 'attendance_sites'), [firestore])
  );
  const { data: brands, isLoading: isLoadingBrands } = useHrdScopedBrands();

  const brandMap = useMemo(() => {
    if (!brands) return new Map<string, string>();
    return new Map(brands.map((brand: Brand) => [brand.id!, brand.name]));
  }, [brands]);

  const handleCreate = () => {
    setSelectedSite(null);
    setIsFormOpen(true);
  };

  const handleEdit = (site: AttendanceSite) => {
    setSelectedSite(site);
    setIsFormOpen(true);
  };

  const handleDelete = (site: AttendanceSite) => {
    setSelectedSite(site);
    setIsDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!selectedSite?.id) return;
    try {
      await deleteDocumentNonBlocking(doc(firestore, 'attendance_sites', selectedSite.id));
      toast({ title: 'Site Deleted', description: `Site "${selectedSite.name}" has been removed.` });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Deletion Failed', description: e.message });
    } finally {
      setIsDeleteConfirmOpen(false);
    }
  };

  if (!isSuperAdmin && isConfigured === false) {
    return (
      <Alert>
        <AlertTitle>Akses Belum Dikonfigurasi</AlertTitle>
        <AlertDescription>{emptyStateMessage}</AlertDescription>
      </Alert>
    );
  }

  const isLoading = isLoadingSites || isLoadingBrands;

  return (
    <>
      <div className="flex flex-row items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Pengaturan Situs Absensi</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isSuperAdmin
              ? 'Kelola semua lokasi kantor dan aturan absensi yang berlaku.'
              : 'Kelola lokasi kantor dan aturan absensi untuk perusahaan yang Anda pegang.'}
          </p>
        </div>
        <Button onClick={handleCreate} disabled={!isSuperAdmin && (brands?.length ?? 0) === 0}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Tambah Site Baru
        </Button>
      </div>

      {isLoading ? (
        <Card><CardContent className="p-10 flex items-center justify-center text-muted-foreground gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Memuat data site...
        </CardContent></Card>
      ) : sites && sites.length > 0 ? (
        <div className="space-y-3">
          {sites.map((site) => (
            <SiteCard
              key={site.id}
              site={site}
              brandMap={brandMap}
              onEdit={() => handleEdit(site)}
              onDelete={() => handleDelete(site)}
            />
          ))}
        </div>
      ) : (
        <Card><CardContent className="p-10 text-center text-muted-foreground">
          Belum ada situs yang dikonfigurasi.
        </CardContent></Card>
      )}

      <AttendanceSiteFormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        site={selectedSite}
        brands={brands || []}
      />

      <DeleteConfirmationDialog
        open={isDeleteConfirmOpen}
        onOpenChange={setIsDeleteConfirmOpen}
        onConfirm={confirmDelete}
        itemName={selectedSite?.name}
        itemType="Attendance Site"
      />
    </>
  );
}
