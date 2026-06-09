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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { uploadFile } from '@/lib/storage/storage-adapter';

interface BasecampSectionFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  section: LandingSection;
  onSave: (data: Partial<LandingSection>) => void;
}

export function BasecampSectionFormDialog({
  isOpen,
  onClose,
  section,
  onSave,
}: BasecampSectionFormDialogProps) {
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

  const handleSelectChange = (name: string, value: string) => {
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
        'landing_sections/basecamp',
        userProfile.uid,
        { category: 'section_asset' }
      );
      if (result.downloadUrl) {
        setFormData((prev) => ({
          ...prev,
          imageUrl: result.downloadUrl,
        }));
        toast({
          title: 'Image Uploaded',
          description: 'Section image has been uploaded successfully.',
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

    onSave(formData);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Basecamp Section</DialogTitle>
          <DialogDescription>
            Bagian ini adalah banner gambar besar dengan latar basecamp/kantor pusat. Biasanya muncul setelah proses rekrutmen.
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
              name="title"
              value={formData.title || ''}
              onChange={handleInputChange}
              placeholder="Basecamp Environesia"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Deskripsi</Label>
            <Textarea
              id="description"
              name="description"
              value={formData.description || ''}
              onChange={handleInputChange}
              placeholder="Tempat ide-idea hebat lahir..."
              rows={3}
            />
          </div>

          {/* Image Upload */}
          <div className="space-y-2">
            <Label htmlFor="imageUpload">Gambar Section</Label>
            <Input
              id="imageUpload"
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              disabled={isUploading}
            />
            {formData.imageUrl && (
              <p className="text-sm text-muted-foreground">✓ Gambar sudah di-upload</p>
            )}
          </div>

          {/* Overlay Mode */}
          <div className="space-y-2">
            <Label htmlFor="overlayMode">Mode Overlay</Label>
            <Select
              value={formData.overlayMode || 'dark'}
              onValueChange={(value) => handleSelectChange('overlayMode', value)}
            >
              <SelectTrigger id="overlayMode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="none">None</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Text Position */}
          <div className="space-y-2">
            <Label htmlFor="textPosition">Posisi Teks</Label>
            <Select
              value={formData.textPosition || 'left'}
              onValueChange={(value) => handleSelectChange('textPosition', value)}
            >
              <SelectTrigger id="textPosition">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Kiri</SelectItem>
                <SelectItem value="center">Tengah</SelectItem>
                <SelectItem value="right">Kanan</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Optional Button */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="buttonText">Teks Tombol (Opsional)</Label>
              <Input
                id="buttonText"
                name="buttonText"
                value={formData.buttonText || ''}
                onChange={handleInputChange}
                placeholder=""
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="buttonUrl">Link Tombol (Opsional)</Label>
              <Input
                id="buttonUrl"
                name="buttonUrl"
                value={formData.buttonUrl || ''}
                onChange={handleInputChange}
                placeholder=""
              />
            </div>
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
