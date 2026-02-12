import type { Timestamp } from 'firebase/firestore';

export const ROLES = ['super-admin', 'hrd', 'manager', 'kandidat', 'karyawan'] as const;

export type UserRole = (typeof ROLES)[number];

export type UserProfile = {
  uid: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Timestamp | { seconds: number; nanoseconds: number };
  brandId?: string | string[];
};

export type Brand = {
  id?: string;
  name: string;
};
