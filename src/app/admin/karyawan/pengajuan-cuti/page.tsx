'use client';

import { useMemo } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useAuth } from '@/providers/auth-provider';
import { MENU_CONFIG } from '@/lib/menu-config';
import { LeaveSubmissionClient } from '@/components/dashboard/karyawan/LeaveSubmissionClient';
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import type { EmployeeProfile } from '@/lib/types';

export default function PengajuanCutiPage() {
  const { userProfile, loading } = useAuth();
  const firestore = useFirestore();

  // Fetch employee_profiles — primary source for hrdEmploymentInfo
  const profileDocRef = useMemoFirebase(
    () => (userProfile?.uid ? doc(firestore, 'employee_profiles', userProfile.uid) : null),
    [userProfile?.uid, firestore]
  );
  const { data: employeeProfile, isLoading: profileLoading } = useDoc<EmployeeProfile>(profileDocRef);

  const menuConfig = useMemo(() => {
    if (!userProfile) return [];
    
    const hrdInfo = (employeeProfile as any)?.hrdEmploymentInfo || {};
    const empType = String(
      hrdInfo.employeeType || 
      hrdInfo.jenisKontrak || 
      hrdInfo.contractType || 
      hrdInfo.tipeKaryawan || 
      employeeProfile?.employmentType || 
      userProfile.employmentType || 
      ""
    ).toLowerCase();

    if (userProfile.role === 'hrd') return MENU_CONFIG['hrd'] || [];
    if (empType.includes('magang') || empType.includes('intern')) {
      return MENU_CONFIG['karyawan-magang'];
    }
    if (empType.includes('training') || empType.includes('probation')) {
      return MENU_CONFIG['karyawan-training'];
    }
    return MENU_CONFIG['karyawan'];
  }, [userProfile, employeeProfile]);

  if (loading || profileLoading) {
    return (
      <DashboardLayout pageTitle="Pengajuan Cuti" menuConfig={menuConfig}>
        <div className="flex items-center justify-center h-64 text-muted-foreground">Memuat data...</div>
      </DashboardLayout>
    );
  }

  // No eligibility gate here — cuti tahunan eligibility and "can receive a
  // replacement mandate" are separate concerns. A magang/probation/training
  // employee can't submit annual leave (LeaveSubmissionClient itself shows
  // why, in place of the submit button/quota cards), but they can still be
  // named as someone else's temporary replacement and must be able to see
  // and confirm that mandate — which is also rendered inside
  // LeaveSubmissionClient, unconditionally.
  return (
    <DashboardLayout pageTitle="Pengajuan Cuti" menuConfig={menuConfig}>
       <LeaveSubmissionClient />
    </DashboardLayout>
  );
}

