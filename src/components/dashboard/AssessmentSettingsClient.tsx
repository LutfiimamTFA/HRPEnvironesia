'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Loader2, Save } from 'lucide-react';
import type { AssessmentConfig } from '@/lib/types';
import { useFirestore, setDocumentNonBlocking } from '@/firebase';
import { doc, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

const settingsSchema = z.object({
  bigfiveCount: z.number().int().min(10, 'Minimal 10 soal').max(100, 'Maksimal 100 soal'),
  discCount: z.number().int().min(10, 'Minimal 10 soal').max(100, 'Maksimal 100 soal'),
  forcedChoiceCount: z.number().int().min(10, 'Minimal 10 soal').max(100, 'Maksimal 100 soal'),
});

type FormValues = z.infer<typeof settingsSchema>;

interface AssessmentSettingsClientProps {
  config: AssessmentConfig | undefined;
}

export function AssessmentSettingsClient({ config }: AssessmentSettingsClientProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      bigfiveCount: config?.bigfiveCount || 30,
      discCount: config?.discCount || 20,
      forcedChoiceCount: config?.forcedChoiceCount || 20,
    },
  });

  useEffect(() => {
    if (config) {
      form.reset({
        bigfiveCount: config.bigfiveCount || 30,
        discCount: config.discCount || 20,
        forcedChoiceCount: config.forcedChoiceCount || 20,
      });
    }
  }, [config, form]);

  const onSubmit = async (values: FormValues) => {
    setIsSaving(true);
    try {
      const configRef = doc(firestore, 'assessment_config', 'main');
      await setDocumentNonBlocking(configRef, {
        ...values,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      toast({ title: 'Pengaturan Disimpan', description: 'Jumlah soal untuk tes telah diperbarui.' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Gagal Menyimpan', description: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pengaturan Tes Kepribadian</CardTitle>
        <CardDescription>
          Atur jumlah pertanyaan yang akan diberikan kepada kandidat untuk setiap bagian tes. Soal akan dipilih secara acak dari bank soal.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <FormField
              control={form.control}
              name="bigfiveCount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Jumlah Soal Likert (Big Five)</FormLabel>
                  <FormControl>
                    <div className="flex items-center gap-4">
                      <Slider
                        min={10}
                        max={100}
                        step={5}
                        value={[isNaN(field.value) ? 10 : field.value]}
                        onValueChange={(vals) => field.onChange(vals[0])}
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        min={10}
                        max={100}
                        value={isNaN(field.value) ? '' : field.value}
                        onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
                        className="w-20"
                      />
                    </div>
                  </FormControl>
                   <FormDescription>Pilih antara 10 dan 100 soal.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="discCount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Jumlah Soal Likert (DISC)</FormLabel>
                   <FormControl>
                    <div className="flex items-center gap-4">
                      <Slider
                        min={10}
                        max={100}
                        step={5}
                        value={[isNaN(field.value) ? 10 : field.value]}
                        onValueChange={(vals) => field.onChange(vals[0])}
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        min={10}
                        max={100}
                        value={isNaN(field.value) ? '' : field.value}
                        onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
                        className="w-20"
                      />
                    </div>
                  </FormControl>
                  <FormDescription>Pilih antara 10 dan 100 soal.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField
              control={form.control}
              name="forcedChoiceCount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Jumlah Soal Forced-Choice</FormLabel>
                   <FormControl>
                    <div className="flex items-center gap-4">
                      <Slider
                        min={10}
                        max={100}
                        step={5}
                        value={[isNaN(field.value) ? 10 : field.value]}
                        onValueChange={(vals) => field.onChange(vals[0])}
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        min={10}
                        max={100}
                        value={isNaN(field.value) ? '' : field.value}
                        onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
                        className="w-20"
                      />
                    </div>
                  </FormControl>
                  <FormDescription>Pilih antara 10 dan 100 soal.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end">
              <Button type="submit" disabled={isSaving}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Save className="mr-2 h-4 w-4" />
                Simpan Pengaturan
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
