"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormDescription,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { UserProfile, ROLES, UserRole } from "@/lib/types";
import { Loader2, Eye, EyeOff, RefreshCw, Copy, Check } from "lucide-react";
import { useFirestore } from "@/firebase";
import { useAuth } from "@/providers/auth-provider";
import { doc, serverTimestamp, writeBatch } from "firebase/firestore";

const creatableRoles: UserRole[] = ["hrd", "manager", "karyawan"];
const allRolesForEdit: UserRole[] = [
  "super-admin",
  "hrd",
  "manager",
  "karyawan",
  "kandidat",
];

const roleDescriptions: Record<UserRole, string> = {
  "super-admin": "Akses penuh sistem dan manajemen user",
  hrd: "Pengelola data karyawan, cuti, izin, dan approval",
  manager: "Atasan yang memberi approval untuk tim mereka",
  karyawan: "User karyawan dengan akses terbatas",
  magang: "Peserta magang dan program bimbingan",
  kandidat: "Pelamar atau kandidat rekrutmen",
};

const createSchema = z
  .object({
    fullName: z.string().min(2, { message: "Nama lengkap minimal 2 karakter." }),
    email: z.string().email({ message: "Email tidak valid." }),
    password: z
      .string()
      .min(8, { message: "Password minimal 8 karakter." }),
    confirmPassword: z.string(),
    role: z.enum(ROLES),
    isActive: z.boolean().default(true),
    adminNotes: z.string().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Password dan konfirmasi password harus sama",
    path: ["confirmPassword"],
  });

const editSchema = z.object({
  fullName: z.string().min(2, { message: "Nama lengkap minimal 2 karakter." }),
  email: z.string().email({ message: "Email tidak valid." }),
  role: z.enum(ROLES),
  isActive: z.boolean().default(true),
  adminNotes: z.string().optional(),
});

type FormValues = z.infer<typeof createSchema> | z.infer<typeof editSchema>;

// Utility function to generate random password
function generateRandomPassword(length: number = 12): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

