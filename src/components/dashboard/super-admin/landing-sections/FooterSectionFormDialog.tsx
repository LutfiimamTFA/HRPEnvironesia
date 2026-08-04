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

interface FooterSectionFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  section: LandingSection;
  onSave: (data: Partial<LandingSection>) => void;
}

export function FooterSectionFormDialog({
  isOpen,
  onClose,
  section,
  onSave,
}: FooterSectionFormDialogProps) {
  const { toast } = useToast();
  const [formData, setFormData] = useState<Partial<LandingSection>>(section);

  const handleBrandTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, brandText: e.target.value }));
  };

  const handleTaglineChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, tagline: e.target.value }));
  };

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setFormData((prev) => ({ ...prev, description: e.target.value }));
  };

  const handleSave = () => {
    if (!formData.brandText?.trim()) {
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: 'Brand text tidak boleh kosong.',
      });
      return;
    }

    onSave(formData);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Footer Section</DialogTitle>
          <DialogDescription>
            Bagian paling bawah website yang berisi brand, tagline, navigasi, dan copyright.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current Content Preview */}
          <div className="bg-muted p-3 rounded text-sm">
            <p className="font-medium mb-2">Konten saat ini di landing page:</p>
            <p>Brand: "{section.brandText}"</p>
            <p>Tagline: "{section.tagline}"</p>
          </div>

          {/* Brand Text */}
          <div className="space-y-2">
            <Label htmlFor="brandText">Brand / Company Name</Label>
            <Input
              id="brandText"
              value={formData.brandText || ''}
              onChange={handleBrandTextChange}
              placeholder="Environesia Vacancies"
            />
          </div>

          {/* Tagline */}
          <div className="space-y-2">
            <Label htmlFor="tagline">Tagline / Motto</Label>
            <Input
              id="tagline"
              value={formData.tagline || ''}
              onChange={handleTaglineChange}
              placeholder="Membangun karier, menjaga bumi."
            />
          </div>

          {/* Description / Copyright */}
          <div className="space-y-2">
            <Label htmlFor="description">Deskripsi / Copyright Text</Label>
            <Textarea
              id="description"
              value={formData.description || ''}
              onChange={handleDescriptionChange}
              placeholder="© 2026 Environesia. All Rights Reserved."
              rows={2}
            />
          </div>

          <div className="bg-blue-50 border border-blue-200 p-3 rounded text-sm">
            <p className="text-blue-900">💡 <span className="font-medium">Catatan:</span> Link navigasi footer masih di-manage melalui hardcode. Jika ingin ubah footer links, edit langsung di file landing page.</p>
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
