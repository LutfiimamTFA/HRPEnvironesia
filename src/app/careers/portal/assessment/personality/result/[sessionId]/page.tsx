// This file path is for the new non-locale structure.
// The content is taken from the original [locale] equivalent.
'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import type { AssessmentSession } from '@/lib/types';
import { Loader2, CheckCircle, ArrowRight, Atom } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

function ResultSkeleton() {
    return <div className="h-96 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>
}

function ProcessingState() {
  return (
    <div className="flex h-96 flex-col items-center justify-center space-y-4 text-center">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <h2 className="text-2xl font-bold">Sedang memproses hasil Anda...</h2>
      <p className="text-muted-foreground">
        Halaman ini akan diperbarui secara otomatis. Mohon tunggu sebentar.
      </p>
    </div>
  );
}

export default function AssessmentResultPage() {
    const params = useParams();
    const sessionId = params.sessionId as string;
    const firestore = useFirestore();

    const sessionRef = useMemoFirebase(
        () => (sessionId ? doc(firestore, 'assessment_sessions', sessionId) : null),
        [firestore, sessionId]
    );

    const { data: session, isLoading, error } = useDoc<AssessmentSession>(sessionRef);

    if (isLoading) {
        return <ResultSkeleton />;
    }

    if (error) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Terjadi Kesalahan</CardTitle>
                </CardHeader>
                <CardContent>
                    <p>Tidak dapat memuat data assessment. Silakan coba lagi nanti.</p>
                    <pre className="mt-4 text-xs text-destructive">{error.message}</pre>
                </CardContent>
            </Card>
        );
    }
    
    // Handles both session not found and report not yet generated
    if (!session || !session.result?.report) {
        return <ProcessingState />;
    }
    
    const { report, mbtiArchetype } = session.result;

    return (
        <div className="max-w-4xl mx-auto space-y-8">
             {mbtiArchetype && (
                <Card className="bg-violet-600 text-white shadow-xl overflow-hidden relative">
                     <Atom className="absolute -right-10 -top-10 h-48 w-48 text-white/10" />
                     <Atom className="absolute -left-16 bottom-4 h-48 w-48 text-white/10" />
                    <CardContent className="p-8 md:p-12 relative z-10">
                         <p className="text-violet-200">Tipe kepribadian Anda adalah:</p>
                         <h2 className="text-4xl md:text-5xl font-bold tracking-tight mt-1">{mbtiArchetype.archetype}</h2>
                         <p className="text-2xl text-violet-200 font-medium mt-2">{mbtiArchetype.code}</p>
                    </CardContent>
                </Card>
            )}

            <Card className="bg-gradient-to-br from-primary/90 to-primary text-primary-foreground text-center shadow-xl overflow-hidden">
                <CardHeader className="p-8 md:p-12">
                     <Badge variant="secondary" className="mx-auto w-fit text-sm px-4 py-1 mb-4">Tipe Kepribadian DISC</Badge>
                    <CardTitle className="text-4xl md:text-5xl font-bold tracking-tight">{report.title}</CardTitle>
                    <CardDescription className="text-lg md:text-xl text-primary-foreground/80 mt-2 max-w-2xl mx-auto">
                        {report.subtitle}
                    </CardDescription>
                </CardHeader>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Deskripsi Tipe Kepribadian</CardTitle>
                </CardHeader>
                <CardContent className="prose prose-lg max-w-none dark:prose-invert">
                    {report.blocks?.map((block, i) => <p key={i}>{block}</p>)}
                </CardContent>
            </Card>
            
            <div className="grid md:grid-cols-2 gap-8">
                <Card>
                    <CardHeader>
                        <CardTitle>Kekuatan Utama</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ul className="list-disc list-inside space-y-2">
                            {report.strengths?.map(item => <li key={item}>{item}</li>)}
                        </ul>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Area untuk Pengembangan</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ul className="list-disc list-inside space-y-2">
                             {report.risks?.map(item => <li key={item}>{item}</li>)}
                        </ul>
                    </CardContent>
                </Card>
            </div>
             <Card>
                <CardHeader>
                    <CardTitle>Rekomendasi Peran</CardTitle>
                    <CardDescription>Beberapa jenis pekerjaan yang mungkin cocok dengan tipe kepribadian Anda.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-3">
                    {report.roleFit?.map(role => <Badge key={role} variant="outline" className="text-base py-1 px-3">{role}</Badge>)}
                </CardContent>
            </Card>

            <Separator />
            
            <div className="text-center space-y-4">
                 <p className="flex items-center justify-center gap-2 text-lg font-medium text-green-600">
                    <CheckCircle className="h-6 w-6" />
                    Terima kasih telah menyelesaikan tes!
                </p>
                <p className="text-muted-foreground">Hasil ini telah disimpan dan akan menjadi bagian dari pertimbangan dalam proses lamaran Anda.</p>
                <Button asChild size="lg">
                    <Link href="/careers/portal/applications">
                        Kembali ke Lamaran Saya <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                </Button>
            </div>
        </div>
    )
}
