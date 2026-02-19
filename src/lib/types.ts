
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
  numberOfOpenings?: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
  updatedBy: string;
};

export const APPLICATION_STATUSES = ['draft', 'submitted', 'tes_kepribadian', 'verification', 'document_submission', 'interview', 'hired', 'rejected'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

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
  status: ApplicationStatus;
  jobApplyDeadline?: Timestamp | null;
  personalityTestAssignedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  submittedAt?: Timestamp;
  cvUrl?: string;
  ijazahUrl?: string;
  cvFileName?: string;
  ijazahFileName?: string;
};

export type Education = {
    id: string;
    institution: string;
    level: 'SMA/SMK' | 'D3' | 'S1' | 'S2' | 'S3';
    fieldOfStudy?: string;
    gpa?: string;
    startDate: string;
    endDate?: string;
    isCurrent: boolean;
}

export const JOB_TYPES = ['internship', 'pkwt', 'kwtt', 'outsourcing', 'freelance'] as const;
export type JobType = (typeof JOB_TYPES)[number];
export const JOB_TYPE_LABELS: Record<JobType, string> = {
    internship: 'Internship (Magang)',
    pkwt: 'PKWT (Kontrak)',
    kwtt: 'KWTT (Tetap)',
    outsourcing: 'Outsourcing',
    freelance: 'Freelance/Kontrak Harian'
};

export type WorkExperience = {
    id: string;
    company: string;
    position: string;
    jobType?: JobType;
    startDate: string;
    endDate?: string;
    isCurrent: boolean;
    description?: string;
    reasonForLeaving?: string;
}

export type OrganizationalExperience = {
    id: string;
    organization: string;
    position: string;
    startDate: string;
    endDate?: string;
    isCurrent: boolean;
    description?: string;
}

export type Certification = {
    id: string;
    name: string;
    organization: string;
    issueDate: string; // Storing as YYYY-MM string
    expirationDate?: string; // Storing as YYYY-MM string
}

export type Address = {
    street: string;
    rt: string;
    rw: string;
    village: string;
    district: string;
    city: string;
    province: string;
    postalCode: string;
};

export type Profile = {
    fullName: string;
    nickname: string;
    email: string;
    phone: string;
    eKtpNumber: string;
    gender: 'Laki-laki' | 'Perempuan';
    birthPlace: string;
    birthDate: Timestamp;
    addressKtp: Address;
    addressDomicile: Address;
    isDomicileSameAsKtp: boolean;
    hasNpwp?: boolean;
    npwpNumber?: string;
    willingToWfo: boolean;
    linkedinUrl?: string;
    websiteUrl?: string;
    education: Education[];
    workExperience?: WorkExperience[];
    organizationalExperience?: OrganizationalExperience[];
    skills?: string[];
    certifications?: Certification[];
    selfDescription?: string;
    salaryExpectation?: string;
    motivation?: string;
    
    // Wizard metadata
    profileStatus?: 'draft' | 'completed';
    profileStep?: number;
    updatedAt?: Timestamp;
    completedAt?: Timestamp | null;
    
    declaration?: boolean;
};

// --- ASSESSMENT TYPES ---

export type AssessmentConfig = {
    id?: string;
    bigfiveCount: number;
    discCount: number;
    forcedChoiceCount?: number;
    updatedAt: Timestamp;
}

export type AssessmentFormat = 'likert' | 'forced-choice';

