'use client';

import { useState } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useRouter } from 'next/navigation';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from 'firebase/auth';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Eye, EyeOff, AlertTriangle } from 'lucide-react';

export default function ForceChangePasswordPage() {
  const { firebaseUser, userProfile, loading } = useAuth();
  const router = useRouter();

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Redirect if not logged in or doesn't need to change password
  if (!loading && (!userProfile || !(userProfile as any).mustChangePassword)) {
    router.replace('/admin');
    return null;
  }

  const handleChangePassword = async () => {
    setErrorMessage(null);

    if (!oldPassword.trim()) {
      setErrorMessage('Password lama wajib diisi.');
      return;
    }

    if (newPassword.length < 8) {
      setErrorMessage('Password baru harus minimal 8 karakter.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('Konfirmasi password baru tidak cocok.');
      return;
    }

    if (!firebaseUser?.email) {
      setErrorMessage('Email pengguna tidak tersedia.');
      return;
    }

    setIsSaving(true);

    try {
      // Reauthenticate with old password
      const credential = EmailAuthProvider.credential(
        firebaseUser.email,
        oldPassword
      );
      await reauthenticateWithCredential(firebaseUser, credential);

      // Update password in Firebase Auth
      await updatePassword(firebaseUser, newPassword);

      // Update Firestore to clear mustChangePassword flag
      try {
        const idToken = await firebaseUser.getIdToken();
        const res = await fetch(`/api/users/${firebaseUser.uid}/password-changed`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${idToken}`,
            'Content-Type': 'application/json',
          },
        });

        if (!res.ok) {
          console.warn('Failed to update password status');
        }
      } catch (firestoreError) {
        console.warn('Error updating password status:', firestoreError);
      }

      // Redirect to dashboard
      router.replace('/admin');
    } catch (error: any) {
      console.error('Password change error:', error);
      if (error.code === 'auth/wrong-password') {
        setErrorMessage('Password lama salah. Silakan coba lagi.');
      } else if (error.code === 'auth/weak-password') {
        setErrorMessage('Password baru terlalu lemah. Gunakan kombinasi huruf, angka, dan simbol.');
      } else {
        setErrorMessage(
          error.message || 'Gagal mengubah password. Silakan coba lagi.'
        );
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (loading || !userProfile) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border">
        <CardHeader className="space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
            <div className="space-y-2">
              <CardTitle>Ubah Password Sekarang</CardTitle>
              <CardDescription>
                Akun Anda memerlukan perubahan password sebelum dapat mengakses
                sistem. Gunakan password sementara yang diberikan admin.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <Alert className="border-yellow-200 bg-yellow-50 dark:bg-yellow-950">
            <AlertDescription className="text-sm text-yellow-900 dark:text-yellow-200">
              Ini adalah persyaratan keamanan. Pastikan password baru Anda kuat
              dan unik.
            </AlertDescription>
          </Alert>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="old-password" className="font-semibold">
                Password Sementara *
              </Label>
              <div className="relative">
                <Input
                  id="old-password"
                  type={showOldPassword ? 'text' : 'password'}
                  placeholder="Masukkan password sementara dari admin"
                  value={oldPassword}
                  onChange={(e) => {
                    setOldPassword(e.target.value);
                    setErrorMessage(null);
                  }}
                  disabled={isSaving}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowOldPassword(!showOldPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground transition"
                  disabled={isSaving}
                >
                  {showOldPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-password" className="font-semibold">
                Password Baru *
              </Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showNewPassword ? 'text' : 'password'}
                  placeholder="Minimal 8 karakter"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    setErrorMessage(null);
                  }}
                  disabled={isSaving}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground transition"
                  disabled={isSaving}
                >
                  {showNewPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password" className="font-semibold">
                Konfirmasi Password Baru *
              </Label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Ketikkan password baru lagi"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setErrorMessage(null);
                  }}
                  disabled={isSaving}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground transition"
                  disabled={isSaving}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {errorMessage && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          <Button
            onClick={handleChangePassword}
            disabled={isSaving}
            size="lg"
            className="w-full"
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Mengubah Password...
              </>
            ) : (
              'Ubah Password & Lanjut'
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