interface UserFormDialogProps {
  user: UserProfile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UserFormDialog({
  user,
  open,
  onOpenChange,
}: UserFormDialogProps) {
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const { firebaseUser } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const mode = user ? "edit" : "create";

  const form = useForm({
    resolver: zodResolver(mode === "create" ? createSchema : editSchema),
  });

  const role = form.watch("role");
  const password = form.watch("password");

  useEffect(() => {
    if (open) {
      const defaultValues =
        mode === "edit" && user
          ? {
              fullName: user.fullName,
              email: user.email,
              role: user.role,
              isActive: user.isActive,
              adminNotes: "",
            }
          : {
              fullName: "",
              email: "",
              password: "",
              confirmPassword: "",
              role: "karyawan",
              isActive: true,
              adminNotes: "",
            };
      form.reset(defaultValues as any);
    }
  }, [user, open, mode, form]);

  const cleanCreatePayload = (values: FormValues) => {
    const payload: any = {
      fullName: values.fullName,
      email: values.email,
      password: "password" in values ? values.password : undefined,
      role: values.role,
      isActive: values.isActive,
    };

    Object.keys(payload).forEach((key) => {
      if (payload[key] === undefined || payload[key] === null || payload[key] === "") {
        delete payload[key];
      }
    });

    return payload;
  };

  async function handleCreate(values: FormValues) {
    if (!firebaseUser) throw new Error("Authentication error. Please log in again.");

    const payload = cleanCreatePayload(values);
    const idToken = await firebaseUser.getIdToken();
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to create user.");

    toast({
      title: "User Berhasil Dibuat",
      description: `Akun untuk ${(values as any).fullName} telah dibuat.`,
    });
  }

  async function handleEdit(values: FormValues) {
    if (!user) throw new Error("User to edit is not specified.");

    const batch = writeBatch(firestore);
    const userRef = doc(firestore, "users", user.uid);
    const adminRoleRef = doc(firestore, "roles_admin", user.uid);
    const hrdRoleRef = doc(firestore, "roles_hrd", user.uid);

    const dataToUpdate: Partial<UserProfile> = {
      fullName: values.fullName,
      nameLower: values.fullName.toLowerCase(),
      role: values.role,
      isActive: values.isActive,
      updatedAt: serverTimestamp(),
    };
    batch.update(userRef, dataToUpdate);

    if (values.role === "super-admin") {
      batch.set(adminRoleRef, { role: "super-admin" });
    } else {
      batch.delete(adminRoleRef);
    }

    if (values.role === "hrd") {
      batch.set(hrdRoleRef, { role: "hrd" });
    } else {
      batch.delete(hrdRoleRef);
    }

    await batch.commit();
    toast({
      title: "User Berhasil Diupdate",
      description: `Profil ${values.fullName} telah diperbarui.`,
    });
  }

  async function onSubmit(values: FormValues) {
    setLoading(true);
    try {
      if (mode === "create") {
        await handleCreate(values);
      } else {
        await handleEdit(values);
      }
      onOpenChange(false);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: `Error: ${mode === "edit" ? "Mengupdate" : "Membuat"} User`,
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  }

  const handleGeneratePassword = () => {
    const pwd = generateRandomPassword();
    form.setValue("password", pwd);
    form.setValue("confirmPassword", pwd);
    setShowPassword(true);
  };

  const handleCopyPassword = () => {
    const pwd = form.getValues("password");
    navigator.clipboard.writeText(pwd);
    setCopiedPassword(true);
    setTimeout(() => setCopiedPassword(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 rounded-xl">
        {/* Header */}
        <DialogHeader className="p-6 pb-4 border-b flex-shrink-0">
          <DialogTitle className="text-2xl font-bold">
            {mode === "edit" ? "Edit Pengguna" : "Buat Pengguna Baru"}
          </DialogTitle>
          <DialogDescription className="text-base mt-2">
            {mode === "edit"
              ? "Perbarui informasi dan akses pengguna."
              : "Isi detail lengkap untuk membuat akun pengguna baru di sistem."}
          </DialogDescription>
        </DialogHeader>

        {/* Form Content */}
        <div className="flex-grow overflow-y-auto">
          <Form {...form}>
            <form
              id="user-form"
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-0 px-6 py-6"
            >
              {/* Section 1: Informasi Akun */}
              <div className="space-y-4 mb-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1 h-6 bg-primary rounded-full"></div>
                  <h3 className="text-lg font-bold">Informasi Akun</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="fullName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-semibold">Nama Lengkap *</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="contoh: John Doe"
                            {...field}
                            className="h-10"
                          />
                        </FormControl>
                        <FormDescription className="text-xs">
                          Nama lengkap sesuai identitas resmi
                        </FormDescription>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-semibold">Email *</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="contoh: user@company.com"
                            {...field}
                            readOnly={mode === "edit"}
                            className="h-10"
                          />
                        </FormControl>
                        <FormDescription className="text-xs">
                          {mode === "edit" ? "Email tidak bisa diubah" : "Email untuk login pengguna"}
                        </FormDescription>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />
                </div>

                {mode === "create" && (
                  <div className="space-y-4 pt-2">
                    <Card className="bg-muted/30 border border-dashed">
                      <CardContent className="pt-4">
                        <div className="flex items-center justify-between mb-3">
                          <label className="text-sm font-semibold">Password *</label>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={handleGeneratePassword}
                            className="text-xs h-8 gap-1.5"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Generate Acak
                          </Button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="password"
                            render={({ field }) => (
                              <FormItem>
                                <div className="relative">
                                  <FormControl>
                                    <Input
                                      type={showPassword ? "text" : "password"}
                                      placeholder="Minimal 8 karakter"
                                      {...field}
                                      className="h-10 pr-10"
                                      autoComplete="new-password"
                                    />
                                  </FormControl>
                                  <button
                                    type="button"
                                    onClick={() => setShowPassword((p) => !p)}
                                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground transition"
                                  >
                                    {showPassword ? (
                                      <EyeOff className="h-4 w-4" />
                                    ) : (
                                      <Eye className="h-4 w-4" />
                                    )}
                                  </button>
                                </div>
                                <FormMessage className="text-xs" />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="confirmPassword"
                            render={({ field }) => (
                              <FormItem>
                                <div className="relative">
                                  <FormControl>
                                    <Input
                                      type={showConfirmPassword ? "text" : "password"}
                                      placeholder="Konfirmasi password"
                                      {...field}
                                      className="h-10 pr-10"
                                      autoComplete="new-password"
                                    />
                                  </FormControl>
                                  <button
                                    type="button"
                                    onClick={() => setShowConfirmPassword((p) => !p)}
                                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground transition"
                                  >
                                    {showConfirmPassword ? (
                                      <EyeOff className="h-4 w-4" />
                                    ) : (
                                      <Eye className="h-4 w-4" />
                                    )}
                                  </button>
                                </div>
                                <FormMessage className="text-xs" />
                              </FormItem>
                            )}
                          />
                        </div>

                        {password && (
                          <button
                            type="button"
                            onClick={handleCopyPassword}
                            className="mt-3 w-full h-8 bg-primary/10 hover:bg-primary/20 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition"
                          >
                            {copiedPassword ? (
                              <>
                                <Check className="h-3.5 w-3.5" />
                                Disalin
                              </>
                            ) : (
                              <>
                                <Copy className="h-3.5 w-3.5" />
                                Salin Password
                              </>
                            )}
                          </button>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>

              {/* Section 2: Akses & Peran */}
              <div className="space-y-4 mb-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1 h-6 bg-primary rounded-full"></div>
                  <h3 className="text-lg font-bold">Akses & Peran</h3>
                </div>

                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-semibold">Role Sistem *</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={
                          mode === "edit" && user?.role === "super-admin"
                        }
                      >
                        <FormControl>
                          <SelectTrigger className="h-10">
                            <SelectValue placeholder="Pilih role..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(mode === "create"
                            ? creatableRoles
                            : allRolesForEdit
                          ).map((r) => (
                            <SelectItem key={r} value={r} className="capitalize">
                              {r.replace(/[-_]/g, " ").toUpperCase()}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription className="text-xs">
                        {roleDescriptions[role]}
                      </FormDescription>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />
              </div>

              {/* Section 3: Status Akun */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1 h-6 bg-primary rounded-full"></div>
                  <h3 className="text-lg font-bold">Status Akun</h3>
                </div>

                <Card className="bg-muted/30">
                  <CardContent className="pt-4">
                    <FormField
                      control={form.control}
                      name="isActive"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between">
                          <div className="space-y-1">
                            <FormLabel className="font-semibold">Akun Aktif</FormLabel>
                            <FormDescription className="text-xs">
                              Aktifkan atau nonaktifkan akses pengguna ke sistem
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                <FormField
                  control={form.control}
                  name="adminNotes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-semibold text-sm">Catatan Admin</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Catatan opsional untuk keperluan internal..."
                          {...field}
                          className="h-10 text-sm"
                        />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Catatan pribadi untuk catatan pembuatan akun
                      </FormDescription>
                    </FormItem>
                  )}
                />
              </div>
            </form>
          </Form>
        </div>

        {/* Footer */}
        <DialogFooter className="p-6 pt-4 border-t flex-shrink-0 bg-muted/20 rounded-b-xl">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Batal
          </Button>
          <Button
            type="submit"
            form="user-form"
            disabled={loading}
            className="gap-2"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "edit" ? "Simpan Perubahan" : "Buat Pengguna"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
