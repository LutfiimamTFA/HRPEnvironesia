'use client';

import { useState, useMemo } from 'react';
import { useCollection, useFirestore, useMemoFirebase, updateDocumentNonBlocking } from '@/firebase';
import { collection, query, doc, orderBy, setDoc } from 'firebase/firestore';
import type { LandingSection } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Pencil, Eye, EyeOff, AlertCircle, Plus, Zap } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { HeroSectionFormDialog } from './landing-sections/HeroSectionFormDialog';
import { BasecampSectionFormDialog } from './landing-sections/BasecampSectionFormDialog';
import { FAQSectionFormDialog } from './landing-sections/FAQSectionFormDialog';
import { RecruitmentProcessFormDialog } from './landing-sections/RecruitmentProcessFormDialog';
import { WhyEnvironesiaFormDialog } from './landing-sections/WhyEnvironesiaFormDialog';
import { JobsSectionFormDialog } from './landing-sections/JobsSectionFormDialog';
import { HowToApplySectionFormDialog } from './landing-sections/HowToApplySectionFormDialog';
import { EcosystemCompaniesSectionFormDialog } from './landing-sections/EcosystemCompaniesSectionFormDialog';
import { FooterSectionFormDialog } from './landing-sections/FooterSectionFormDialog';

// Default system sections - fallback jika Firestore kosong
const DEFAULT_LANDING_SECTIONS: Partial<LandingSection>[] = [
  {
    id: 'hero',
    sectionKey: 'hero',
    title: 'Mari Buat Perubahan Bersama Kami',
    description: 'Bagian paling atas landing page, berisi headline besar, deskripsi singkat, tombol Lihat Lowongan, dan tombol Kirim Lamaran Cepat.',
    order: 1,
    isSystem: true,
    isActive: true,
    isDeletable: false,
    isEditable: true,
  },
  {
    id: 'jobs',
    sectionKey: 'jobs',
    title: 'Temukan Peluang Anda',
    description: 'Bagian daftar lowongan kerja. Data otomatis dari menu Lowongan Kerja, hanya edit judul dan deskripsi section di sini.',
    order: 2,
    isSystem: true,
    isActive: true,
    isDeletable: false,
    isEditable: true,
  },
  {
    id: 'why_environesia',
    sectionKey: 'why_environesia',
    title: 'Mengapa Environesia?',
    description: 'Bagian alasan kenapa bergabung dengan Environesia. Berisi 4 benefit/value utama.',
    order: 3,
    isSystem: true,
    isActive: true,
    isDeletable: false,
    isEditable: true,
  },
  {
    id: 'ecosystem_companies',
    sectionKey: 'ecosystem_companies',
    title: 'Perusahaan dalam Ekosistem Kami',
    description: 'Bagian perusahaan dalam ekosistem Environesia. Data otomatis dari Companies, hanya edit judul dan deskripsi.',
    order: 4,
    isSystem: true,
    isActive: true,
    isDeletable: false,
    isEditable: true,
  },
  {
    id: 'recruitment_process',
    sectionKey: 'recruitment_process',
    title: 'Proses Rekrutmen Kami',
    description: 'Bagian timeline proses rekrutmen dari daftar online sampai tawaran kerja.',
    order: 5,
    isSystem: true,
    isActive: true,
    isDeletable: false,
    isEditable: true,
  },
  {
    id: 'basecamp',
    sectionKey: 'basecamp',
    title: 'Basecamp Environesia',
    description: 'Bagian banner gambar besar dengan latar basecamp. Muncul setelah proses rekrutmen.',
    order: 6,
    isSystem: true,
    isActive: true,
    isDeletable: false,
    isEditable: true,
  },
  {
    id: 'how_to_apply',
    sectionKey: 'how_to_apply',
    title: 'Cara Mudah Melamar',
    description: 'Bagian instruksi cara melamar dengan 4 langkah mudah.',
    order: 7,
    isSystem: true,
    isActive: true,
    isDeletable: false,
    isEditable: true,
  },
  {
    id: 'faq',
    sectionKey: 'faq',
    title: 'Pertanyaan Umum (FAQ)',
    description: 'Bagian pertanyaan umum seputar proses lamaran kerja.',
    order: 8,
    isSystem: true,
    isActive: true,
    isDeletable: false,
    isEditable: true,
  },
  {
    id: 'footer',
    sectionKey: 'footer',
    title: 'Environesia Vacancies',
    description: 'Bagian paling bawah website dengan brand, tagline, navigasi, dan copyright.',
    order: 9,
    isSystem: true,
    isActive: true,
    isDeletable: false,
    isEditable: true,
  },
];

function SectionCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-48 mb-2" />
        <Skeleton className="h-4 w-full" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-20 w-full" />
      </CardContent>
    </Card>
  );
}

interface SectionCardProps {
  section: Partial<LandingSection>;
  onEdit: (section: Partial<LandingSection>) => void;
  onToggleActive: (section: Partial<LandingSection>) => void;
  isSynced?: boolean;
}

function SectionCard({ section, onEdit, onToggleActive, isSynced }: SectionCardProps) {
  return (
    <Card className="relative">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <CardTitle className="text-lg">{section.title}</CardTitle>
              <Badge variant="secondary" className="text-xs">System Section</Badge>
              {!section.isActive && <Badge variant="destructive" className="text-xs">Tidak Aktif</Badge>}
              {!isSynced && <Badge variant="outline" className="text-xs bg-amber-50">Default</Badge>}
            </div>
            <CardDescription className="text-sm mb-3">{section.description}</CardDescription>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onToggleActive(section)}
              title={section.isActive ? 'Sembunyikan' : 'Tampilkan'}
            >
              {section.isActive ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => onEdit(section)}
            >
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="bg-muted p-3 rounded text-sm">
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">Judul:</span> "{section.title}"
          </p>
          {section.description && (
            <p className="text-xs text-muted-foreground mt-1">
              <span className="font-medium text-foreground">Deskripsi:</span> {section.description?.substring(0, 100)}...
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function LandingSectionsClient() {
  const firestore = useFirestore();
  const { toast } = useToast();

  const [editingSection, setEditingSection] = useState<Partial<LandingSection> | null>(null);
  const [activeDialog, setActiveDialog] = useState<string | null>(null);
  const [isGeneratingDefaults, setIsGeneratingDefaults] = useState(false);

  const sectionsQuery = useMemoFirebase(
    () => query(collection(firestore, 'landing_sections'), orderBy('order')),
    [firestore]
  );
  const { data: firestoreSections, isLoading, error, mutate } = useCollection<LandingSection>(sectionsQuery);

  // Merge Firestore sections dengan defaults
  const sections = useMemo(() => {
    if (!firestoreSections || firestoreSections.length === 0) {
      // Jika Firestore kosong, pakai defaults
      return DEFAULT_LANDING_SECTIONS;
    }

    // Merge dengan defaults untuk ensure semua section ada
    const firestoreMap = new Map(firestoreSections.map(s => [s.sectionKey, s]));
    return DEFAULT_LANDING_SECTIONS.map(defaultSection => {
      const firestoreSection = firestoreMap.get(defaultSection.sectionKey as any);
      return firestoreSection || defaultSection;
    });
  }, [firestoreSections]);

  const handleEdit = (section: Partial<LandingSection>) => {
    setEditingSection(section);
    setActiveDialog(section.sectionKey as string);
  };

  const handleToggleActive = async (section: Partial<LandingSection>) => {
    if (!section.id) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Section ID not found.',
      });
      return;
    }

    try {
      await updateDocumentNonBlocking(
        doc(firestore, 'landing_sections', section.id),
        { isActive: !section.isActive, updatedAt: new Date() }
      );
      toast({
        title: 'Status Updated',
        description: `"${section.title}" is now ${!section.isActive ? 'visible' : 'hidden'}.`,
      });
      mutate();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Update Failed', description: e.message });
    }
  };

  const handleSaveSection = async (updatedData: Partial<LandingSection>) => {
    if (!editingSection?.id) return;
    try {
      await updateDocumentNonBlocking(
        doc(firestore, 'landing_sections', editingSection.id),
        {
          ...updatedData,
          updatedAt: new Date(),
        }
      );
      toast({
        title: 'Section Updated',
        description: `"${updatedData.title || editingSection.title}" has been saved.`,
      });
      setActiveDialog(null);
      setEditingSection(null);
      mutate();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Save Failed', description: e.message });
    }
  };

  const handleGenerateDefaults = async () => {
    setIsGeneratingDefaults(true);
    try {
      const now = new Date();
      for (const defaultSection of DEFAULT_LANDING_SECTIONS) {
        const docId = defaultSection.sectionKey as string;
        await setDoc(
          doc(firestore, 'landing_sections', docId),
          {
            ...defaultSection,
            id: docId,
            createdAt: now,
            updatedAt: now,
            createdBy: 'admin-manual-sync',
          }
        );
      }
      toast({
        title: 'Defaults Generated',
        description: 'All default sections have been created in Firestore.',
      });
      mutate();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Generation Failed', description: e.message });
    } finally {
      setIsGeneratingDefaults(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4">
          {[...Array(3)].map((_, i) => (
            <SectionCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error Loading Sections</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  const isFirestoreEmpty = !firestoreSections || firestoreSections.length === 0;

  return (
    <>
      <div className="space-y-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Section Bawaan Landing Page Careers</AlertTitle>
          <AlertDescription>
            Section berikut adalah bagian utama landing page careers. Anda dapat mengubah konten sesuai kebutuhan.
          </AlertDescription>
        </Alert>

        {isFirestoreEmpty && (
          <Alert className="bg-amber-50 border-amber-200">
            <Zap className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-900">Default Sections Loaded</AlertTitle>
            <AlertDescription className="text-amber-800">
              Data section masih menggunakan default. Klik "Generate Default Sections" untuk menyimpan ke Firestore dan mulai editing.
            </AlertDescription>
            <Button
              onClick={handleGenerateDefaults}
              disabled={isGeneratingDefaults}
              className="mt-3"
              size="sm"
            >
              <Zap className="h-4 w-4 mr-2" />
              {isGeneratingDefaults ? 'Generating...' : 'Generate Default Sections'}
            </Button>
          </Alert>
        )}

        <div className="space-y-4">
          {sections.map((section) => {
            const isSynced = firestoreSections?.some(fs => fs.sectionKey === section.sectionKey);
            return (
              <SectionCard
                key={section.sectionKey}
                section={section}
                onEdit={handleEdit}
                onToggleActive={handleToggleActive}
                isSynced={isSynced}
              />
            );
          })}
        </div>

        <div className="flex justify-end">
          <Button variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Custom Section
          </Button>
        </div>

        {/* Form Dialogs */}
        {editingSection?.sectionKey === 'hero' && (
          <HeroSectionFormDialog
            isOpen={activeDialog === 'hero'}
            onClose={() => setActiveDialog(null)}
            section={editingSection as LandingSection}
            onSave={handleSaveSection}
          />
        )}

        {editingSection?.sectionKey === 'basecamp' && (
          <BasecampSectionFormDialog
            isOpen={activeDialog === 'basecamp'}
            onClose={() => setActiveDialog(null)}
            section={editingSection as LandingSection}
            onSave={handleSaveSection}
          />
        )}

        {editingSection?.sectionKey === 'faq' && (
          <FAQSectionFormDialog
            isOpen={activeDialog === 'faq'}
            onClose={() => setActiveDialog(null)}
            section={editingSection as LandingSection}
            onSave={handleSaveSection}
          />
        )}

        {editingSection?.sectionKey === 'recruitment_process' && (
          <RecruitmentProcessFormDialog
            isOpen={activeDialog === 'recruitment_process'}
            onClose={() => setActiveDialog(null)}
            section={editingSection as LandingSection}
            onSave={handleSaveSection}
          />
        )}

        {editingSection?.sectionKey === 'why_environesia' && (
          <WhyEnvironesiaFormDialog
            isOpen={activeDialog === 'why_environesia'}
            onClose={() => setActiveDialog(null)}
            section={editingSection as LandingSection}
            onSave={handleSaveSection}
          />
        )}

        {editingSection?.sectionKey === 'jobs' && (
          <JobsSectionFormDialog
            isOpen={activeDialog === 'jobs'}
            onClose={() => setActiveDialog(null)}
            section={editingSection as LandingSection}
            onSave={handleSaveSection}
          />
        )}

        {editingSection?.sectionKey === 'how_to_apply' && (
          <HowToApplySectionFormDialog
            isOpen={activeDialog === 'how_to_apply'}
            onClose={() => setActiveDialog(null)}
            section={editingSection as LandingSection}
            onSave={handleSaveSection}
          />
        )}

        {editingSection?.sectionKey === 'ecosystem_companies' && (
          <EcosystemCompaniesSectionFormDialog
            isOpen={activeDialog === 'ecosystem_companies'}
            onClose={() => setActiveDialog(null)}
            section={editingSection as LandingSection}
            onSave={handleSaveSection}
          />
        )}

        {editingSection?.sectionKey === 'footer' && (
          <FooterSectionFormDialog
            isOpen={activeDialog === 'footer'}
            onClose={() => setActiveDialog(null)}
            section={editingSection as LandingSection}
            onSave={handleSaveSection}
          />
        )}
      </div>
    </>
  );
}
