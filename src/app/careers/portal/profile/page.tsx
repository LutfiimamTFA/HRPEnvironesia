'use client';

import { useState, useEffect } from 'react';
import { useAuth } from "@/providers/auth-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from '@/components/ui/skeleton';
import { useDoc, useFirestore, useMemoFirebase, setDocumentNonBlocking } from '@/firebase';
import { doc } from 'firebase/firestore';
import type { Profile } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { PersonalDataForm } from '@/components/profile/PersonalDataForm';
import { EducationForm } from '@/components/profile/EducationForm';
import { WorkExperienceForm } from '@/components/profile/WorkExperienceForm';
import { SkillsForm } from '@/components/profile/SkillsForm';

function ProfileSkeleton() {
    return (
        <Card>
            <CardHeader>
                <Skeleton className="h-8 w-1/3" />
                <Skeleton className="h-4 w-2/3" />
            </CardHeader>
            <CardContent>
                <Skeleton className="h-10 w-full" />
                <div className="mt-6 space-y-4">
                    <Skeleton className="h-24 w-full" />
                    <Skeleton className="h-24 w-full" />
                </div>
            </CardContent>
        </Card>
    )
}

export default function ProfilePage() {
  const { userProfile, firebaseUser, loading } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('personal');

  const profileDocRef = useMemoFirebase(() => {
    if (!firestore || !firebaseUser) return null;
    return doc(firestore, 'profiles', firebaseUser.uid);
  }, [firestore, firebaseUser]);

  const { data: profile, isLoading: isProfileLoading } = useDoc<Profile>(profileDocRef);
  
  const handleProfileSave = async (formData: Partial<Profile>) => {
    if (!profileDocRef || !userProfile) return;
    setIsSaving(true);
    try {
        await setDocumentNonBlocking(profileDocRef, formData, { merge: true });
        
        const requiredFields: (keyof Profile)[] = ['fullName', 'nickname', 'email', 'phone', 'eKtpNumber', 'gender', 'birthDate', 'addressKtp', 'willingToWfo', 'education', 'workExperience', 'skills'];
        
        const updatedProfileData = { ...profile, ...formData };
        const isComplete = requiredFields.every(field => {
            const value = updatedProfileData[field];
            if (Array.isArray(value)) return value.length > 0;
            return !!value;
        });

        if (isComplete !== userProfile.isProfileComplete) {
            const userDocRef = doc(firestore, 'users', userProfile.uid);
            await setDocumentNonBlocking(userDocRef, { isProfileComplete: isComplete }, { merge: true });
        }

        toast({ title: "Profil Disimpan", description: "Informasi profil Anda telah diperbarui." });
    } catch (error: any) {
        toast({ variant: 'destructive', title: "Gagal Menyimpan", description: error.message });
    } finally {
        setIsSaving(false);
    }
  };

  useEffect(() => {
    if (!isProfileLoading) {
        // This effect will run when the profile data is loaded or updated.
        // We can force re-render or reset forms here if needed,
        // but often the form libraries handle this if they receive new initialData.
    }
  }, [profile, isProfileLoading]);

  if (isProfileLoading || loading || !userProfile) {
    return <ProfileSkeleton />;
  }
  
  const initialProfileData = {
    ...profile,
    fullName: profile?.fullName || userProfile.fullName,
    email: profile?.email || userProfile.email,
  };


  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <CardTitle className="text-3xl">Profil Saya</CardTitle>
          <CardDescription>Lengkapi profil Anda untuk mempermudah proses lamaran.</CardDescription>
        </div>
      </div>

      <Tabs defaultValue="personal" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4">
          <TabsTrigger value="personal">Data Pribadi</TabsTrigger>
          <TabsTrigger value="education">Pendidikan</TabsTrigger>
          <TabsTrigger value="experience">Pengalaman Kerja</TabsTrigger>
          <TabsTrigger value="skills">Keahlian & Sertifikasi</TabsTrigger>
        </TabsList>
        <TabsContent value="personal" forceMount>
          <PersonalDataForm initialData={initialProfileData} onSave={handleProfileSave} isSaving={isSaving} />
        </TabsContent>
        <TabsContent value="education" forceMount>
          <EducationForm initialData={initialProfileData.education || []} onSave={async (data) => await handleProfileSave({ education: data })} isSaving={isSaving} />
        </TabsContent>
        <TabsContent value="experience" forceMount>
          <WorkExperienceForm initialData={initialProfileData.workExperience || []} onSave={async (data) => await handleProfileSave({ workExperience: data })} isSaving={isSaving} />
        </TabsContent>
        <TabsContent value="skills" forceMount>
            <SkillsForm 
                initialData={{
                    skills: initialProfileData.skills || [],
                    certifications: initialProfileData.certifications || [],
                }} 
                onSave={async (data) => await handleProfileSave(data)} 
                isSaving={isSaving} 
            />
        </TabsContent>
      </Tabs>
    </div>
  );
}
