'use client';

import { useState } from 'react';
import type { LandingSection } from '@/lib/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

interface EcosystemCompaniesSectionFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  section: LandingSection;
  onSave: (data: Partial<LandingSection>) => void;
}

export function EcosystemCompaniesSectionFormDialog({
  isOpen,
  onClose,
  section,
  onSave,
}: EcosystemCompaniesSectionFormDialogProps) {
  const { toast } = useToast();
  const [formData, setFormData] = useState<Partial<LandingSection>>(section);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, title: e.target.value }));
  };

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setFormData((prev) => ({ ...prev, description: e.target.value }));
  };

  const handleSave = () => {
    if (!formData.title?.trim()) {
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: 'Judul tidak boleh kosong.',
      });
      return;
    }

    onSave(formData);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Ecosystem Companies Section</DialogTitle>
          <DialogDescription>
            Bagian yang menampilkan perusahaan dalam ekosistem Environesia seperti PT Environesia Global Saraya, Greenlab, Bikin.co, dan lainnya.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current Content Preview */}
          <div className="bg-muted p-3 rounded text-sm">
            <p className="font-medium mb-2">Konten saat ini di landing page:</p>
            <p>Judul: "{section.title}"</p>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Judul Section</Label>
            <Input
              id="title"
              value={formData.title || ''}
              onChange={handleTitleChange}
              placeholder="Perusahaan dalam Ekosistem Kami"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Deskripsi</Label>
            <Textarea
              id="description"
              value={formData.description || ''}
              onChange={handleDescriptionChange}
              placeholder="Bagian dari satu tujuan yang sama..."
              rows={3}
            />
          </div>

          <div className="bg-amber-50 border border-amber-200 p-3 rounded text-sm">
            <p className="text-amber-900">ℹ️ <span className="font-medium">Catatan:</span> Data perusahaan otomatis dari tab <strong>Companies / Ecosystem Companies</strong>. Section ini hanya untuk mengedit judul dan deskripsi.</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
