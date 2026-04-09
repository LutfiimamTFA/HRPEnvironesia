'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from '@/providers/auth-provider';
import { useFirestore, updateDocumentNonBlocking } from '@/firebase';
import { doc, serverTimestamp } from 'firebase/firestore';
import { type JobApplication, type RecruitmentInternalDecisionStatus, type UserProfile } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { 
  CheckCircle2, 
  Clock, 
  XOctagon, 
  Lock,
  MessageSquareDiff,
  Loader2,
  CalendarCheck,
  PauseCircle,
  XCircle,
  Briefcase
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface FinalInternalDecisionSectionProps {
  application: JobApplication;
  onStageChange?: (newStage: JobApplication['status'], reason: string) => Promise<boolean>;
}

export function FinalInternalDecisionSection({ application, onStageChange }: FinalInternalDecisionSectionProps) {
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [decision, setDecision] = useState<RecruitmentInternalDecisionStatus | ''>('');
  const [note, setNote] = useState('');

  const isHRD = userProfile?.role === 'hrd' || userProfile?.role === 'super-admin';

  const existingDecision = application.recruitmentInternalDecision;

  // Non-HRD can only see this if a decision exists
  if (!isHRD && !existingDecision) return null;

  // Sync state if already decided
  useEffect(() => {
    if (existingDecision) {
      setDecision(existingDecision.status);
      setNote(existingDecision.note);
    }
  }, [existingDecision]);

  const handleSubmit = async () => {
    if (!userProfile || !application.id || !decision) return;

    if (note.length < 5) {
      toast({ 
        variant: 'destructive', 
        title: 'Catatan Wajib Diisi', 
        description: 'Mohon berikan alasan/catatan internal.' 
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const appRef = doc(firestore, 'applications', application.id);

      // If decision is to move forward, handle the stage transition FIRST
      if (decision === 'lanjut_ke_tahap_selanjutnya' && onStageChange) {
        let stageSuccess = false;
        if (application.status === 'screening' || application.status === 'tes_kepribadian') {
          stageSuccess = await onStageChange('interview', 'Kandidat diloloskan evaluasi internal dan maju ke tahap wawancara.');
        } else if (application.status === 'interview') {
          stageSuccess = await onStageChange('offered', 'Kandidat direkomendasikan setelah wawancara.');
        } else {
          // It's already past screening, so consider it a success
          stageSuccess = true;
        }

        // If stage change failed, we abort so we don't lock the UI in an inconsistent state
        if (!stageSuccess && application.status === 'screening') {
            setIsSubmitting(false);
            return;
        }
      }

      // Save decision & lock internal reviews
      const updateData: any = {
        recruitmentInternalDecision: {
          status: decision as RecruitmentInternalDecisionStatus,
          note,
          decidedBy: userProfile.uid,
          decidedByName: userProfile.fullName,
          decidedAt: serverTimestamp(),
        },
        'internalReviewConfig.reviewLocked': true,
        updatedAt: serverTimestamp()
      };

      await updateDocumentNonBlocking(appRef, updateData);

      toast({ 
        title: 'Keputusan Disimpan', 
        description: 'Keputusan internal HRD telah disimpan dan evaluasi tim dikunci. Kandidat tidak menerima notifikasi apa pun.' 
      });
    } catch (error: any) {
      console.error("Error saving decision:", error);
      toast({ variant: 'destructive', title: 'Gagal Menyimpan', description: error.message || 'Terjadi kesalahan sistem' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Form is locked if user is not HRD
  // If HR already chose 'lanjut' AND the stage successfully moved past screening, then lock.
  const isFormLocked = !isHRD || (existingDecision?.status === 'lanjut_ke_tahap_selanjutnya' && !['screening', 'tes_kepribadian'].includes(application.status));

  return (
    <Card className="shadow-2xl border-none rounded-[3rem] bg-[#020617]/50 backdrop-blur-xl overflow-hidden border-t-8 border-violet-500/20 ring-1 ring-white/5 relative">
      {/* Decorative Background */}
      <div className="absolute top-0 right-0 p-32 bg-violet-600/10 blur-[120px] rounded-full pointer-events-none -z-10" />

      <CardHeader className="bg-violet-500/[0.03] pb-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div className="flex items-center gap-6">
                <div className="p-4 rounded-[1.5rem] bg-violet-600 text-white shadow-2xl shadow-violet-500/20">
                    <Briefcase className="h-7 w-7" />
                </div>
                <div>
                    <CardTitle className="text-3xl font-black tracking-tighter uppercase text-slate-100 flex items-center gap-3">
                        Keputusan Akhir Internal
                        {existingDecision && <Lock className="h-5 w-5 text-amber-500" />}
                    </CardTitle>
                    <CardDescription className="text-slate-400 font-bold italic">
                        Hak prerogatif HRD setelah evaluasi tim. Kandidat tidak akan melihat status ini.
                    </CardDescription>
                </div>
            </div>
            {existingDecision && existingDecision.decidedAt && (
               <div className="text-right">
                    <p className="text-[10px] font-black tracking-widest uppercase text-slate-500">Diputuskan Oleh</p>
                    <p className="text-sm font-bold text-slate-300">{existingDecision.decidedByName}</p>
                    {/* Handle potential Timestamp formatting */}
                    <p className="text-xs text-slate-500">{existingDecision.decidedAt && typeof existingDecision.decidedAt.toDate === 'function' ? format(existingDecision.decidedAt.toDate(), 'dd MMM yyyy, HH:mm') : ''}</p>
               </div>
            )}
        </div>
      </CardHeader>

      <CardContent className="p-6 md:p-12 space-y-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <button
                type="button"
                onClick={() => !isFormLocked && setDecision('lanjut_ke_tahap_selanjutnya')}
                disabled={!!isFormLocked}
                className={cn(
                    "p-6 rounded-[2rem] border-2 flex flex-col items-start gap-4 transition-all duration-300 relative overflow-hidden text-left",
                    decision === 'lanjut_ke_tahap_selanjutnya'
                        ? "border-emerald-500 bg-emerald-500/10 text-emerald-400 shadow-2xl shadow-emerald-500/20"
                        : "border-slate-800 bg-slate-900/40 text-slate-500 hover:border-emerald-500/30 hover:bg-slate-900/60",
                    isFormLocked && "opacity-60 cursor-not-allowed"
                )}
            >
                <div className={cn(
                    "p-3 rounded-xl", 
                    decision === 'lanjut_ke_tahap_selanjutnya' ? "bg-emerald-500 text-white shadow-lg" : "bg-slate-800 text-slate-400"
                )}>
                    <CalendarCheck className="h-6 w-6" />
                </div>
                <div>
                    <h4 className={cn("text-lg font-black uppercase tracking-tight", decision === 'lanjut_ke_tahap_selanjutnya' && "text-emerald-400")}>Lanjut Tahap Selanjutnya</h4>
                    <p className="text-xs font-medium mt-1 opacity-80 leading-relaxed">Kandidat akan diloloskan dan berpindah ke tahap berikutnya dalam sistem kandidat.</p>
                </div>
            </button>

            <button
                type="button"
                onClick={() => !isFormLocked && setDecision('pending_internal')}
                disabled={!!isFormLocked}
                className={cn(
                    "p-6 rounded-[2rem] border-2 flex flex-col items-start gap-4 transition-all duration-300 relative overflow-hidden text-left",
                    decision === 'pending_internal'
                        ? "border-amber-500 bg-amber-500/10 text-amber-400 shadow-2xl shadow-amber-500/20"
                        : "border-slate-800 bg-slate-900/40 text-slate-500 hover:border-amber-500/30 hover:bg-slate-900/60",
                    isFormLocked && "opacity-60 cursor-not-allowed"
                )}
            >
                <div className={cn(
                    "p-3 rounded-xl", 
                    decision === 'pending_internal' ? "bg-amber-500 text-white shadow-lg" : "bg-slate-800 text-slate-400"
                )}>
                    <PauseCircle className="h-6 w-6" />
                </div>
                <div>
                    <h4 className={cn("text-lg font-black uppercase tracking-tight", decision === 'pending_internal' && "text-amber-400")}>Pending Internal</h4>
                    <p className="text-xs font-medium mt-1 opacity-80 leading-relaxed">Disimpan untuk nanti. Kandidat tetap melihat status 'Sedang Diproses' (tanpa notifikasi).</p>
                </div>
            </button>

            <button
                type="button"
                onClick={() => !isFormLocked && setDecision('tidak_dilanjutkan_saat_ini')}
                disabled={!!isFormLocked}
                className={cn(
                    "p-6 rounded-[2rem] border-2 flex flex-col items-start gap-4 transition-all duration-300 relative overflow-hidden text-left",
                    decision === 'tidak_dilanjutkan_saat_ini'
                        ? "border-rose-500 bg-rose-500/10 text-rose-400 shadow-2xl shadow-rose-500/20"
                        : "border-slate-800 bg-slate-900/40 text-slate-500 hover:border-rose-500/30 hover:bg-slate-900/60",
                    isFormLocked && "opacity-60 cursor-not-allowed"
                )}
            >
                <div className={cn(
                    "p-3 rounded-xl", 
                    decision === 'tidak_dilanjutkan_saat_ini' ? "bg-rose-500 text-white shadow-lg" : "bg-slate-800 text-slate-400"
                )}>
                    <XCircle className="h-6 w-6" />
                </div>
                <div>
                    <h4 className={cn("text-lg font-black uppercase tracking-tight", decision === 'tidak_dilanjutkan_saat_ini' && "text-rose-400")}>Tidak Dilanjutkan</h4>
                    <p className="text-xs font-medium mt-1 opacity-80 leading-relaxed">Status internal saja. Kandidat tidak menerima notifikasi reject / tetap terlihat menunggu.</p>
                </div>
            </button>
        </div>

        <div className="space-y-4">
            <label className="text-xs font-black text-slate-400 uppercase tracking-[0.25em] pl-4 border-l-4 border-violet-500 flex items-center gap-2">
                <MessageSquareDiff className="h-4 w-4 text-violet-400" />
                Catatan / Alasan Keputusan (Wajib)
            </label>
            <Textarea 
                placeholder="Tuliskan alasan mengapa keputusan ini diambil, baik untuk catatan arsip atau untuk mereview kembali nanti..." 
                className={cn(
                    "min-h-[120px] rounded-[2rem] text-sm border-2 border-slate-800 bg-slate-900/50 text-slate-200 focus:border-violet-500/50 focus:ring-4 focus:ring-violet-500/10 transition-all p-6 shadow-inner",
                    isFormLocked && "opacity-70"
                )}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={!!isFormLocked}
            />
        </div>

        {isHRD && !isFormLocked && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-6 pt-4 border-t border-slate-800/50">
                <div className="text-slate-500 text-xs font-bold bg-amber-500/10 text-amber-400/80 px-5 py-3 rounded-full border border-amber-500/20 flex items-center gap-2">
                    <Lock className="h-4 w-4 shrink-0" />
                    Menyimpan keputusan akan mengunci revisi evaluasi internal tim.
                </div>
                <Button 
                    onClick={handleSubmit} 
                    disabled={isSubmitting || !decision || note.length < 5}
                    className="w-full sm:w-auto px-12 h-14 rounded-[2rem] font-black uppercase tracking-widest text-sm shadow-2xl shadow-violet-500/30 transition-all hover:scale-105 bg-violet-600 hover:bg-violet-500 text-white border-0"
                >
                    {isSubmitting ? <Loader2 className="mr-3 h-5 w-5 animate-spin" /> : null}
                    {isSubmitting ? 'MENYIMPAN...' : existingDecision ? 'UPDATE KEPUTUSAN' : 'SIMPAN KEPUTUSAN FINAL'}
                </Button>
            </div>
        )}
      </CardContent>
    </Card>
  );
}
