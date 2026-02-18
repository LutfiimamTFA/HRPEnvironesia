'use client';

import { useMemo, useState, useCallback, ChangeEvent, useEffect } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where, serverTimestamp, writeBatch, doc } from 'firebase/firestore';
import { getStorage, ref, uploadBytesResumable, getDownloadURL, UploadTask } from 'firebase/storage';
import type { JobApplication } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { FileUp, Loader2, UploadCloud, CheckCircle, XCircle, FileCheck, Info, Eye, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';

interface UploadedFile {
  url: string;
  name: string;
}

interface DocumentUploadSlotProps {
  label: string;
  fileType: 'cv' | 'ijazah';
  userId: string;
  applicationId: string;
  initialFile: UploadedFile | null;
  onUploadComplete: (fileType: 'cv' | 'ijazah', file: UploadedFile) => void;
  onDelete: (fileType: 'cv' | 'ijazah') => void;
}

function DocumentUploadSlot({ label, fileType, userId, applicationId, initialFile, onUploadComplete, onDelete }: DocumentUploadSlotProps) {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [task, setTask] = useState<UploadTask | null>(null);

  const effectiveFile = file ? { name: file.name, url: '' } : initialFile;

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setProgress(0);
    setFile(null);
    if (task) {
      task.cancel();
      setTask(null);
    }
    
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (selectedFile.size > 5 * 1024 * 1024) { // 5MB limit
      setError('Ukuran file tidak boleh lebih dari 5MB.');
      return;
    }
    
    setFile(selectedFile);
    
    const storage = getStorage();
    const filePath = `userDocs/${userId}/${applicationId}/${fileType}-${selectedFile.name}`;
    const storageRef = ref(storage, filePath);
    const uploadTask = uploadBytesResumable(storageRef, selectedFile);
    
    setTask(uploadTask);

    uploadTask.on('state_changed',
      (snapshot) => setProgress((snapshot.bytesTransferred / snapshot.totalBytes) * 100),
      (error) => setError('Gagal mengunggah file. Silakan coba lagi.'),
      () => {
        getDownloadURL(uploadTask.snapshot.ref).then((downloadURL) => {
          onUploadComplete(fileType, { url: downloadURL, name: selectedFile.name });
          setTask(null);
        });
      }
    );
  };
  
  const handleDelete = () => {
    if (task) task.cancel();
    setTask(null);
    setFile(null);
    setProgress(0);
    setError(null);
    onDelete(fileType);
  }

  const isUploading = progress > 0 && progress < 100;
  const isComplete = !!effectiveFile && !isUploading && !error;

  return (
    <div className="space-y-2">
      <label className="font-medium">{label} (.pdf, .jpg, .png, maks 5MB)</label>
      <div className={cn("flex flex-col w-full p-6 border-2 border-dashed rounded-lg transition-colors min-h-[190px] justify-center",
        isComplete && "border-green-500 bg-green-50/50",
        !!error && "border-destructive bg-destructive/10"
      )}>
        {isComplete ? (
          <div className="text-center">
             <FileCheck className="mx-auto h-10 w-10 text-green-600" />
             <p className="mt-2 font-semibold truncate max-w-xs mx-auto" title={effectiveFile.name}>{effectiveFile.name}</p>
             <div className="flex justify-center items-center gap-2 mt-4">
                <Button asChild variant="outline" size="sm">
                  <a href={effectiveFile.url} target="_blank" rel="noopener noreferrer">
                    <Eye className="mr-2 h-4 w-4"/> Lihat
                  </a>
                </Button>
                <Button variant="destructive" size="sm" onClick={handleDelete}>
                  <Trash2 className="mr-2 h-4 w-4"/> Hapus
                </Button>
             </div>
          </div>
        ) : error ? (
           <div className="text-center text-destructive">
            <XCircle className="mx-auto h-10 w-10" />
            <p className="mt-2 font-semibold">Unggah Gagal</p>
            <p className="text-xs">{error}</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={handleDelete}>Coba Lagi</Button>
          </div>
        ) : isUploading ? (
          <div className="w-full text-center">
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
            <p className="mt-2 font-semibold">Mengunggah...</p>
            <p className="text-sm truncate max-w-xs mx-auto">{file?.name}</p>
            <Progress value={progress} className="mt-2" />
          </div>
        ) : (
          <div className="text-center">
            <UploadCloud className="mx-auto h-10 w-10 text-muted-foreground" />
            <label htmlFor={`${fileType}-upload`} className="mt-2 text-sm font-semibold text-primary hover:underline cursor-pointer">
              Pilih file untuk diunggah
            </label>
            <input id={`${fileType}-upload`} type="file" className="sr-only" onChange={handleFileChange} accept=".pdf,.jpg,.jpeg,.png" />
          </div>
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
  const [uploads, setUploads] = useState<{ cv: UploadedFile | null, ijazah: UploadedFile | null }>({ cv: null, ijazah: null });

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

  useEffect(() => {
    if (applicationsToProcess && applicationsToProcess.length > 0) {
      const app = applicationsToProcess[0];
      setUploads({
        cv: app.cvUrl && app.cvFileName ? { url: app.cvUrl, name: app.cvFileName } : null,
        ijazah: app.ijazahUrl && app.ijazahFileName ? { url: app.ijazahUrl, name: app.ijazahFileName } : null,
      });
    }
  }, [appsLoading, applicationsToProcess]);

  const handleUploadComplete = (fileType: 'cv' | 'ijazah', file: UploadedFile) => {
    setUploads(prev => ({ ...prev, [fileType]: file }));
  };
  
  const handleUploadDelete = (fileType: 'cv' | 'ijazah') => {
    setUploads(prev => ({...prev, [fileType]: null}));
  }

  const handleSubmitDocuments = async () => {
    if (!applicationsToProcess || applicationsToProcess.length === 0 || !uploads.cv || !uploads.ijazah) return;
    setIsSubmitting(true);
    
    const batch = writeBatch(firestore);
    applicationsToProcess.forEach(app => {
      const appRef = doc(firestore, 'applications', app.id!);
      batch.update(appRef, {
        cvUrl: uploads.cv?.url,
        ijazahUrl: uploads.ijazah?.url,
        cvFileName: uploads.cv?.name,
        ijazahFileName: uploads.ijazah?.name,
        status: 'verification',
        updatedAt: serverTimestamp(),
      });
    });

    try {
      await batch.commit();
      toast({
        title: "Dokumen Berhasil Dikirim",
        description: "Dokumen Anda akan diverifikasi oleh tim HRD.",
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
          <DocumentUploadSlot
            label="Curriculum Vitae (CV)"
            fileType="cv"
            initialFile={uploads.cv}
            onUploadComplete={handleUploadComplete}
            onDelete={handleUploadDelete}
            userId={userProfile!.uid}
            applicationId={applicationsToProcess[0].id!}
          />
          <DocumentUploadSlot
            label="Ijazah / SKL"
            fileType="ijazah"
            initialFile={uploads.ijazah}
            onUploadComplete={handleUploadComplete}
            onDelete={handleUploadDelete}
            userId={userProfile!.uid}
            applicationId={applicationsToProcess[0].id!}
          />
        </div>

        <Separator />

        <div className="flex justify-end">
          <Button
            size="lg"
            disabled={!uploads.cv || !uploads.ijazah || isSubmitting}
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
