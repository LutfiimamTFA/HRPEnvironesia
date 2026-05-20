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
import { useToast } from "@/hooks/use-toast";
import { UserProfile, ROLES, UserRole } from "@/lib/types";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { useFirestore } from "@/firebase";
import { useAuth } from "@/providers/auth-provider";
import { doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { Separator } from "../ui/separator";

const creatableRoles: UserRole[] = ["hrd", "manager"];
const allRolesForEdit: UserRole[] = [
  "super-admin",
  "hrd",
  "manager",
  "karyawan",
  "kandidat",
];

const createSchema = z.object({
  fullName: z.string().min(2, { message: "Full name is required." }),
  email: z.string().email({ message: "A valid email is required." }),
  password: z
    .string()
    .min(8, { message: "Password must be at least 8 characters." }),
  role: z.enum(ROLES),
  isActive: z.boolean().default(true),
});

const editSchema = z.object({
  fullName: z.string().min(2, { message: "Full name is required." }),
  email: z.string().email({ message: "A valid email is required." }),
  role: z.enum(ROLES),
  isActive: z.boolean().default(true),
});

type FormValues = z.infer<typeof createSchema> | z.infer<typeof editSchema>;

// --- Component Props ---
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
  const { firebaseUser, userProfile: currentUserProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const mode = user ? "edit" : "create";

  const form = useForm({
    resolver: zodResolver(mode === "create" ? createSchema : editSchema),
  });

  const role = form.watch("role");

  // Effect to reset form state when dialog opens or user prop changes
  useEffect(() => {
    if (open) {
      const defaultValues =
        mode === "edit" && user
          ? {
              fullName: user.fullName,
              email: user.email,
              role: user.role,
              isActive: user.isActive,
            }
          : {
              fullName: "",
              email: "",
              password: "",
              role: "hrd",
              isActive: true,
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
      if (
        payload[key] === undefined ||
        payload[key] === null ||
        payload[key] === ""
      ) {
        delete payload[key];
      }
    });

    return payload;
  };

  async function handleCreate(values: FormValues) {
    if (!firebaseUser)
      throw new Error("Authentication error. Please log in again.");

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
      title: "User Created",
      description: `An account for ${(values as any).fullName} has been created.`,
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
      title: "User Updated",
      description: `${values.fullName}'s profile has been updated.`,
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
        title: `Error: ${mode === "edit" ? "Updating" : "Creating"} User`,
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-4 border-b flex-shrink-0">
          <DialogTitle>
            {mode === "edit" ? "Edit Pengguna" : "Buat Pengguna Baru"}
          </DialogTitle>
          <DialogDescription>
            {mode === "edit"
              ? "Ubah detail pengguna di bawah ini."
              : "Isi detail untuk akun pengguna baru."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-grow overflow-y-auto">
          <Form {...form}>
            <form
              id="user-form"
              onSubmit={form.handleSubmit(onSubmit, (errors) => {
                if (Object.keys(errors).length > 0) {
                  toast({
                    variant: "destructive",
                    title: "Validasi gagal",
                    description:
                      "Periksa semua kolom wajib sebelum membuat pengguna.",
                  });
                }
              })}
              className="space-y-8 px-6 py-4"
            >
              <section className="space-y-4">
                <h3 className="text-lg font-semibold border-b pb-2 mb-4">
                  Informasi Akun
                </h3>
                <FormField
                  control={form.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nama Lengkap</FormLabel>
                      <FormControl>
                        <Input placeholder="John Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="user@example.com"
                          {...field}
                          readOnly={mode === "edit"}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {mode === "create" && (
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <div className="relative">
                          <FormControl>
                            <Input
                              type={showPassword ? "text" : "password"}
                              placeholder="********"
                              className="pr-10"
                              autoComplete="new-password"
                              {...field}
                            />
                          </FormControl>
                          <button
                            type="button"
                            onClick={() => setShowPassword((p) => !p)}
                            className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground"
                            aria-label={
                              showPassword ? "Hide password" : "Show password"
                            }
                          >
                            {showPassword ? (
                              <EyeOff className="h-5 w-5" />
                            ) : (
                              <Eye className="h-5 w-5" />
                            )}
                          </button>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </section>

              <Separator />

              <section className="space-y-4">
                <h3 className="text-lg font-semibold border-b pb-2 mb-4">
                  Hak Akses Sistem
                </h3>
                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={
                          mode === "edit" && user?.role === "super-admin"
                        }
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(mode === "create"
                            ? creatableRoles
                            : allRolesForEdit
                          ).map((r) => (
                            <SelectItem
                              key={r}
                              value={r}
                              className="capitalize"
                            >
                              {r.replace(/[-_]/g, " ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </section>

              <Separator />

              <section>
                <h3 className="text-lg font-semibold border-b pb-2 mb-4">
                  Status
                </h3>
                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                      <div className="space-y-0.5">
                        <FormLabel>Status Aktif</FormLabel>
                        <FormDescription>
                          Nonaktifkan untuk menonaktifkan sementara akses
                          pengguna.
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
              </section>
            </form>
          </Form>
        </div>
        <DialogFooter className="p-6 pt-4 border-t flex-shrink-0">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Batal
          </Button>
          <Button type="submit" form="user-form" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === "edit" ? "Simpan Perubahan" : "Buat Pengguna"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
