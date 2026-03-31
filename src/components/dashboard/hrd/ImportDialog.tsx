'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { UploadCloud } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportDialog({ open, onOpenChange }: ImportDialogProps) {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if(e.target.files) {
            setSelectedFile(e.target.files[0]);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Import Data Karyawan</DialogTitle>
                    <DialogDescription>
                        Unggah file CSV atau XLSX untuk menambah atau memperbarui data karyawan secara massal.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-6">
                   <div className="flex items-center justify-center w-full">
                        <label htmlFor="dropzone-file" className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer bg-muted hover:bg-muted/80">
                            <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                <UploadCloud className="w-8 h-8 mb-4 text-muted-foreground" />
                                {selectedFile ? (
                                    <>
                                        <p className="font-semibold text-foreground">{selectedFile.name}</p>
                                        <p className="text-xs text-muted-foreground">({(selectedFile.size / 1024).toFixed(2)} KB)</p>
                                    </>
                                ) : (
                                    <>
                                        <p className="mb-2 text-sm text-muted-foreground"><span className="font-semibold">Klik untuk mengunggah</span> atau seret file ke sini</p>
                                        <p className="text-xs text-muted-foreground">CSV, XLSX (Maks. 5MB)</p>
                                    </>
                                )}
                            </div>
                            <Input id="dropzone-file" type="file" className="hidden" onChange={handleFileChange} accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" />
                        </label>
                    </div> 
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Batal</Button>
                    <Button disabled={!selectedFile}>Lanjut ke Pemetaan Kolom</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
