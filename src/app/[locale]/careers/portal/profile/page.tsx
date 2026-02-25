'use client';

import { Suspense, useEffect, useState } from 'react';
import { useAuth } from "@/providers/auth-provider";
import { Skeleton } from '@/components/ui/skeleton';
import { useDoc, useFirestore, useMemoFirebase, setDocumentNonBlocking } from '@/firebase';
import { doc } from 'firebase/firestore';
import type { Profile } from '@/lib/types';
import { PersonalDataForm } from '@/components/profile/PersonalDataForm';
import { EducationForm } from '@/components/profile/EducationForm';
import { WorkExperienceForm } from '@/components/profile/WorkExperienceForm';
import { SkillsForm } from '@/components/profile/SkillsForm';
import { SelfDescriptionForm } from '@/components/profile/SelfDescriptionForm';
import { useRouter, useSearchParams, usePathname } from '@/navigation';
import { ProfileStepper } from '@/components/profile/ProfileStepper';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, Edit, Loader2 } from 'lucide-react';
import { OrganizationalExperienceForm } from '@/components/profile/OrganizationalExperienceForm';
import { useToast } from '@/hooks/use-toast';

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
    const pathname = usePathname();
    const { toast } = useToast();
    const [isEditing, setIsEditing] = useState(false);

    const profileDocRef = useMemoFirebase(() => {
        if (!firestore || !firebaseUser) return null;
        return doc(firestore, 'profiles', firebaseUser.uid);
    }, [firestore, firebaseUser]);

    const { data: profile, isLoading: isProfileLoading, mutate: refreshProfile } = useDoc<Profile>(profileDocRef);

    const isLoading = authLoading || isProfileLoading;
    const urlStep = parseInt(searchParams.get('step') || '1', 10);

    const [effectiveStep, setEffectiveStep] = useState(1);
    const [optimisticProfileStep, setOptimisticProfileStep] = useState(1);

    useEffect(() => {
        if (isLoading) return;

        const profileStep = profile?.profileStep || 1;
        const profileStepEffective = Math.max(profileStep, optimisticProfileStep);
        
        if (profile?.profileStatus === 'completed' && !searchParams.has('step')) {
            setEffectiveStep(steps.length + 1); // A step beyond the last to show completion screen
            return;
        }

        const targetStep = urlStep > profileStepEffective ? profileStepEffective : urlStep;
        
        if (targetStep !== urlStep && profile?.profileStatus !== 'completed') {
            router.replace(`${pathname}?step=${targetStep}`);
        }
        
        setEffectiveStep(profile?.profileStatus === 'completed' ? urlStep : targetStep);

    }, [urlStep, profile, isLoading, router, searchParams, optimisticProfileStep, pathname]);


    const handleSaveSuccess = () => {
        refreshProfile(); // Refetch profile to get the latest step
        refreshUserProfile(); // Refetch user data in auth context
        const nextStep = effectiveStep + 1;
        setOptimisticProfileStep(nextStep);
        if (nextStep <= steps.length) {
            router.push(`${pathname}?step=${nextStep}`);
        } else {
             router.push(pathname);
        }
    };

    const handleBack = () => {
        const prevStep = effectiveStep - 1;
        if (prevStep >= 1) {
            router.push(`${pathname}?step=${prevStep}`);
        }
    };
    
    const handleFinish = () => {
        refreshProfile();
        refreshUserProfile();
        setOptimisticProfileStep(steps.length + 1);
        router.push(pathname);
    }

    const handleEdit = async () => {
        if (!firebaseUser) {
            toast({
                variant: 'destructive',
                title: 'Gagal memulai edit',
                description: 'User tidak ditemukan. Silakan login kembali.',
            });
            return;
        }

        setIsEditing(true);
        const profileDocRef = doc(firestore, 'profiles', firebaseUser.uid);
        try {
            await setDocumentNonBlocking(profileDocRef, { profileStatus: 'draft' }, { merge: true });
            setOptimisticProfileStep(1);
            router.push(`${pathname}?step=1`);
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Gagal memulai mode edit',
                description: error.message || 'Terjadi kesalahan pada server.',
            });
        } finally {
            setIsEditing(false);
        }
    };

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
                <CardContent className="w-full max-w-sm">
                    <p className="text-muted-foreground mb-6">
                        Terima kasih telah melengkapi profil Anda. Anda sekarang dapat melamar pekerjaan atau mengedit profil Anda jika ada perubahan.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4">
                        <Button variant="outline" className="w-full" onClick={handleEdit} disabled={isEditing}>
                            {isEditing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Edit className="mr-2 h-4 w-4" />}
                            Edit Profil
                        </Button>
                        <Button className="w-full" onClick={() => router.push('/careers/portal/jobs')}>
                            Cari Lowongan
                        </Button>
                    </div>
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
