'use client';

import { useState, useMemo, useEffect, ReactNode } from 'react';
import { useCollection, useFirestore, useMemoFirebase, updateDocumentNonBlocking, writeBatch } from '@/firebase';
import { collection, query, where, doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import type { DailyReport, UserProfile, EmployeeProfile, Brand } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format, formatDistanceToNow } from 'date-fns';
import { id } from 'date-fns/locale';
import { Loader2, Eye, Search, RotateCcw, AlertTriangle, Check, CheckCircle, XCircle, FileClock, PenSquare, ThumbsUp, MessageSquareWarning, FileText } from 'lucide-react';
import { ReviewReportDialog } from './ReviewReportDialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { KpiCard } from '@/components/recruitment/KpiCard';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { BulkRevisionDialog } from './BulkRevisionDialog';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type ReportWithDetails = DailyReport & { internName?: string; supervisorName?: string; division?: string; brandName?: string; brandId?: string; };

const statusLabels: Record<DailyReport['status'], string> = {
    submitted: 'Terkirim',
    needs_revision: 'Perlu Revisi',
    approved: 'Disetujui',
    draft: 'Draf'
};

const statusColors: Record<DailyReport['status'], string> = {
    submitted: 'bg-blue-500',
    needs_revision: 'bg-yellow-500',
    approved: 'bg-green-500',
    draft: 'bg-gray-400'
};


const ReportPreview = ({ report, onReviewClick, onApproveClick, onReviseClick, isApproving }: { report: ReportWithDetails; onReviewClick: () => void; onApproveClick: () => void; onReviseClick: () => void, isApproving: boolean; }) => {
  
  const PreviewSection = ({ title, icon, content, lineClamp }: { title: string; icon: ReactNode; content?: string; lineClamp: string }) => (
    <div>
        <h4 className="font-semibold text-xs uppercase text-muted-foreground mb-1 flex items-center gap-2">{icon} {title}</h4>
        <p className={`text-sm ${lineClamp}`}>{content || '-'}</p>
    </div>
  );
  
  return (
    <div className="space-y-4 pt-2 pb-4 px-4 bg-muted/50 ml-12">
        <div className="space-y-3">
            <PreviewSection title="Aktivitas" icon={<FileText className="h-4 w-4" />} content={report.activity} lineClamp="line-clamp-3" />
            <PreviewSection title="Pembelajaran" icon={<ThumbsUp className="h-4 w-4" />} content={report.learning} lineClamp="line-clamp-2" />
            {report.obstacle && (
                <PreviewSection title="Kendala" icon={<MessageSquareWarning className="h-4 w-4" />} content={report.obstacle} lineClamp="line-clamp-2" />
            )}
        </div>
        <Separator />
        <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={onReviewClick}><Eye className="mr-2 h-4 w-4"/> Lihat Detail</Button>
            {report.status === 'submitted' && (
              <>
                <Button size="sm" variant="destructive" onClick={onReviseClick}><XCircle className="mr-2 h-4 w-4"/> Minta Revisi</Button>
                <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={onApproveClick} disabled={isApproving}>
                    {isApproving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <CheckCircle className="mr-2 h-4 w-4"/>} 
                    Setujui
                </Button>
              </>
            )}
        </div>
    </div>
  );
};


