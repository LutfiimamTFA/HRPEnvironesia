'use client';

import { useState } from 'react';
import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Skeleton } from '@/components/ui/skeleton';
import { useDoc, useFirestore, useMemoFirebase, setDocumentNonBlocking } from '@/firebase';
import { doc } from 'firebase/firestore';
import type { Profile, Education, WorkExperience, Certification } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { PersonalDataForm } from '@/components/profile/PersonalDataForm';
import { EducationForm } from '@/components/profile/EducationForm';
import { WorkExperienceForm } from '@/components/profile/WorkExperienceForm';
import { SkillsForm } from '@/components/profile/SkillsForm';
import { Briefcase, GraduationCap, Sparkles, User, ClipboardEdit } from 'lucide-react';
import { SelfDescriptionForm } from '@/components/profile/SelfDescriptionForm';

function ProfileSkeleton() {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            <aside className="lg:col-span-1">
                <Skeleton className="h-48 w-full" />
            </aside>
            <main className="lg:col-span-3">
                <Skeleton className="h-96 w-full" />
            </main>
        </div>
    )
}

const navItems = [
    { name: 'Data Pribadi', section: 'personal', icon: User, description: 'Info kontak, KTP, dll.' },
    { name: 'Pendidikan', section: 'education', icon: GraduationCap, description: 'Riwayat pendidikan formal.' },
    { name: 'Pengalaman Kerja', section: 'experience', icon: Briefcase, description: 'Pengalaman kerja relevan.' },
    { name: 'Keahlian & Sertifikasi', section: 'skills', icon: Sparkles, description: 'Keahlian & sertifikasi Anda.' },
    { name: 'Deskripsi Diri', section: 'description', icon: ClipboardEdit, description: 'Profil diri & motivasi.' },
];

export default function ProfilePage() {
  const { userProfile, firebaseUser, loading, refreshUserProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [activeSection, setActiveSection] = useState('personal');

  const profileDocRef = useMemoFirebase(() => {
    if (!firestore || !firebaseUser) return null;
    return doc(firestore, 'profiles', firebaseUser.uid);
  }, [firestore, firebaseUser]);

  const { data: profile, isLoading: isProfileLoading } = useDoc<Profile>(profileDocRef);
  
  const checkProfileCompleteness = async (updatedData: Partial<Profile>) => {
      if (!firestore || !firebaseUser) return;
      const userDocRef = doc(firestore, 'users', firebaseUser.uid);
      const currentProfile = { ...profile, ...updatedData };
      const requiredFields: (keyof Profile)[] = ['fullName', 'nickname', 'email', 'phone', 'eKtpNumber', 'gender', 'birthDate', 'addressKtp', 'education'];
      
      const isComplete = requiredFields.every(field => {
          const value = currentProfile[field];
          if (field === 'willingToWfo') {
            return typeof value === 'boolean';
          }
          if (Array.isArray(value)) {
              return value.length > 0;
          }
          return value !== undefined && value !== null && value !== '';
      });

      if (isComplete !== userProfile?.isProfileComplete) {
          await setDocumentNonBlocking(userDocRef, { isProfileComplete: isComplete }, { merge: true });
          refreshUserProfile();
      }
  };

  const handleSave = async (formData: Partial<Profile>, sectionName: string) => {
    if (!profileDocRef) return;
    setIsSaving(true);
    try {
        await setDocumentNonBlocking(profileDocRef, formData, { merge: true });
        await checkProfileCompleteness(formData);
        toast({ title: "Profil Disimpan", description: `Bagian ${sectionName} telah diperbarui.` });
    } catch (error: any) {
        toast({ variant: 'destructive', title: "Gagal Menyimpan", description: error.message });
        // Re-throw the error so child forms know the save failed and won't clear their draft.
        throw error;
    } finally {
        setIsSaving(false);
    }
  };


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
          <h1 className="text-3xl font-bold tracking-tight">Profil Saya</h1>
          <p className="text-muted-foreground">Lengkapi profil Anda untuk mempermudah proses lamaran.</p>
        </div>
      </div>
      
       <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
            <aside className="lg:col-span-1 lg:sticky lg:top-20">
                <nav className="flex flex-col space-y-1">
                    {navItems.map((item) => (
                        <Button
                            key={item.section}
                            variant={activeSection === item.section ? 'secondary' : 'ghost'}
                            className="h-auto w-full justify-start p-3 text-left"
                            onClick={() => setActiveSection(item.section)}
                        >
                            <item.icon className="mr-4 h-5 w-5 flex-shrink-0 text-muted-foreground" />
                            <div>
                                <p className="font-semibold text-base">{item.name}</p>
                                <p className="text-sm text-muted-foreground">{item.description}</p>
                            </div>
                        </Button>
                    ))}
                </nav>
            </aside>

            <main className="lg:col-span-3">
                <div style={{ display: activeSection === 'personal' ? 'block' : 'none' }}>
                    <PersonalDataForm 
                        initialData={initialProfileData} 
                        onSave={async (data) => await handleSave(data, 'Data Pribadi')} 
                        isSaving={isSaving} 
                    />
                </div>
                <div style={{ display: activeSection === 'education' ? 'block' : 'none' }}>
                    <EducationForm 
                        initialData={initialProfileData.education || []} 
                        onSave={async (data: Education[]) => await handleSave({ education: data }, 'Pendidikan')} 
                        isSaving={isSaving} 
                    />
                </div>
                <div style={{ display: activeSection === 'experience' ? 'block' : 'none' }}>
                    <WorkExperienceForm 
                        initialData={initialProfileData.workExperience || []} 
                        onSave={async (data: WorkExperience[]) => await handleSave({ workExperience: data }, 'Pengalaman Kerja')} 
                        isSaving={isSaving} 
                    />
                </div>
                <div style={{ display: activeSection === 'skills' ? 'block' : 'none' }}>
                    <SkillsForm 
                        initialData={{
                            skills: initialProfileData.skills || [],
                            certifications: initialProfileData.certifications || [],
                        }} 
                        onSave={async (data: { skills: string[], certifications?: Certification[] }) => await handleSave(data, 'Keahlian & Sertifikasi')} 
                        isSaving={isSaving} 
                    />
                </div>
                <div style={{ display: activeSection === 'description' ? 'block' : 'none' }}>
                    <SelfDescriptionForm 
                        initialData={{
                            selfDescription: initialProfileData.selfDescription,
                            salaryExpectation: initialProfileData.salaryExpectation,
                            motivation: initialProfileData.motivation,
                        }}
                        onSave={async (data) => await handleSave(data, 'Deskripsi Diri')}
                        isSaving={isSaving}
                    />
                </div>
            </main>
        </div>
    </div>
  );
}
