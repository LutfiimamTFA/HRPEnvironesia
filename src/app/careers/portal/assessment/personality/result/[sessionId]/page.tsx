'use client';

import { useParams, useRouter } from 'next/navigation';
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import type { AssessmentSession } from '@/lib/types';
import { Loader2, CheckCircle, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Separator } from '@/components/ui/separator';

function ResultSkeleton() {
    return <div className="h-96 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>
}

export default function AssessmentResultPage() {
    const params = useParams();
    const sessionId = params.sessionId as string;
    const firestore = useFirestore();
    const router = useRouter();

    const sessionRef = useMemoFirebase(
        () => (sessionId ? doc(firestore, 'assessment_sessions', sessionId) : null),
        [firestore, sessionId]
    );

    const { data: session, isLoading, error } = useDoc<AssessmentSession>(sessionRef);

    if (isLoading) {
        return <ResultSkeleton />;
    }

    if (error || !session || !session.report) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Hasil Tidak Ditemukan</CardTitle>
                </CardHeader>
                <CardContent>
                    <p>Tidak dapat memuat hasil assessment Anda. Sesi mungkin tidak valid atau belum diselesaikan.</p>
                    {error && <pre className="mt-4 text-xs text-destructive">{error.message}</pre>}
                </CardContent>
            </Card>
        );
    }
    
    const { report } = session;

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <Card className="bg-gradient-to-br from-primary/90 to-primary text-primary-foreground text-center shadow-xl overflow-hidden">
                <CardHeader className="p-8 md:p-12">
                     <Badge variant="secondary" className="mx-auto w-fit text-sm px-4 py-1 mb-4">Hasil Tes Kepribadian Anda</Badge>
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
                    {report.descBlocks?.map((block, i) => <p key={i}>{block}</p>)}
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
                             {report.weaknesses?.map(item => <li key={item}>{item}</li>)}
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