const MentorDashboard = ({ reports, onMutate, userProfile }: { reports: ReportWithDetails[], onMutate: () => void, userProfile: UserProfile}) => {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isBulkRevisionOpen, setIsBulkRevisionOpen] = useState(false);
    const [isBulkApproving, setIsBulkApproving] = useState(false);
    const [approvingId, setApprovingId] = useState<string | null>(null);
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
    const [activeTab, setActiveTab] = useState('submitted');
    const { toast } = useToast();
    const firestore = useFirestore();
    const [selectedReport, setSelectedReport] = useState<ReportWithDetails | null>(null);

    const groupedByIntern = useMemo(() => {
        return reports.reduce((acc, report) => {
            if (!acc[report.uid]) {
                acc[report.uid] = {
                    internName: report.internName || 'Unknown',
                    reports: []
                };
            }
            acc[report.uid].reports.push(report);
            return acc;
        }, {} as Record<string, { internName: string; reports: ReportWithDetails[] }>);
    }, [reports]);

    const internIds = Object.keys(groupedByIntern);

    const reportsForCurrentTabAndIntern = (internId: string) => {
        const internGroup = groupedByIntern[internId];
        if (!internGroup) return [];

        const filtered = internGroup.reports.filter(r => r.status === activeTab);
        return filtered.sort((a,b) => {
            const timeA = a.submittedAt?.toMillis() || a.createdAt.toMillis();
            const timeB = b.submittedAt?.toMillis() || b.createdAt.toMillis();
            return sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
        });
    }
    
    const handleSelectAllForIntern = (internId: string, checked: boolean) => {
        const reportIds = (groupedByIntern[internId]?.reports || [])
            .filter(r => r.status === 'submitted')
            .map(r => r.id!);
            
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            if (checked) {
                reportIds.forEach(id => newSet.add(id));
            } else {
                reportIds.forEach(id => newSet.delete(id));
            }
            return newSet;
        });
    }

    const handleSelectOne = (reportId: string, checked: boolean) => {
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            if (checked) {
                newSet.add(reportId);
            } else {
                newSet.delete(reportId);
            }
            return newSet;
        });
    }

    const handleBulkApprove = async () => {
        if (selectedIds.size === 0 || !userProfile) return;
        setIsBulkApproving(true);
        
        const batch = writeBatch(firestore);
        selectedIds.forEach(id => {
            const ref = doc(firestore, 'daily_reports', id);
            batch.update(ref, { 
                status: 'approved',
                reviewedAt: serverTimestamp(),
                reviewedByUid: userProfile.uid,
                reviewedByName: userProfile.fullName,
                reviewerNotes: null,
             });
        });

        try {
            await batch.commit();
            toast({ title: 'Sukses', description: `${selectedIds.size} laporan telah disetujui.` });
            setSelectedIds(new Set());
            onMutate();
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Gagal', description: e.message });
        } finally {
            setIsBulkApproving(false);
        }
    };
    
    const handleSingleApprove = async (reportId: string) => {
      if (!userProfile) return;
      setApprovingId(reportId);
      try {
        const ref = doc(firestore, 'daily_reports', reportId);
        await updateDocumentNonBlocking(ref, { 
            status: 'approved',
            reviewedAt: serverTimestamp(),
            reviewedByUid: userProfile.uid,
            reviewedByName: userProfile.fullName,
            reviewerNotes: null // Clear notes on approval
        });
        toast({ title: 'Laporan Disetujui' });
        onMutate();
      } catch (e: any) {
        toast({ variant: 'destructive', title: 'Gagal', description: e.message });
      } finally {
        setApprovingId(null);
      }
    };

    const handleReviewSuccess = () => {
        onMutate();
        setSelectedReport(null);
    };

    return (
      <div className="space-y-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
                <TabsTrigger value="submitted">Menunggu Review</TabsTrigger>
                <TabsTrigger value="needs_revision">Perlu Revisi</TabsTrigger>
                <TabsTrigger value="approved">Disetujui</TabsTrigger>
            </TabsList>
        </Tabs>

        {internIds.length === 0 ? (
            <p className="text-center text-muted-foreground py-10">Tidak ada laporan yang perlu direview saat ini.</p>
        ) : (
            <Accordion type="multiple" className="w-full space-y-2" defaultValue={internIds}>
                {internIds.map(internId => {
                    const internGroup = groupedByIntern[internId];
                    const reportsForTab = reportsForCurrentTabAndIntern(internId);
                    const allSelectedForIntern = activeTab === 'submitted' && reportsForTab.length > 0 && reportsForTab.every(r => selectedIds.has(r.id!));

                    if (reportsForTab.length === 0) return null;

                    return (
                        <AccordionItem value={internId} key={internId} className="border rounded-lg bg-card">
                            <AccordionTrigger className="px-4 py-3 hover:no-underline text-lg">
                                <div className="flex items-center gap-3">
                                    <Avatar className="h-9 w-9"><AvatarFallback>{getInitials(internGroup.internName)}</AvatarFallback></Avatar>
                                    {internGroup.internName}
                                    <Badge variant="secondary">{reportsForTab.length} Laporan</Badge>
                                </div>
                            </AccordionTrigger>
                            <AccordionContent className="px-1 border-t">
                                <div className="p-2">
                                     {activeTab === 'submitted' && (
                                        <div className="flex items-center gap-3 p-2 border-b">
                                            <Checkbox
                                                id={`select-all-${internId}`}
                                                checked={allSelectedForIntern}
                                                onCheckedChange={(checked) => handleSelectAllForIntern(internId, !!checked)}
                                            />
                                            <label htmlFor={`select-all-${internId}`} className="text-sm font-medium">Pilih semua untuk {internGroup.internName}</label>
                                        </div>
                                     )}
                                </div>
                                <Accordion type="single" collapsible className="w-full space-y-1 px-2 pb-2">
                                    {reportsForTab.map(report => (
                                        <AccordionItem value={report.id!} key={report.id!} className="border rounded-md bg-background">
                                            <div className="flex items-center gap-2 pr-4">
                                                {activeTab === 'submitted' && (
                                                    <div className="p-4">
                                                        <Checkbox
                                                            checked={selectedIds.has(report.id!)}
                                                            onCheckedChange={(checked) => handleSelectOne(report.id!, !!checked)}
                                                            onClick={e => e.stopPropagation()}
                                                        />
                                                    </div>
                                                )}
                                                <AccordionTrigger className="flex-1 hover:no-underline">
                                                    <div className="flex justify-between items-center w-full">
                                                        <div className="text-left">
                                                            <p className="font-semibold">{format(report.date.toDate(), 'eeee, dd MMM', { locale: id })}</p>
                                                            <p className="text-xs text-muted-foreground">Diajukan: {formatDistanceToNow(report.submittedAt?.toDate() || report.createdAt.toDate(), { addSuffix: true, locale: id })}</p>
                                                        </div>
                                                    </div>
                                                </AccordionTrigger>
                                            </div>
                                            <AccordionContent>
                                                <ReportPreview
                                                    report={report}
                                                    onReviewClick={() => setSelectedReport(report)}
                                                    onApproveClick={() => handleSingleApprove(report.id!)}
                                                    onReviseClick={() => setSelectedReport(report)}
                                                    isApproving={approvingId === report.id}
                                                />
                                            </AccordionContent>
                                        </AccordionItem>
                                    ))}
                                </Accordion>
                                {reportsForTab.length === 0 && <p className="text-center text-sm text-muted-foreground py-4">Tidak ada laporan di tab ini.</p>}
                            </AccordionContent>
                        </AccordionItem>
                    )
                })}
            </Accordion>
        )}
        
        {selectedIds.size > 0 && (
            <div className="sticky bottom-4 z-50 flex items-center justify-center">
                <div className="flex items-center gap-4 rounded-lg border bg-card p-3 shadow-2xl">
                    <p className="text-sm font-medium">{selectedIds.size} laporan terpilih</p>
                    <Separator orientation="vertical" className="h-6" />
                    <Button size="sm" variant="destructive" onClick={() => setIsBulkRevisionOpen(true)}>Minta Revisi</Button>
                    <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={handleBulkApprove} disabled={isBulkApproving}>
                        {isBulkApproving && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                        Setujui Terpilih
                    </Button>
                </div>
            </div>
        )}
        <BulkRevisionDialog 
            open={isBulkRevisionOpen}
            onOpenChange={setIsBulkRevisionOpen}
            reportIds={Array.from(selectedIds)}
            onSuccess={() => { setSelectedIds(new Set()); onMutate(); }}
        />
        {selectedReport && (<ReviewReportDialog open={!!selectedReport} onOpenChange={(isOpen) => !isOpen && setSelectedReport(null)} report={selectedReport} onSuccess={handleReviewSuccess}/>)}
      </div>
    )
}

