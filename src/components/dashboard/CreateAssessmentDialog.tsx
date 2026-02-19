'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { doc, collection, serverTimestamp } from 'firebase/firestore';
import { useFirestore, setDocumentNonBlocking } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import type { Assessment, AssessmentTemplate } from '@/lib/types';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';

const formSchema = z.object({
  name: z.string().min(3, { message: 'Name must be at least 3 characters long.' }),
  format: z.enum(['likert', 'forced-choice'], { required_error: 'You must select a format.' }),
});

type FormValues = z.infer<typeof formSchema>;

interface CreateAssessmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const defaultLikertTemplate: Omit<AssessmentTemplate, 'id' | 'createdAt' | 'updatedAt' | 'name'> = {
    format: 'likert',
    engine: 'dual',
    scale: { type: 'likert', points: 7, leftLabel: 'Setuju', rightLabel: 'Tidak setuju', ui: 'bubbles' },
    dimensions: {
        disc: [{ key: 'D', label: 'Dominance' }, { key: 'I', label: 'Influence' }, { key: 'S', label: 'Steadiness' }, { key: 'C', label: 'Conscientiousness' }],
        bigfive: [{ key: 'O', label: 'Openness' }, { key: 'C', label: 'Conscientiousness' }, { key: 'E', label: 'Extraversion' }, { key: 'A', label: 'Agreeableness' }, { key: 'N', label: 'Neuroticism' }]
    },
    scoring: { method: 'sum', reverseEnabled: true },
};

const defaultForcedChoiceTemplate: Omit<AssessmentTemplate, 'id' | 'createdAt' | 'updatedAt' | 'name'> = {
    ...defaultLikertTemplate,
    format: 'forced-choice',
};

const defaultResultTemplates = {
    disc: {
        D: { title: "Tipe Dominan", subtitle: "Fokus pada hasil dan tegas.", blocks: ["Anda adalah individu yang berorientasi pada tujuan dan suka mengambil inisiatif."], strengths: ["Tegas", "Berorientasi Hasil"], risks: ["Terlalu menuntut"], roleFit: ["Manajer", "Pemimpin Proyek"] },
        I: { title: "Tipe Influensial", subtitle: "Komunikatif dan persuasif.", blocks: ["Anda senang berinteraksi dengan orang lain dan pandai membangun jaringan."], strengths: ["Persuasif", "Antusias"], risks: ["Kurang detail"], roleFit: ["Sales", "Marketing", "Public Relations"] },
        S: { title: "Tipe Stabil", subtitle: "Sabar dan dapat diandalkan.", blocks: ["Anda adalah pendengar yang baik dan pemain tim yang suportif."], strengths: ["Sabar", "Dapat diandalkan"], risks: ["Menghindari konflik"], roleFit: ["HR", "Customer Service", "Staf Administrasi"] },
        C: { title: "Tipe Cermat", subtitle: "Teliti dan akurat.", blocks: ["Anda bekerja dengan standar tinggi dan menyukai proses yang terstruktur."], strengths: ["Teliti", "Akurat"], risks: ["Terlalu perfeksionis"], roleFit: ["Analis", "Akuntan", "Quality Assurance"] }
    },
    bigfive: {
        O: { highText: "Sangat terbuka terhadap pengalaman baru, imajinatif, dan kreatif.", midText: "Cukup terbuka dan memiliki keseimbangan antara ide baru dan tradisi.", lowText: "Cenderung praktis, konvensional, dan lebih menyukai hal-hal yang sudah dikenal." },
        C: { highText: "Sangat teliti, terorganisir, dan dapat diandalkan.", midText: "Cukup teliti dan bertanggung jawab.", lowText: "Cenderung lebih santai, spontan, dan kurang terstruktur." },
        E: { highText: "Sangat mudah bergaul, antusias, dan mendapatkan energi dari interaksi sosial.", midText: "Memiliki keseimbangan antara menjadi sosial dan menikmati waktu sendiri.", lowText: "Cenderung lebih pendiam, mandiri, dan lebih suka lingkungan yang tenang." },
        A: { highText: "Sangat kooperatif, berempati, dan suka membantu orang lain.", midText: "Cukup ramah dan kooperatif.", lowText: "Cenderung lebih kompetitif, analitis, dan bisa jadi skeptis." },
        N: { highText: "Sangat peka terhadap stres dan mudah merasakan emosi negatif.", midText: "Memiliki ketahanan emosional yang seimbang.", lowText: "Sangat tenang, stabil secara emosional, dan tidak mudah khawatir." }
    },
    overall: {
        interviewQuestions: [
            "Bagaimana Anda biasanya menangani tekanan atau tenggat waktu yang ketat?",
            "Ceritakan pengalaman Anda bekerja dalam sebuah tim untuk mencapai tujuan bersama."
        ]
    }
};

