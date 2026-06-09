'use client';

import { useState } from 'react';
import { useAuth } from '@/providers/auth-provider';
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
import { uploadFile } from '@/lib/storage/storage-adapter';

interface HeroSectionFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  section: LandingSection;
  onSave: (data: Partial<LandingSection>) => void;
}

export function HeroSectionFormDialog({
  isOpen,
  onClose,
  section,
  onSave,
}: HeroSectionFormDialogProps) {
  const { toast } = useToast();
  const { userProfile } = useAuth();
  const [formData, setFormData] = useState<Partial<LandingSection>>(section);
  const [isUploading, setIsUploading] = useState(false);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!userProfile?.uid) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'User not authenticated.',
      });
      return;
    }

    try {
      setIsUploading(true);
      const result = await uploadFile(
        file,
        'landing_sections/hero',
        userProfile.uid,
        { category: 'section_asset' }
      );
      if (result.downloadUrl) {
        setFormData((prev) => ({
          ...prev,
          backgroundImageUrl: result.downloadUrl,
        }));
        toast({
          title: 'Image Uploaded',
          description: 'Background image has been uploaded successfully.',
        });
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Upload Failed',
        description: error.message,
      });
    } finally {
      setIsUploading(false);
    }
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

    // Auto-set button links ke default (tidak boleh diubah admin)
    const dataToSave = {
      ...formData,
      primaryButtonUrl: formData.primaryButtonUrl || '#lowongan',
      secondaryButtonUrl: formData.secondaryButtonUrl || '/careers/register',
    };

    onSave(dataToSave);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Hero Section</DialogTitle>
          <DialogDescription>
            Bagian ini adalah banner utama landing page dengan judul besar, deskripsi, dan tombol CTA.
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
            <Label htmlFor="title">Judul Besar (Hero Title)</Label>
            <Input
              id="title"
              name="title"
              value={formData.title || ''}
              onChange={handleInputChange}
              placeholder="Mari Buat Perubahan Bersama Kami"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Deskripsi / Subtitle</Label>
            <Textarea
              id="description"
              name="description"
              value={formData.description || ''}
              onChange={handleInputChange}
              placeholder="Jadilah bagian dari tim inovatif..."
              rows={3}
            />
          </div>

          {/* Primary Button Text */}
          <div className="space-y-2">
            <Label htmlFor="primaryButtonText">Teks Tombol Utama</Label>
            <Input
              id="primaryButtonText"
              name="primaryButtonText"
              value={formData.primaryButtonText || ''}
              onChange={handleInputChange}
              placeholder="Lihat Lowongan"
            />
            <p className="text-xs text-muted-foreground mt-1">
              💡 Admin hanya mengubah nama tombol. Arah tombol sudah diatur otomatis oleh sistem.
            </p>
          </div>

          {/* Secondary Button Text */}
          <div className="space-y-2">
            <Label htmlFor="secondaryButtonText">Teks Tombol Kedua</Label>
            <Input
              id="secondaryButtonText"
              name="secondaryButtonText"
              value={formData.secondaryButtonText || ''}
              onChange={handleInputChange}
              placeholder="Kirim Lamaran Cepat"
            />
            <p className="text-xs text-muted-foreground mt-1">
              💡 Admin hanya mengubah nama tombol. Arah tombol sudah diatur otomatis oleh sistem.
            </p>
          </div>

          {/* Background Image */}
          <div className="space-y-2">
            <Label htmlFor="backgroundImage">Background Image</Label>
            <Input
              id="backgroundImage"
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              disabled={isUploading}
            />
            {formData.backgroundImageUrl && (
              <p className="text-sm text-muted-foreground">✓ Gambar sudah di-upload</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isUploading}>
            {isUploading ? 'Uploading...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
