'use client';

import { useState } from 'react';
import type { LandingSection, LandingFAQItem } from '@/lib/types';
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

interface FAQSectionFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  section: LandingSection;
  onSave: (data: Partial<LandingSection>) => void;
}

export function FAQSectionFormDialog({
  isOpen,
  onClose,
  section,
  onSave,
}: FAQSectionFormDialogProps) {
  const { toast } = useToast();
  const [formData, setFormData] = useState<Partial<LandingSection>>(section);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, title: e.target.value }));
  };

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setFormData((prev) => ({ ...prev, description: e.target.value }));
  };

  const handleFAQChange = (index: number, field: string, value: string) => {
    const updatedFAQs = [...(formData.faqItems || [])];
    updatedFAQs[index] = { ...updatedFAQs[index], [field]: value };
    setFormData((prev) => ({ ...prev, faqItems: updatedFAQs }));
  };

  const handleAddFAQ = () => {
    const newFAQ: LandingFAQItem = {
      id: `faq-${Date.now()}`,
      question: '',
      answer: '',
      order: (formData.faqItems?.length || 0) + 1,
      isActive: true,
    };
    setFormData((prev) => ({
      ...prev,
      faqItems: [...(prev.faqItems || []), newFAQ],
    }));
  };

  const handleRemoveFAQ = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      faqItems: prev.faqItems?.filter((_, i) => i !== index),
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
          <DialogTitle>Edit FAQ Section</DialogTitle>
          <DialogDescription>
            Bagian pertanyaan umum seputar proses lamaran kerja di Environesia.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current Content Preview */}
          <div className="bg-muted p-3 rounded text-sm">
            <p className="font-medium mb-2">Konten saat ini di landing page:</p>
            <p>Judul: "{section.title}"</p>
            <p>Total FAQ: {section.faqItems?.length || 0} item</p>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Judul Section</Label>
            <Input
              id="title"
              value={formData.title || ''}
              onChange={handleTitleChange}
              placeholder="Pertanyaan Umum (FAQ)"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Deskripsi</Label>
            <Textarea
              id="description"
              value={formData.description || ''}
              onChange={handleDescriptionChange}
              placeholder="Jawaban atas pertanyaan umum..."
              rows={2}
            />
          </div>

          {/* FAQ Items */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label>Daftar FAQ</Label>
              <Button size="sm" variant="outline" onClick={handleAddFAQ}>
                <Plus className="h-4 w-4 mr-1" />
                Tambah FAQ
              </Button>
            </div>

            {formData.faqItems?.map((faq, index) => (
              <div key={faq.id} className="border p-3 rounded space-y-2">
                <div className="space-y-1">
                  <Label className="text-xs">Pertanyaan {index + 1}</Label>
                  <Input
                    value={faq.question}
                    onChange={(e) => handleFAQChange(index, 'question', e.target.value)}
                    placeholder="Pertanyaan..."
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Jawaban</Label>
                  <Textarea
                    value={faq.answer}
                    onChange={(e) => handleFAQChange(index, 'answer', e.target.value)}
                    placeholder="Jawaban..."
                    rows={2}
                  />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Urutan: {faq.order}</span>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleRemoveFAQ(index)}
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
