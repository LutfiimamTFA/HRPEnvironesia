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

interface HowToApplySectionFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  section: LandingSection;
  onSave: (data: Partial<LandingSection>) => void;
}

export function HowToApplySectionFormDialog({
  isOpen,
  onClose,
  section,
  onSave,
}: HowToApplySectionFormDialogProps) {
  const { toast } = useToast();
  const [formData, setFormData] = useState<Partial<LandingSection>>(section);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, title: e.target.value }));
  };

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setFormData((prev) => ({ ...prev, description: e.target.value }));
  };

  const handleCTATextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, buttonText: e.target.value }));
  };

  const handleCTAUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, buttonUrl: e.target.value }));
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
          <DialogTitle>Edit How to Apply Section</DialogTitle>
          <DialogDescription>
            Bagian instruksi singkat cara kandidat melamar pekerjaan dengan 4 langkah mudah.
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
              placeholder="Cara Mudah Melamar"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Deskripsi</Label>
            <Textarea
              id="description"
              value={formData.description || ''}
              onChange={handleDescriptionChange}
              placeholder="Ikuti langkah-langkah sederhana ini..."
              rows={3}
            />
          </div>

          {/* CTA Button */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="buttonText">Teks Tombol CTA</Label>
              <Input
                id="buttonText"
                value={formData.buttonText || ''}
                onChange={handleCTATextChange}
                placeholder="Daftar Akun Sekarang"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="buttonUrl">Link Tombol CTA</Label>
              <Input
                id="buttonUrl"
                value={formData.buttonUrl || ''}
                onChange={handleCTAUrlChange}
                placeholder="/careers/register"
              />
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 p-3 rounded text-sm">
            <p className="text-blue-900">💡 <span className="font-medium">Catatan:</span> 4 langkah melamar tetap di-manage melalui Firestore document. Edit jika perlu ubah langkah-langkah.</p>
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