export function LaporanMagangClient() {
  const { userProfile, firebaseUser } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [selectedReport, setSelectedReport] = useState<ReportWithDetails | null>(null);
  
  const [brandFilter, setBrandFilter] = useState('all');
  const [supervisorFilter, setSupervisorFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isBackfilling, setIsBackfilling] = useState(false);

  const reportsQuery = useMemoFirebase(() => {
    if (!userProfile) return null;

    if (['manager', 'karyawan'].includes(userProfile.role)) {
      return query(collection(firestore, 'daily_reports'), where('supervisorUid', '==', userProfile.uid));
    }
    
    if (['hrd', 'super-admin'].includes(userProfile.role)) {
      return collection(firestore, 'daily_reports');
    }

    // Default to a query that returns nothing for other roles
    return query(collection(firestore, 'daily_reports'), where('uid', '==', 'nonexistent-user'));
  }, [firestore, userProfile]);
  const { data: reports, isLoading: isLoadingReports, mutate: mutateReports } = useCollection<DailyReport>(reportsQuery);

  const { data: interns, isLoading: isLoadingInterns } = useCollection<EmployeeProfile>(
    useMemoFirebase(() => query(collection(firestore, 'employee_profiles'), where('employmentType', '==', 'magang')), [firestore])
  );
  
  const { data: brands, isLoading: isLoadingBrands } = useCollection<Brand>(
    useMemoFirebase(() => collection(firestore, 'brands'), [firestore])
  );

  const internMap = useMemo(() => new Map(interns?.map(i => [i.uid, i])), [interns]);
  
  const reportsWithDetails: ReportWithDetails[] = useMemo(() => {
    if (!reports) return [];
    return reports.map(report => {
        const internProfile = internMap.get(report.uid);
        return { 
          ...report, 
          internName: internProfile?.fullName || 'Unknown Intern', 
          supervisorUid: report.supervisorUid || internProfile?.supervisorUid || null, 
          supervisorName: report.supervisorName || internProfile?.supervisorName || 'Unassigned', 
          division: internProfile?.division || 'N/A', 
          brandName: internProfile?.brandName || 'N/A', 
          brandId: internProfile?.brandId || 'N/A' 
        };
    }).sort((a, b) => b.date.toMillis() - a.date.toMillis());
  }, [reports, internMap]);

  const reportsNeedingBackfill = useMemo(() => {
    if (!reportsWithDetails) return [];
    // Only HRD/Admins should see this, and only if they are viewing all reports
    if (userProfile?.role === 'hrd' || userProfile?.role === 'super-admin') {
        return reportsWithDetails.filter(r => r.status === 'submitted' && !r.supervisorUid);
    }
    return [];
  }, [reportsWithDetails, userProfile]);
  
  const uniqueSupervisors = useMemo(() => {
    if (!interns) return [];
    const supervisorSet = new Set<string>();
    interns.forEach(intern => { if (intern.supervisorName && intern.supervisorName !== 'Unassigned') { supervisorSet.add(intern.supervisorName); }});
    return Array.from(supervisorSet).sort();
  }, [interns]);

  const filteredReportsForAdmin = useMemo(() => {
    let filtered = reportsWithDetails;
    if (brandFilter !== 'all') { filtered = filtered.filter(r => r.brandId === brandFilter); }
    if (supervisorFilter !== 'all') { filtered = filtered.filter(r => r.supervisorName === supervisorFilter); }
    if (searchTerm.trim() !== '') { const lowercasedSearch = searchTerm.toLowerCase(); filtered = filtered.filter(r => r.internName.toLowerCase().includes(lowercasedSearch)); }
    return filtered;
  }, [reportsWithDetails, brandFilter, supervisorFilter, searchTerm]);

  const kpiData = useMemo(() => {
    const submitted = filteredReportsForAdmin.filter(r => r.status === 'submitted').length;
    const needs_revision = filteredReportsForAdmin.filter(r => r.status === 'needs_revision').length;
    const approved = filteredReportsForAdmin.filter(r => r.status === 'approved').length;
    return { submitted, needs_revision, approved, totalReports: filteredReportsForAdmin.length };
  }, [filteredReportsForAdmin]);

  const handleReviewSuccess = () => {
    mutateReports();
    setSelectedReport(null);
  };
  
  const handleResetFilters = () => {
    setBrandFilter('all');
    setSupervisorFilter('all');
    setSearchTerm('');
  };

  const handleBackfill = async () => {
    if (!firebaseUser) return;
    setIsBackfilling(true);
    try {
        const idToken = await firebaseUser.getIdToken();
        const response = await fetch('/api/admin/backfill-daily-reports', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${idToken}` },
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || 'Failed to start backfill process.');
        }
        toast({ title: 'Sinkronisasi Selesai', description: `${result.updated} laporan diperbarui, ${result.skipped} laporan dilewati.` });
        mutateReports();
    } catch (e: any) {
        toast({ variant: 'destructive', title: 'Gagal Sinkronisasi', description: e.message });
    } finally {
        setIsBackfilling(false);
    }
  };

  const isLoading = isLoadingReports || isLoadingInterns || isLoadingBrands;

  if (isLoading) {
    return <div className="h-64 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }
  
  if (userProfile && ['manager', 'karyawan'].includes(userProfile.role)) {
    return (
      <MentorDashboard 
        reports={reportsWithDetails}
        onMutate={mutateReports}
        userProfile={userProfile}
      />
    );
  }

  return (
    <div className="space-y-6">
       <>
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-grow min-w-[200px]"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Cari nama intern..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-8" /></div>
                <Select value={brandFilter} onValueChange={setBrandFilter} disabled={isLoadingBrands}><SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Semua Brand" /></SelectTrigger><SelectContent><SelectItem value="all">Semua Brand</SelectItem>{brands?.map(b => <SelectItem key={b.id!} value={b.id!}>{b.name}</SelectItem>)}</SelectContent></Select>
                <Select value={supervisorFilter} onValueChange={setSupervisorFilter}><SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Semua Mentor" /></SelectTrigger><SelectContent><SelectItem value="all">Semua Mentor</SelectItem>{uniqueSupervisors.length > 0 ? (uniqueSupervisors.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)) : (<SelectItem value="no-mentors" disabled>Tidak ada mentor</SelectItem>)}</SelectContent></Select>
                <Button onClick={handleResetFilters} variant="ghost" size="sm" className="text-muted-foreground"><RotateCcw className="mr-2 h-4 w-4" />Reset</Button>
            </div>
            {reportsNeedingBackfill.length > 0 && (<Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Laporan Tidak Sinkron</AlertTitle><AlertDescription className="flex items-center justify-between"><p>{reportsNeedingBackfill.length} laporan terkirim tidak memiliki data mentor.</p><Button onClick={handleBackfill} disabled={isBackfilling}>{isBackfilling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Sinkronkan</Button></AlertDescription></Alert>)}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"><KpiCard title="Total Laporan" value={kpiData.totalReports} /><KpiCard title="Menunggu Review" value={kpiData.submitted} /><KpiCard title="Perlu Revisi" value={kpiData.needs_revision} deltaType="inverse" /><KpiCard title="Disetujui" value={kpiData.approved} /></div>
        </>

      <div className="rounded-lg border">
        <div className="p-4"><p className="text-sm text-muted-foreground">Tampilan untuk HRD. Semua laporan dari semua intern ditampilkan di sini.</p></div>
        <div className="border-t">
          <Table>
            <TableHeader><TableRow><TableHead>Nama Intern</TableHead><TableHead>Brand</TableHead><TableHead>Divisi</TableHead><TableHead>Tanggal</TableHead><TableHead>Mentor</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Aksi</TableHead></TableRow></TableHeader>
            <TableBody>
              {filteredReportsForAdmin.length > 0 ? filteredReportsForAdmin.map(report => (
                <TableRow key={report.id}><TableCell className="font-medium">{report.internName}</TableCell><TableCell>{report.brandName}</TableCell><TableCell>{report.division}</TableCell><TableCell>{format(report.date.toDate(), 'dd MMM', { locale: id })}</TableCell><TableCell>{report.supervisorName}</TableCell><TableCell><Badge className={statusColors[report.status]}>{statusLabels[report.status]}</Badge></TableCell><TableCell className="text-right"><Button variant="ghost" size="sm" onClick={() => setSelectedReport(report)}><Eye className="mr-2 h-4 w-4" /> Lihat</Button></TableCell></TableRow>
              )) : (<TableRow><TableCell colSpan={7} className="h-24 text-center">Tidak ada laporan untuk filter ini.</TableCell></TableRow>)}
            </TableBody>
          </Table>
        </div>
      </div>

      {selectedReport && (<ReviewReportDialog open={!!selectedReport} onOpenChange={(isOpen) => !isOpen && setSelectedReport(null)} report={selectedReport} onSuccess={handleReviewSuccess}/>)}
    </div>
  );
}
