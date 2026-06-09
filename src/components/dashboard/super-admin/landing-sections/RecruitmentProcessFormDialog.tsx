'use client';

import { useState } from 'react';
import type { LandingSection, LandingRecruitmentStep } from '@/lib/types';
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
import { Plus, Trash2 } from 'lucide-react';

interface RecruitmentProcessFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  section: LandingSection;
  onSave: (data: Partial<LandingSection>) => void;
}

export function RecruitmentProcessFormDialog({
  isOpen,
  onClose,
  section,
  onSave,
}: RecruitmentProcessFormDialogProps) {
  const { toast } = useToast();
  const [formData, setFormData] = useState<Partial<LandingSection>>(section);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, title: e.target.value }));
  };

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setFormData((prev) => ({ ...prev, description: e.target.value }));
  };

  const handleStepChange = (index: number, field: string, value: string | number) => {
    const updatedSteps = [...(formData.steps || [])];
    updatedSteps[index] = { ...updatedSteps[index], [field]: value };
    setFormData((prev) => ({ ...prev, steps: updatedSteps }));
  };

  const handleAddStep = () => {
    const newStep: LandingRecruitmentStep = {
      id: `step-${Date.now()}`,
      title: '',
      description: '',
      order: (formData.steps?.length || 0) + 1,
      isActive: true,
    };
    setFormData((prev) => ({
      ...prev,
      steps: [...(prev.steps || []), newStep],
    }));
  };

  const handleRemoveStep = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      steps: prev.steps?.filter((_, i) => i !== index),
    }));
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
          <DialogTitle>Edit Recruitment Process Section</DialogTitle>
          <DialogDescription>
            Bagian timeline proses rekrutmen dari daftar online sampai tawaran kerja.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current Content Preview */}
          <div className="bg-muted p-3 rounded text-sm">
            <p className="font-medium mb-2">Konten saat ini di landing page:</p>
            <p>Judul: "{section.title}"</p>
            <p>Total Step: {section.steps?.length || 0}</p>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Judul Section</Label>
            <Input
              id="title"
              value={formData.title || ''}
              onChange={handleTitleChange}
              placeholder="Proses Rekrutmen Kami"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Deskripsi</Label>
            <Textarea
              id="description"
              value={formData.description || ''}
              onChange={handleDescriptionChange}
              placeholder="Kami merancang proses yang adil..."
              rows={2}
            />
          </div>

          {/* Steps */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label>Tahapan Proses</Label>
              <Button size="sm" variant="outline" onClick={handleAddStep}>
                <Plus className="h-4 w-4 mr-1" />
                Tambah Tahap
              </Button>
            </div>

            {formData.steps?.map((step, index) => (
              <div key={step.id} className="border p-3 rounded space-y-2">
                <div className="space-y-1">
                  <Label className="text-xs">Tahap {index + 1}</Label>
                  <Input
                    value={step.title}
                    onChange={(e) => handleStepChange(index, 'title', e.target.value)}
                    placeholder="Judul Tahap..."
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Deskripsi</Label>
                  <Textarea
                    value={step.description}
                    onChange={(e) => handleStepChange(index, 'description', e.target.value)}
                    placeholder="Deskripsi tahap..."
                    rows={2}
                  />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Urutan: {step.order}</span>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleRemoveStep(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
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
