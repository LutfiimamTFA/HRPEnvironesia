'use client';

import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useRouter } from 'next/navigation';
import { useAuth as useFirebaseAuth } from '@/firebase';

export default function CandidateDashboardPage() {
  const { userProfile } = useAuth();
  const auth = useFirebaseAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await auth.signOut();
    router.push('/careers/login');
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-secondary p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Halo {userProfile?.fullName}!</CardTitle>
          <CardDescription>Selamat datang di dasbor kandidat Anda.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">Lamaran kamu akan tampil di sini.</p>
          <p className="text-sm text-center p-8 border rounded-lg bg-gray-50">
            Fitur aplikasi lamaran sedang dalam pengembangan.
          </p>
          <Button onClick={handleLogout} variant="outline" className="w-full">
            Logout
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
