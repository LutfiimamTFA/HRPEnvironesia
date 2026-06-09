'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Loader2, UploadCloud, Save, AlertCircle, Check, Copy } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { useFirestore, setDocumentNonBlocking, useFirebaseApp } from '@/firebase';
import { doc, collection, serverTimestamp } from 'firebase/firestore';
import { uploadFile } from '@/lib/storage/storage-adapter';
import {
  validateStorageFile,
  compressImage,
  handleStorageError
} from '@/lib/storage-utils';
import {
  getLogoPreviewUrl,
  getLogoSourceText,
  getLogoStatusText,
  getShortUrlDisplay,
  getLocalCompanyLogo
} from '@/lib/ecosystem-logo-utils';
import {
  getCompanyLogoSrc,
  LOGO_SIZES,
} from '@/lib/ecosystem-logo';
import type { EcosystemCompany, Brand } from '@/lib/types';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';

const formSchema = z.object({
  name: z.string().min(2, "Name is required."),
  websiteUrl: z.string().url("Please enter a valid URL."),
  iconFile: z.any().optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0, "Sort order must be a positive number."),
});

type FormValues = z.infer<typeof formSchema>;

interface EcosystemCompanyFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: EcosystemCompany | null;
  brands: Brand[];
}

export function EcosystemCompanyFormDialog({ open, onOpenChange, item, brands }: EcosystemCompanyFormDialogProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [logoSourceInfo, setLogoSourceInfo] = useState<{
    source: 'google_drive' | 'firebase_old' | 'local_fallback';
    url: string;
  } | null>(null);
  const firestore = useFirestore();
  const firebaseApp = useFirebaseApp();
  const { toast } = useToast();
  const { userProfile } = useAuth();
  const mode = item ? 'Edit' : 'Create';

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: item?.name || '',
        websiteUrl: item?.websiteUrl || '',
        isActive: item?.isActive ?? true,
        sortOrder: item?.sortOrder || 0,
        iconFile: undefined,
      });

      // Initialize logo preview with safe URL via API proxy
      if (item) {
        const logoInfo = getLogoPreviewUrl(item);
        setImagePreview(getCompanyLogoSrc(item));
        setLogoSourceInfo({
          source: logoInfo.source,
          url: item.iconUrl || '',
        });
      } else {
        setImagePreview(null);
        setLogoSourceInfo(null);
      }

      setSelectedFile(null);
      setUploadError(null);
    }
  }, [open, item, form]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const validation = validateStorageFile(file);
    if (!validation.isValid) {
      setUploadError(validation.message || 'File tidak valid');
      toast({
        variant: "destructive",
        title: "File Tidak Valid",
        description: validation.message
      });
      return;
    }
    setSelectedFile(file);
    setImagePreview(URL.createObjectURL(file));
    setUploadError(null);
    form.setValue('iconFile', file);
  };

  const uploadIcon = async (docId: string, file: File): Promise<{ url: string; driveFileId?: string; driveViewUrl?: string }> => {
    try {
      setIsUploadingLogo(true);
      setUploadError(null);

      const processedFile = await compressImage(file);
      const filePath = `ecosystem_logos/${docId}/${processedFile.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;

      const result = await uploadFile(processedFile, filePath, userProfile?.uid || 'ecosystem-admin', {
        category: 'ecosystem_logo',
        compress: false // Already compressed above
      });

      // Return webViewLink (dari Google Drive) atau downloadUrl sebagai fallback
      const iconUrl = result.webViewLink || result.downloadUrl || "";

      if (!iconUrl) {
        throw new Error("Upload berhasil tapi URL tidak diterima dari server.");
      }

      return {
        url: iconUrl,
        driveFileId: result.fileId,
        driveViewUrl: result.webViewLink || result.downloadUrl || "",
      };
    } catch (error: any) {
      const errorMessage = error?.message || 'Gagal upload logo';
      setUploadError(errorMessage);
      throw error;
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const onSubmit = async (values: FormValues) => {
    setIsSaving(true);
    try {
      const docRef = item ? doc(firestore, 'ecosystem_companies', item.id!) : doc(collection(firestore, 'ecosystem_companies'));

      // Handle logo: use uploaded file if provided, otherwise keep existing or use fallback
      let iconUrl = item?.iconUrl || '';
      let uploadResult = null;

      if (values.iconFile instanceof File) {
        uploadResult = await uploadIcon(docRef.id, values.iconFile);
        iconUrl = uploadResult.url;
      }

      // For new company, logo is required
      if (mode === 'Create' && !iconUrl) {
        throw new Error("Logo wajib diupload untuk perusahaan baru.");
      }

      const payload: Omit<EcosystemCompany, 'id'> = {
        name: values.name,
        websiteUrl: values.websiteUrl,
        iconUrl: iconUrl,
        isActive: values.isActive,
        sortOrder: values.sortOrder,
        createdAt: item?.createdAt || serverTimestamp() as any,
        updatedAt: serverTimestamp() as any,
      };

      // Add drive file ID and related fields if available from upload
      if (uploadResult) {
        (payload as any).driveFileId = uploadResult.driveFileId;
        (payload as any).iconFileId = uploadResult.driveFileId;
        (payload as any).driveViewUrl = uploadResult.driveViewUrl;
        (payload as any).logoSource = 'google_drive';
      }

      await setDocumentNonBlocking(docRef, payload, { merge: true });
      toast({
        title: `Company ${mode}d`,
        description: uploadResult ? `"${values.name}" berhasil disimpan dengan logo baru.` : `"${values.name}" berhasil disimpan.`
      });
      onOpenChange(false);
    } catch (e: any) {
      const errorMsg = e?.message || 'Gagal menyimpan perusahaan';
      setUploadError(errorMsg);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: errorMsg
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-2 border-b flex-shrink-0">
          <DialogTitle>{mode} Ecosystem Company</DialogTitle>
           <DialogDescription>
            Atur urutan untuk mengontrol posisi di landing page. Angka kecil akan tampil lebih dulu.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-grow">
          <div className="p-6">
            <Form {...form}>
              <form id="ecosystem-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company Name</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Pilih dari brand yang ada" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {brands.map((brand) => (
                                <SelectItem key={brand.id} value={brand.name}>
                                  {brand.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField control={form.control} name="websiteUrl" render={({ field }) => (<FormItem><FormLabel>Website URL</FormLabel><FormControl><Input type="url" {...field} /></FormControl><FormMessage /></FormItem>)} />
                  <FormField control={form.control} name="iconFile" render={({ field }) => {
                    const companyName = form.watch('name');
                    return (
                      <FormItem>
                        <FormLabel>Logo Perusahaan</FormLabel>

                        {/* Logo Preview Box */}
                        <div className="space-y-3">
                          {/* Preview Image - Larger for Edit Mode */}
                          <div className={LOGO_SIZES.detailContainer}>
                            {imagePreview ? (
                              <img
                                src={imagePreview}
                                alt={`${companyName} logo`}
                                className={LOGO_SIZES.detail}
                                onError={(e) => {
                                  e.currentTarget.src = getLocalCompanyLogo(companyName);
                                }}
                              />
                            ) : (
                              <div className="flex flex-col items-center justify-center text-center">
                                <UploadCloud className="w-8 h-8 mb-2 text-muted-foreground" />
                                <p className="text-sm text-muted-foreground">No logo selected</p>
                              </div>
                            )}
                          </div>

                          {/* Logo Info */}
                          {logoSourceInfo && !selectedFile && (
                            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3 space-y-2">
                              <div className="flex items-start gap-2">
                                <Check className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                                <div className="space-y-1">
                                  <p className="text-xs font-medium text-blue-900 dark:text-blue-100">
                                    {getLogoStatusText(logoSourceInfo.source).status}
                                  </p>
                                  <p className="text-xs text-blue-700 dark:text-blue-200">
                                    {getLogoSourceText(logoSourceInfo.source)}
                                  </p>
                                  {logoSourceInfo.url && (
                                    <p className="text-xs text-blue-600 dark:text-blue-300 break-all font-mono">
                                      {getShortUrlDisplay(logoSourceInfo.url)}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Selected File Info */}
                          {selectedFile && (
                            <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                              <p className="text-xs font-medium text-amber-900 dark:text-amber-100">
                                File baru dipilih: <span className="font-mono">{selectedFile.name}</span>
                              </p>
                            </div>
                          )}

                          {/* Upload Error */}
                          {uploadError && (
                            <Alert variant="destructive">
                              <AlertCircle className="h-4 w-4" />
                              <AlertDescription className="text-xs">{uploadError}</AlertDescription>
                            </Alert>
                          )}

                          {/* Upload Button */}
                          <FormControl>
                            <label htmlFor="icon-upload" className="flex items-center justify-center w-full px-4 py-2 border-2 border-dashed border-primary rounded-lg cursor-pointer hover:bg-primary/5 transition-colors">
                              <span className="flex items-center gap-2 text-sm font-medium text-primary">
                                <UploadCloud className="w-4 h-4" />
                                {selectedFile ? 'Ganti Logo' : 'Pilih Logo'}
                              </span>
                              <Input
                                id="icon-upload"
                                name={field.name}
                                type="file"
                                className="hidden"
                                onChange={handleFileChange}
                                accept="image/*"
                                disabled={isUploadingLogo}
                              />
                            </label>
                          </FormControl>

                          <p className="text-xs text-muted-foreground">
                            Format: PNG, JPG, WEBP • Ukuran max: 1 MB
                            {mode === 'Edit' && <span> • Opsional (gunakan logo lama jika tidak diubah)</span>}
                          </p>
                        </div>

                        <FormMessage />
                      </FormItem>
                    );
                  }} />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="sortOrder"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Sort Order</FormLabel>
                          <FormDescription>Angka kecil tampil duluan.</FormDescription>
                          <FormControl>
                            <Input type="number" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="isActive"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Status</FormLabel>
                          <div className="flex items-center space-x-2 h-10">
                            <FormControl>
                              <Switch
                                id="is-active-switch"
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <Label htmlFor="is-active-switch">Active</Label>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
              </form>
            </Form>
          </div>
        </ScrollArea>

        <DialogFooter className="p-6 pt-4 border-t flex-shrink-0">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="ecosystem-form" disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
