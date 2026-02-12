'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useRouter } from 'next/navigation';

export default function JobApplyPage() {
  const router = useRouter();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-secondary p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Lamar Posisi</CardTitle>
          <CardDescription>Selesaikan aplikasi Anda untuk posisi ini.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-center p-8 border rounded-lg bg-muted/50">
            Formulir aplikasi dan fitur unggah CV sedang dalam tahap pengembangan.
          </p>
          <Button onClick={() => router.back()} variant="outline" className="w-full">
            Kembali ke Detail Lowongan
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
