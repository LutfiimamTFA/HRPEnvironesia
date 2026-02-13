'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from '@/components/ui/button';
import { Loader2, X } from 'lucide-react';
import { Badge } from '../ui/badge';

const formSchema = z.object({
  skills: z.array(z.string()).min(1, "Tambahkan setidaknya satu keahlian."),
});

type FormValues = z.infer<typeof formSchema>;

interface SkillsFormProps {
    initialData: string[];
    onSave: (data: string[]) => Promise<void>;
    isSaving: boolean;
}

export function SkillsForm({ initialData, onSave, isSaving }: SkillsFormProps) {
    const [inputValue, setInputValue] = useState('');
    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            skills: initialData || [],
        },
    });

    const { setValue, watch } = form;
    const skills = watch('skills');

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && inputValue.trim()) {
            e.preventDefault();
            const newSkill = inputValue.trim();
            if (!skills.includes(newSkill)) {
                setValue('skills', [...skills, newSkill]);
            }
            setInputValue('');
        }
    };

    const removeSkill = (skillToRemove: string) => {
        setValue('skills', skills.filter(skill => skill !== skillToRemove));
    };

    const handleSubmit = (values: FormValues) => {
        onSave(values.skills);
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Keahlian</CardTitle>
                <CardDescription>Sebutkan keahlian yang Anda kuasai. Tekan Enter untuk menambahkan.</CardDescription>
            </CardHeader>
            <CardContent>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
                        <FormItem>
                            <FormLabel>Keahlian Anda</FormLabel>
                            <FormControl>
                                <Input 
                                    placeholder="Contoh: Javascript"
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                />
                            </FormControl>
                             <div className="pt-4 flex flex-wrap gap-2">
                                {skills.map((skill) => (
                                    <Badge key={skill} variant="secondary" className="text-sm py-1 pl-3 pr-2">
                                        {skill}
                                        <button 
                                            type="button"
                                            onClick={() => removeSkill(skill)} 
                                            className="ml-2 rounded-full hover:bg-muted-foreground/20 p-0.5"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </Badge>
                                ))}
                            </div>
                            <FormMessage>{form.formState.errors.skills?.message}</FormMessage>
                        </FormItem>

                        <div className="flex justify-end">
                            <Button type="submit" disabled={isSaving}>
                                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Simpan Keahlian
                            </Button>
                        </div>
                    </form>
                </Form>
            </CardContent>
        </Card>
    );
}
