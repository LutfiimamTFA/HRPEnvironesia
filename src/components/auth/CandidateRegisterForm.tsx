'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth, useFirestore } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Loader2 } from 'lucide-react';
import { UserProfile } from '@/lib/types';

const formSchema = z.object({
  fullName: z.string().min(2, { message: 'Nama lengkap harus diisi.' }),
  email: z.string().email({ message: 'Masukkan email yang valid.' }),
  password: z.string().min(8, { message: 'Password minimal 8 karakter.' }),
});

export function CandidateRegisterForm() {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const auth = useAuth();
  const firestore = useFirestore();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { fullName: '', email: '', password: '' },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setLoading(true);
    try {
      const { user } = await createUserWithEmailAndPassword(auth, values.email, values.password);

      const newProfile: Omit<UserProfile, 'createdAt'> & { createdAt: any } = {
        uid: user.uid,
        email: values.email,
        fullName: values.fullName,
        role: 'kandidat',
        isActive: true,
        createdAt: serverTimestamp(),
      };
      
      await setDoc(doc(firestore, 'users', user.uid), newProfile);
      
      toast({ title: 'Pendaftaran Berhasil', description: 'Akun Anda telah dibuat.' });
      // Redirect will be handled by the page's useEffect after auth state changes.

    } catch (error: any) {
      console.error(error);
      let desc = 'Terjadi kesalahan saat mendaftar.';
      if (error.code === 'auth/email-already-in-use') {
          desc = 'Email ini sudah terdaftar. Silakan login.';
      }
      toast({
        variant: 'destructive',
        title: 'Pendaftaran Gagal',
        description: desc,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nama Lengkap</FormLabel>
              <FormControl>
                <Input placeholder="John Doe" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input placeholder="name@example.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input type="password" placeholder="********" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Daftar
        </Button>
      </form>
    </Form>
  );
}
