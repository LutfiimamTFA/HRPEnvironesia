'use client';

import { useMemo } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import type { Assessment, AssessmentTemplate } from '@/lib/types';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Skeleton } from '@/components/ui/skeleton';
import { MENU_CONFIG } from '@/lib/menu-config';
import { QuestionManagementClient } from '@/components/dashboard/QuestionManagementClient';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

function PageSkeleton() {
  return <Skeleton className="h-96 w-full" />;
}

export default function ManageAssessmentPage() {
  const hasAccess = useRoleGuard(['super-admin', 'hrd']);
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const params = useParams();
  const router = useRouter();
  const assessmentId = params.assessmentId as string;

  const menuConfig = useMemo(() => {
    if (userProfile?.role === 'super-admin') return MENU_CONFIG['super-admin'];
    if (userProfile?.role === 'hrd') return MENU_CONFIG['hrd-recruitment']; // Assessments are part of recruitment
    return [];
  }, [userProfile]);
  
  const assessmentRef = useMemoFirebase(
    () => (assessmentId ? doc(firestore, 'assessments', assessmentId) : null),
    [firestore, assessmentId]
  );
  const { data: assessment, isLoading: isLoadingAssessment } = useDoc<Assessment>(assessmentRef);
  
  const templateRef = useMemoFirebase(
    () => (assessment ? doc(firestore, 'assessment_templates', assessment.templateId) : null),
    [firestore, assessment]
  );
  const { data: template, isLoading: isLoadingTemplate } = useDoc<AssessmentTemplate>(templateRef);

  const isLoading = isLoadingAssessment || isLoadingTemplate;

  if (!hasAccess || isLoading) {
    return (
      <DashboardLayout pageTitle="Manage Assessment" menuConfig={menuConfig}>
        <PageSkeleton />
      </DashboardLayout>
    );
  }

  if (!assessment || !template) {
      return (
         <DashboardLayout pageTitle="Error" menuConfig={menuConfig}>
            <p>Assessment or its template not found.</p>
         </DashboardLayout>
      )
  }

  return (
    <DashboardLayout pageTitle={`Builder: ${assessment.name}`} menuConfig={menuConfig}>
        <div className="space-y-4">
             <Button variant="outline" size="sm" onClick={() => router.back()}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Assessment Tools
            </Button>
            <QuestionManagementClient assessment={assessment} template={template} />
        </div>
    </DashboardLayout>
  );
}
