'use client';

import { useMemo, useState, useCallback, ChangeEvent } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where, serverTimestamp, writeBatch, doc } from 'firebase/firestore';
import { getStorage, ref, uploadBytesResumable, getDownloadURL, UploadTask } from 'firebase/storage';
import type { JobApplication } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { FileUp, Loader2, UploadCloud, CheckCircle, XCircle, FileCheck, Info, FileWarning } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';

interface FileUploadState {
  file: File | null;
  progress: number;
  url: string | null;
  error: string | null;
  task: UploadTask | null;
}

const initialUploadState: FileUploadState = {
  file: null,
  progress: 0,
  url: null,
  error: null,
  task: null,
};

function FileUploadSlot({ label, fileType, onUploadComplete, userId, applicationId }: {
  label: string;
  fileType: 'cv' | 'ijazah';
  onUploadComplete: (fileType: 'cv' | 'ijazah', url: string) => void;
  userId: string;
  applicationId: string;
}) {
  const [uploadState, setUploadState] = useState<FileUploadState>(initialUploadState);
  const storage = getStorage();

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      setUploadState({ ...initialUploadState, error: 'Ukuran file tidak boleh lebih dari 5MB.' });
      return;
    }

    setUploadState({ ...initialUploadState, file });

    const filePath = `userDocs/${userId}/${applicationId}/${fileType}-${file.name}`;
    const storageRef = ref(storage, filePath);
    const uploadTask = uploadBytesResumable(storageRef, file);

    setUploadState(prev => ({ ...prev, task: uploadTask }));

    uploadTask.on('state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        setUploadState(prev => ({ ...prev, progress }));
      },
      (error) => {
        setUploadState(prev => ({ ...prev, error: 'Gagal mengunggah file. Silakan coba lagi.' }));
      },
      () => {
        getDownloadURL(uploadTask.snapshot.ref).then((downloadURL) => {
          setUploadState(prev => ({ ...prev, url: downloadURL, progress: 100, error: null }));
          onUploadComplete(fileType, downloadURL);
        });
      }
    );
  };

  const isUploading = uploadState.progress > 0 && uploadState.progress < 100;
  const isComplete = !!uploadState.url;

  return (
    <div className="space-y-2">
      <label className="font-medium">{label} (.pdf, .jpg, .png)</label>
      <div className={cn("flex flex-col items-center justify-center w-full p-6 border-2 border-dashed rounded-lg",
        isComplete && "border-green-500 bg-green-50",
        !!uploadState.error && "border-destructive bg-destructive/10"
      )}>
        {isComplete ? (
          <div className="text-center text-green-600">
            <CheckCircle className="mx-auto h-10 w-10" />
            <p className="mt-2 font-semibold">Unggah Berhasil</p>
            <p className="text-xs truncate max-w-xs">{uploadState.file?.name}</p>
          </div>
        ) : !!uploadState.error ? (
          <div className="text-center text-destructive">
            <XCircle className="mx-auto h-10 w-10" />
            <p className="mt-2 font-semibold">Unggah Gagal</p>
            <p className="text-xs">{uploadState.error}</p>
            <p className="text-xs mt-2">Silakan segarkan halaman dan coba lagi.</p>
          </div>
        ) : isUploading ? (
          <div className="w-full text-center">
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
            <p className="mt-2 font-semibold">Mengunggah...</p>
            <Progress value={uploadState.progress} className="mt-2" />
          </div>
        ) : (
          <>
            <UploadCloud className="h-10 w-10 text-muted-foreground" />
            <label htmlFor={`${fileType}-upload`} className="mt-2 text-sm font-semibold text-primary hover:underline cursor-pointer">
              Pilih file untuk diunggah
            </label>
            <input id={`${fileType}-upload`} type="file" className="sr-only" onChange={handleFileChange} accept=".pdf,.jpg,.jpeg,.png" />
            <p className="text-xs text-muted-foreground">Maks. 5MB</p>
          </>
        )}
      </div>
    </div>
  );
}

export default function DocumentsPage() {
  const { userProfile, loading: authLoading } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploads, setUploads] = useState<{ cvUrl?: string; ijazahUrl?: string }>({});

  const applicationsToProcessQuery = useMemoFirebase(() => {
    if (!userProfile?.uid) return null;
    return query(
      collection(firestore, 'applications'),
      where('candidateUid', '==', userProfile.uid),
      where('status', '==', 'document_submission')
    );
  }, [userProfile?.uid, firestore]);

  const { data: applicationsToProcess, isLoading: appsLoading } = useCollection<JobApplication>(applicationsToProcessQuery);
  const isLoading = authLoading || appsLoading;

  const handleUploadComplete = (fileType: 'cv' | 'ijazah', url: string) => {
    setUploads(prev => ({ ...prev, [`${fileType}Url`]: url }));
  };

  const handleSubmitDocuments = async () => {
    if (!applicationsToProcess || applicationsToProcess.length === 0 || !uploads.cvUrl || !uploads.ijazahUrl) return;
    setIsSubmitting(true);
    
    const batch = writeBatch(firestore);
    applicationsToProcess.forEach(app => {
      const appRef = doc(firestore, 'applications', app.id!);
      batch.update(appRef, {
        cvUrl: uploads.cvUrl,
        ijazahUrl: uploads.ijazahUrl,
        status: 'interview',
        updatedAt: serverTimestamp(),
      });
    });

    try {
      await batch.commit();
      toast({
        title: "Dokumen Berhasil Dikirim",
        description: "Lamaran Anda telah maju ke tahap selanjutnya.",
      });
      // The useCollection hook will update automatically
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Gagal Mengirim Dokumen',
        description: error.message || 'Terjadi kesalahan pada server.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (!applicationsToProcess || applicationsToProcess.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Dokumen</CardTitle>
          <CardDescription>Kelola CV, portofolio, dan dokumen pendukung lainnya.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center p-8 border rounded-lg bg-muted/50 flex flex-col items-center gap-4">
            <FileCheck className="h-12 w-12 text-muted-foreground" />
            <p className="font-medium">Tidak Ada Permintaan Dokumen</p>
            <p className="text-sm text-muted-foreground max-w-md">
              Saat ini tidak ada lamaran Anda yang memerlukan pengumpulan dokumen. Anda akan melihat formulir unggah di sini jika sudah waktunya.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pengumpulan Dokumen</CardTitle>
        <CardDescription>
          Selamat! Anda telah maju ke tahap pengumpulan dokumen. Silakan unggah file yang diminta di bawah ini.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Perhatian</AlertTitle>
          <AlertDescription>
            Dokumen yang Anda unggah di sini akan digunakan untuk semua lamaran yang sedang dalam tahap ini ({applicationsToProcess.length} lamaran).
          </AlertDescription>
        </Alert>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FileUploadSlot
            label="Curriculum Vitae (CV)"
            fileType="cv"
            onUploadComplete={handleUploadComplete}
            userId={userProfile!.uid}
            applicationId={applicationsToProcess[0].id!}
          />
          <FileUploadSlot
            label="Ijazah / SKL"
            fileType="ijazah"
            onUploadComplete={handleUploadComplete}
            userId={userProfile!.uid}
            applicationId={applicationsToProcess[0].id!}
          />
        </div>

        <Separator />

        <div className="flex justify-end">
          <Button
            size="lg"
            disabled={!uploads.cvUrl || !uploads.ijazahUrl || isSubmitting}
            onClick={handleSubmitDocuments}
          >
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
            Kirim Dokumen
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
