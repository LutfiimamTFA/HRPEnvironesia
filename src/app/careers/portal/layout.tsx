'use client';

import { useAuth } from '@/providers/auth-provider';
import { useRouter, usePathname } from '@/navigation';
import { useEffect } from 'react';
import { Loader2, Users } from 'lucide-react';
import { ROLES_INTERNAL } from '@/lib/types';
import { CandidatePortalLayout } from '@/components/careers/CandidatePortalLayout';
import { usePreviewRole } from '@/providers/preview-role-provider';
import { PreviewModeBanner } from '@/components/PreviewModeBanner';
import { useMaintenanceGuard } from '@/hooks/useMaintenance';
import { timestampToMillis } from '@/lib/session-tracking';
import { getMaintenanceSource } from '@/lib/maintenance';
import { useFeatureFlags } from '@/lib/feature-flags';
import { useFirestore } from '@/firebase';

function CandidatePortalDisabledScreen() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-violet-50">
          <Users className="h-7 w-7 text-violet-500" />
        </div>
        <h1 className="text-lg font-bold text-slate-900">Portal Kandidat Tidak Tersedia</h1>
        <p className="mt-2 text-sm text-slate-500">
          Portal Kandidat sedang dinonaktifkan sementara. Silakan coba lagi nanti.
        </p>
      </div>
    </div>
  );
}

export default function CandidatePortalMainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userProfile, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const firestore = useFirestore();
  const { previewRole, isPreviewMode } = usePreviewRole();
  const { isEnabled: isFeatureFlagEnabled } = useFeatureFlags(firestore);
  const candidatePortalEnabled = isFeatureFlagEnabled('candidate_portal');

  // A Super Admin previewing "Kandidat" is allowed into the candidate portal
  // shell without ever changing the real account role.
  const isSuperAdminPreviewingCandidate =
    userProfile?.role === 'super-admin' && isPreviewMode && previewRole === 'kandidat';

  const { blocked: maintenanceBlocked, rule: maintenanceRule, rules: maintenanceRules } = useMaintenanceGuard(pathname ?? '/careers/portal');

  if (process.env.NODE_ENV === 'development' && userProfile) {
    // eslint-disable-next-line no-console
    console.log('[maintenance-check]', {
      actualRole: userProfile.role,
      globalMaintenance: maintenanceRules.find((r) => r.targetType === 'global') ?? null,
      roleMaintenance: maintenanceRules.find((r) => r.targetType === 'role') ?? null,
      shouldBlock: maintenanceBlocked,
      source: maintenanceRule ? getMaintenanceSource(maintenanceRule) : null,
    });
  }

  useEffect(() => {
    if (loading) {
      return; // Wait until loading is complete
    }

    if (!userProfile) {
      // Not logged in, redirect to the candidate login page
      router.replace('/careers/login');
      return;
    }

    if (ROLES_INTERNAL.includes(userProfile.role) && !isSuperAdminPreviewingCandidate) {
      // Logged in, but is an internal user (and not previewing candidate flow). Redirect to admin portal.
      window.location.href = '/admin';
      return;
    }

    // Real candidates only: Super Admin always bypasses maintenance.
    if (userProfile.role === 'kandidat' && maintenanceBlocked && maintenanceRule) {
      const estimatedEndMs = timestampToMillis(maintenanceRule.estimatedEndAt);
      const params = new URLSearchParams({
        title: maintenanceRule.title || 'Portal Kandidat Sedang Dalam Perbaikan',
        message: maintenanceRule.message || 'Portal kandidat sedang dalam perbaikan. Silakan coba lagi nanti.',
        source: getMaintenanceSource(maintenanceRule),
        ...(estimatedEndMs ? { estimatedEndAt: String(estimatedEndMs) } : {}),
      });
      router.replace(`/maintenance?${params.toString()}`);
    }
  }, [userProfile, loading, router, isSuperAdminPreviewingCandidate, maintenanceBlocked, maintenanceRule]);

  // Render a loading state while checking for user and role
  if (
    loading ||
    !userProfile ||
    (userProfile.role !== 'kandidat' && !isSuperAdminPreviewingCandidate) ||
    (userProfile.role === 'kandidat' && maintenanceBlocked)
  ) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // Feature Control: candidate_portal OFF blocks real candidates. Super Admin
  // (including preview mode) always retains internal access to check the flow.
  if (userProfile.role === 'kandidat' && !candidatePortalEnabled) {
    return <CandidatePortalDisabledScreen />;
  }

  // If checks pass, render the child components within the portal layout
  return (
    <>
      {isSuperAdminPreviewingCandidate && <PreviewModeBanner />}
      <CandidatePortalLayout>{children}</CandidatePortalLayout>
    </>
  );
}
