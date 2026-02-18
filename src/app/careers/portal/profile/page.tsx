'use client';

import { Suspense, useEffect, useState } from 'react';
import { useAuth } from "@/providers/auth-provider";
import { Skeleton } from '@/components/ui/skeleton';
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import type { Profile } from '@/lib/types';
import { PersonalDataForm } from '@/components/profile/PersonalDataForm';
import { EducationForm } from '@/components/profile/EducationForm';
import { WorkExperienceForm } from '@/components/profile/WorkExperienceForm';
import { SkillsForm } from '@/components/profile/SkillsForm';
import { SelfDescriptionForm } from '@/components/profile/SelfDescriptionForm';
import { useRouter, useSearchParams } from 'next/navigation';
import { ProfileStepper } from '@/components/profile/ProfileStepper';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle } from 'lucide-react';
import { OrganizationalExperienceForm } from '@/components/profile/OrganizationalExperienceForm';

const steps = [
    { id: 1, name: 'Data Pribadi' },
    { id: 2, name: 'Pendidikan' },
    { id: 3, name: 'Pengalaman Kerja' },
    { id: 4, name: 'Pengalaman Organisasi' },
    { id: 5, name: 'Keahlian & Sertifikasi' },
    { id: 6, name: 'Deskripsi & Pernyataan' },
];

function ProfileWizardContent() {
    const { userProfile: authProfile, firebaseUser, loading: authLoading, refreshUserProfile } = useAuth();
    const firestore = useFirestore();
    const router = useRouter();
    const searchParams = useSearchParams();

    const profileDocRef = useMemoFirebase(() => {
        if (!firestore || !firebaseUser) return null;
        return doc(firestore, 'profiles', firebaseUser.uid);
    }, [firestore, firebaseUser]);

    const { data: profile, isLoading: isProfileLoading, mutate: refreshProfile } = useDoc<Profile>(profileDocRef);

    const isLoading = authLoading || isProfileLoading;
    const urlStep = parseInt(searchParams.get('step') || '1', 10);

    const [effectiveStep, setEffectiveStep] = useState(1);

    useEffect(() => {
        if (isLoading) return;

        const profileStep = profile?.profileStep || 1;
        
        if (profile?.profileStatus === 'completed') {
            setEffectiveStep(steps.length + 1); // A step beyond the last to show completion screen
            return;
        }

        const targetStep = urlStep > profileStep ? profileStep : urlStep;
        
        if (targetStep !== urlStep) {
            router.replace(`/careers/portal/profile?step=${targetStep}`);
        }
        
        setEffectiveStep(targetStep);

    }, [urlStep, profile, isLoading, router]);


    const handleSaveSuccess = () => {
        refreshProfile(); // Refetch profile to get the latest step
        refreshUserProfile(); // Refetch user data in auth context
        const nextStep = effectiveStep + 1;
        if (nextStep <= steps.length) {
            router.push(`/careers/portal/profile?step=${nextStep}`);
        } else {
             router.push('/careers/portal/profile?step=completed');
        }
    };

    const handleBack = () => {
        const prevStep = effectiveStep - 1;
        if (prevStep >= 1) {
            router.push(`/careers/portal/profile?step=${prevStep}`);
        }
    };
    
    const handleFinish = () => {
        refreshProfile();
        refreshUserProfile();
        router.push('/careers/portal');
    }

    if (isLoading || !authProfile) {
        return (
             <div className="space-y-6">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-96 w-full" />
             </div>
        )
    }
    
    if (effectiveStep > steps.length) {
       return (
            <Card className="flex flex-col items-center justify-center text-center p-8">
                <CardHeader>
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                        <CheckCircle className="h-10 w-10 text-green-600" />
                    </div>
                    <CardTitle className="mt-4 text-2xl">Profil Anda Sudah Lengkap!</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground mb-6">
                        Terima kasih telah melengkapi profil Anda. Anda sekarang dapat melamar pekerjaan.
                    </p>
                    <Button onClick={() => router.push('/careers/portal/jobs')}>
                        Cari Lowongan Sekarang
                    </Button>
                </CardContent>
            </Card>
       )
    }

    const initialProfileData = {
        ...(profile || {}),
        fullName: profile?.fullName || authProfile.fullName,
        email: profile?.email || authProfile.email,
    };


    return (
        <div className="space-y-8">
            <ProfileStepper steps={steps} currentStep={effectiveStep} />
            
            {effectiveStep === 1 && (
                <PersonalDataForm 
                    initialData={initialProfileData} 
                    onSaveSuccess={handleSaveSuccess}
                />
            )}
            {effectiveStep === 2 && (
                <EducationForm 
                    initialData={initialProfileData.education || []} 
                    onSaveSuccess={handleSaveSuccess}
                    onBack={handleBack}
                />
            )}
            {effectiveStep === 3 && (
                <WorkExperienceForm
                    initialData={initialProfileData.workExperience || []}
                    onSaveSuccess={handleSaveSuccess}
                    onBack={handleBack}
                />
            )}
            {effectiveStep === 4 && (
                <OrganizationalExperienceForm
                    initialData={initialProfileData.organizationalExperience || []}
                    onSaveSuccess={handleSaveSuccess}
                    onBack={handleBack}
                />
            )}
            {effectiveStep === 5 && (
                 <SkillsForm
                    initialData={{
                        skills: initialProfileData.skills || [],
                        certifications: initialProfileData.certifications || [],
                    }}
                    onSaveSuccess={handleSaveSuccess}
                    onBack={handleBack}
                />
            )}
            {effectiveStep === 6 && (
                <SelfDescriptionForm
                    initialData={{
                        selfDescription: initialProfileData.selfDescription,
                        salaryExpectation: initialProfileData.salaryExpectation,
                        motivation: initialProfileData.motivation,
                    }}
                    onFinish={handleFinish}
                    onBack={handleBack}
                />
            )}
        </div>
    );
}


export default function ProfilePage() {
    return (
        <Suspense fallback={<Skeleton className="h-screen w-full" />}>
            <ProfileWizardContent />
        </Suspense>
    )
}