export function CreateAssessmentDialog({ open, onOpenChange, onSuccess }: CreateAssessmentDialogProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '', format: 'likert' },
  });

  const onSubmit = async (values: FormValues) => {
    setLoading(true);
    try {
        const now = serverTimestamp();

        // 1. Create the Assessment Template
        const templateRef = doc(collection(firestore, 'assessment_templates'));
        const templateData: Omit<AssessmentTemplate, 'id'> = {
            name: `${values.name} Template`,
            ...(values.format === 'likert' ? defaultLikertTemplate : defaultForcedChoiceTemplate),
            createdAt: now as any,
            updatedAt: now as any,
        };
        await setDocumentNonBlocking(templateRef, templateData, { merge: false });

        // 2. Create the Assessment
        const assessmentRef = doc(collection(firestore, 'assessments'));
        const assessmentData: Omit<Assessment, 'id'> = {
            name: values.name,
            templateId: templateRef.id,
            version: 1,
            isActive: true,
            publishStatus: 'draft',
            rules: {
                discRule: 'highest',
                bigfiveNormalization: 'minmax'
            },
            resultTemplates: defaultResultTemplates as any,
            createdAt: now as any,
            updatedAt: now as any,
        };
        await setDocumentNonBlocking(assessmentRef, assessmentData, { merge: false });

        toast({
          title: `Assessment Created`,
          description: `The assessment "${values.name}" has been created successfully.`,
        });
        
        onSuccess?.();
        onOpenChange(false);
    } catch (error: any) {
        toast({
            variant: "destructive",
            title: `Error Creating Assessment`,
            description: error.message || "An unknown error occurred.",
        });
    } finally {
        setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create New Assessment</DialogTitle>
          <DialogDescription>
            Choose a name and format for your new assessment.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} id="create-assessment-form" className="space-y-6 py-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Assessment Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Sales Team Personality Test" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
                control={form.control}
                name="format"
                render={({ field }) => (
                <FormItem className="space-y-3">
                    <FormLabel>Question Format</FormLabel>
                    <FormControl>
                    <RadioGroup onValueChange={field.onChange} value={field.value} className="grid grid-cols-2 gap-4">
                        <FormItem>
                            <FormControl>
                                <RadioGroupItem value="likert" id="likert" className="sr-only" />
                            </FormControl>
                            <FormLabel htmlFor="likert" className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary">
                                <span className="font-semibold">Likert Scale</span>
                                <span className="text-xs text-muted-foreground text-center mt-2">Satu pernyataan dengan skala (e.g., Sangat Setuju - Sangat Tidak Setuju)</span>
                            </FormLabel>
                        </FormItem>
                         <FormItem>
                            <FormControl>
                                <RadioGroupItem value="forced-choice" id="forced-choice" className="sr-only" />
                            </FormControl>
                            <FormLabel htmlFor="forced-choice" className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary">
                                <span className="font-semibold">Forced-Choice</span>
                                <span className="text-xs text-muted-foreground text-center mt-2">Empat pernyataan, pilih satu "Paling Sesuai" & satu "Tidak Sesuai"</span>
                            </FormLabel>
                        </FormItem>
                    </RadioGroup>
                    </FormControl>
                    <FormMessage />
                </FormItem>
                )}
            />
          </form>
        </Form>
        <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
            </Button>
            <Button type="submit" form="create-assessment-form" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create
            </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