export type AssessmentTemplate = {
  id?: string;
  name: string;
  format: AssessmentFormat;
  engine: 'dual' | 'disc' | 'bigfive';
  scale: {
    type: 'likert';
    points: number;
    leftLabel: string;
    rightLabel: string;
    ui: 'bubbles';
  };
  dimensions: {
    disc: { key: string; label: string }[];
    bigfive: { key: string; label: string }[];
  };
  scoring: {
    method: 'sum';
    reverseEnabled: boolean;
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type Assessment = {
  id?: string;
  templateId: string;
  name: string;
  version: number;
  isActive: boolean;
  publishStatus: 'draft' | 'published';
  createdAt: Timestamp;
  updatedAt: Timestamp;
  questionConfig?: {
    bigfiveCount?: number;
    discCount?: number;
  };
  resultTemplates: {
    disc: Record<string, Partial<ResultTemplate>>;
    bigfive: Record<string, { highText: string; midText: string; lowText: string }>;
    overall: {
      summaryBlocks?: string[];
      interviewQuestions: string[];
      redFlags?: string[];
      developmentTips?: string[];
    };
  };
  rules?: {
    discRule?: 'highest';
    bigfiveNormalization?: 'minmax';
  };
};

export type ResultTemplate = {
    title: string;
    subtitle: string;
    blocks: string[];
    strengths: string[];
    risks: string[];
    roleFit: string[];
};

export type ForcedChoice = {
  text: string;
  dimensionKey: string;
  engineKey: 'disc' | 'bigfive';
};

export type AssessmentQuestion = {
  id?: string;
  assessmentId: string;
  type: 'likert' | 'forced-choice';
  order?: number;
  isActive: boolean;
  
  // Likert specific
  text?: string;
  engineKey?: 'disc' | 'bigfive';
  dimensionKey?: string;
  reverse?: boolean;
  weight?: number;

  // Forced-choice specific
  forcedChoices?: ForcedChoice[];
};

export type AssessmentSession = {
  id?: string;
  assessmentId: string;
  candidateUid: string;
  candidateName?: string;
  candidateEmail?: string;
  applicationId?: string;
  jobPosition?: string;
  brandName?: string;
  status: 'draft' | 'submitted';
  currentTestPart?: 'likert' | 'forced-choice';
  selectedQuestionIds?: {
    likert: string[];
    forcedChoice: string[];
  };
  answers: { [questionId: string]: number | { most: string; least: string } };
  scores: {
    disc: Record<string, number>;
    bigfive: Record<string, number>;
  };
  normalized?: {
    bigfive: Record<string, number>;
  };
  result?: {
    discType: string;
    mbtiArchetype: {
        archetype: string;
        code: string;
    } | null;
    report: Partial<ResultTemplate> & { bigfiveSummary?: any[], interviewQuestions?: any[] };
  };
  hrdDecision?: 'pending' | 'approved' | 'rejected';
  hrdDecisionAt?: Timestamp;
  hrdDecisionBy?: string;
  startedAt: Timestamp;
  updatedAt: Timestamp;
  completedAt?: Timestamp;
};


// --- AI ANALYSIS TYPES ---

export type RecommendedDecision = 'advance_interview' | 'advance_test' | 'hold' | 'reject';

export type Confidence = {
  level: 'high' | 'medium' | 'low';
  reasons: string[];
};

export type RequirementMatch = {
  requirement: string;
  type: 'must-have' | 'nice-to-have';
  match: 'yes' | 'partial' | 'no';
  evidence_from_cv: string;
  risk_note?: string;
};

export type ScoreBreakdown = {
  relevantExperience: number;
  adminDocumentation: number;
  communicationTeamwork: number;
  analyticalProblemSolving: number;
  toolsHardSkills: number;
  initiativeOwnership: number;
  cultureFit: {
    score: number;
    reason: string;
  };
};

export type Strength = {
  strength: string;
  evidence_from_cv: string;
};

export type GapRisk = {
  gap: string;
  impact: string;
  onboarding_mitigation: string;
};

export type InterviewQuestion = {
  question: string;
  ideal_answer: string;
};

export type CandidateFitAnalysisOutput = {
  recommendedDecision: RecommendedDecision;
  confidence: Confidence;
  requirementMatchMatrix: RequirementMatch[];
  scoreBreakdown: ScoreBreakdown;
  strengths: Strength[];
  gapsRisks: GapRisk[];
  redFlags?: string[];
  interviewQuestions: InterviewQuestion[];
  quickTestRecommendation: string[];
  missingInformation: string[];
};

    