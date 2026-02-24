'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, serverTimestamp } from 'firebase/firestore';
import { useAuth, useFirestore, setDocumentNonBlocking } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { UserProfile } from '@/lib/types';
import { Checkbox } from '@/components/ui/checkbox';
import { useRouter } from '@/navigation';

const formSchema = z.object({
    fullName: z.string().min(2, { message: 'Nama lengkap (sesuai KTP) harus diisi.' }),
    email: z.string().email({ message: 'Masukkan email yang valid.' }),
    confirmEmail: z.string().email({ message: 'Konfirmasi email yang valid.' }),
    password: z.string().min(8, { message: 'Password minimal 8 karakter.' }),
    confirmPassword: z.string().min(8, { message: 'Konfirmasi password minimal 8 karakter.' }),
    captcha: z.boolean().refine(value => value === true, {
      message: "Anda harus melakukan verifikasi.",
    }),
  }).refine(data => data.email === data.confirmEmail, {
      message: "Alamat email tidak cocok.",
      path: ["confirmEmail"],
  }).refine(data => data.password === data.confirmPassword, {
      message: "Password tidak cocok.",
      path: ["confirmPassword"],
  });

export function CandidateRegisterForm() {
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { toast } = useToast();
  const auth = useAuth();
  const firestore = useFirestore();
  const router = useRouter();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { 
        fullName: '', 
        email: '', 
        confirmEmail: '',
        password: '',
        confirmPassword: '',
        captcha: false
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setLoading(true);
    try {
      const { user } = await createUserWithEmailAndPassword(auth, values.email, values.password);

      const newProfile: Omit<UserProfile, 'createdAt'> & { createdAt: any } = {
        uid: user.uid,
        email: values.email,
        fullName: values.fullName,
        nameLower: values.fullName.toLowerCase(),
        role: 'kandidat',
        isActive: true,
        createdAt: serverTimestamp(),
      };
      
      await setDocumentNonBlocking(doc(firestore, 'users', user.uid), newProfile, {});
      
      // Sign the user out immediately after creating the profile
      await auth.signOut();

      toast({ title: 'Pendaftaran Berhasil', description: 'Silakan login dengan akun Anda yang baru dibuat.' });
      
      // Manually redirect to the login page
      router.push('/careers/login');

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
              <FormLabel>Nama Lengkap (Sesuai KTP)</FormLabel>
              <FormControl>
                <Input placeholder="John Doe" {...field} autoComplete="name" />
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
              <FormLabel>Alamat Email</FormLabel>
              <FormControl>
                <Input placeholder="name@example.com" type="email" {...field} autoComplete="email" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirmEmail"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Konfirmasi Alamat Email</FormLabel>
              <FormControl>
                <Input placeholder="Ulangi alamat email" type="email" {...field} autoComplete="email" />
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
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Minimal 8 karakter"
                    className="pr-10"
                    autoComplete="new-password"
                    {...field}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
         <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Konfirmasi Password</FormLabel>
              <FormControl>
                <div className="relative">
                  <Input
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Ulangi password"
                    className="pr-10"
                    autoComplete="new-password"
                    {...field}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground"
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
         <FormField
          control={form.control}
          name="captcha"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 shadow-sm">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>
                  Verifikasi Captcha
                </FormLabel>
                <FormDescription>
                    Centang untuk membuktikan Anda bukan robot.
                </FormDescription>
                <FormMessage />
              </div>
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
