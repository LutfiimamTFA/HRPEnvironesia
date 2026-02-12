'use client';

import { useAuth } from "@/providers/auth-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export default function ProfilePage() {
  const { userProfile } = useAuth();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profil Saya</CardTitle>
        <CardDescription>Informasi akun Anda. Fitur edit akan segera tersedia.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
            <Label htmlFor="fullName">Nama Lengkap</Label>
            <Input id="fullName" value={userProfile?.fullName || ''} readOnly />
        </div>
        <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={userProfile?.email || ''} readOnly />
        </div>
        <Button disabled>Edit Profil (Segera Hadir)</Button>
      </CardContent>
    </Card>
  );
}
