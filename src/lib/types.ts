import type { Timestamp } from 'firebase/firestore';

export const ROLES = ['super_admin', 'hrd', 'manager', 'kandidat', 'karyawan'] as const;

export type UserRole = (typeof ROLES)[number];

export type UserProfile = {
  uid: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Timestamp | { seconds: number; nanoseconds: number };
};
