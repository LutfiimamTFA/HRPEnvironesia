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

interface WhyEnvironesiaFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  section: LandingSection;
  onSave: (data: Partial<LandingSection>) => void;
}

export function WhyEnvironesiaFormDialog({
  isOpen,
  onClose,
  section,
  onSave,
}: WhyEnvironesiaFormDialogProps) {
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
          <DialogTitle>Edit Why Environesia Section</DialogTitle>
          <DialogDescription>
            Bagian alasan kenapa kandidat perlu bergabung dengan Environesia. Biasanya berisi 4 benefit/value utama.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current Content Preview */}
          <div className="bg-muted p-3 rounded text-sm">
            <p className="font-medium mb-2">Konten saat ini di landing page:</p>
            <p>Judul: "{section.title}"</p>
            <p>Deskripsi: "{section.description?.substring(0, 80)}..."</p>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Judul Section</Label>
            <Input
              id="title"
              value={formData.title || ''}
              onChange={handleTitleChange}
              placeholder="Mengapa Environesia?"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Deskripsi</Label>
            <Textarea
              id="description"
              value={formData.description || ''}
              onChange={handleDescriptionChange}
              placeholder="Kami lebih dari sekadar tempat kerja..."
              rows={3}
            />
          </div>

          <div className="bg-blue-50 border border-blue-200 p-3 rounded text-sm">
            <p className="text-blue-900">💡 <span className="font-medium">Catatan:</span> Benefit items (4 nilai utama) tetap di-manage melalui data Firestore document. Edit collection jika perlu ubah list benefit-nya.</p>
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
