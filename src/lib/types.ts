import type { Timestamp } from 'firebase/firestore';

export const ROLES = ['super-admin', 'hrd', 'manager', 'kandidat', 'karyawan'] as const;
export const ROLES_INTERNAL = ['super-admin', 'hrd', 'manager', 'karyawan'] as const;

export type UserRole = (typeof ROLES)[number];

export type UserProfile = {
  uid: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Timestamp | { seconds: number; nanoseconds: number };
  brandId?: string | string[];
  isProfileComplete?: boolean;
};

export type Brand = {
  id?: string;
  name: string;
  description?: string;
};

export type NavigationSetting = {
  id?: string;
  role: UserRole;
  visibleMenuItems: string[];
};

export type Job = {
  id?: string;
  position: string;
  slug: string;
  statusJob: 'fulltime' | 'internship' | 'contract';
  division: string;
  location: string;
  workMode?: 'onsite' | 'hybrid' | 'remote';
  brandId: string;
  brandName?: string; // Denormalized for convenience
  coverImageUrl?: string;
  generalRequirementsHtml: string;
  specialRequirementsHtml: string;
  publishStatus: 'draft' | 'published' | 'closed';
  applyDeadline?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
  updatedBy: string;
};

export type JobApplication = {
  id?: string;
  candidateUid: string;
  candidateName: string;
  candidateEmail: string;
  jobId: string;
  jobSlug: string;
  jobPosition: string;
  brandId: string;
  brandName: string;
  jobType: 'fulltime' | 'internship' | 'contract';
  location: string;
  status: 'draft' | 'submitted' | 'reviewed' | 'interview' | 'rejected' | 'hired';
  jobApplyDeadline?: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  submittedAt?: Timestamp;
};

export type Education = {
    id: string;
    institution: string;
    level: 'SMA/SMK' | 'D3' | 'S1' | 'S2' | 'S3';
    fieldOfStudy?: string;
    gpa?: string;
    startDate: string;
    endDate: string;
    isCurrent: boolean;
}

export type WorkExperience = {
    id: string;
    company: string;
    position: string;
    startDate: string;
    endDate: string;
    isCurrent: boolean;
    description: string;
}

export type Certification = {
    id: string;
    name: string;
    organization: string;
    issueDate: string; // Storing as YYYY-MM string
    expirationDate?: string; // Storing as YYYY-MM string
}

export type Profile = {
    fullName: string;
    nickname: string;
    email: string;
    phone: string;
    eKtpNumber: string;
    gender: 'Laki-laki' | 'Perempuan';
    birthDate: Timestamp;
    addressKtp: string;
    addressDomicile: string;
    isDomicileSameAsKtp: boolean;
    hasNpwp?: boolean;
    npwpNumber?: string;
    willingToWfo: boolean;
    linkedinUrl?: string;
    websiteUrl?: string;
    education: Education[];
    workExperience: WorkExperience[];
    skills: string[];
    certifications?: Certification[];
}
