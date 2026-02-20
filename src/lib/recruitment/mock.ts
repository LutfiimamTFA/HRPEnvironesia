// @/lib/recruitment/mock.ts
import { Timestamp } from 'firebase/firestore';
import type { Job, Candidate, JobApplication, UserProfile, ApplicationStage, ApplicationSource } from '@/lib/types';

const now = new Date();
const toTimestamp = (date: Date) => Timestamp.fromDate(date);
const daysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return toTimestamp(date);
};

export const mockRecruiters: UserProfile[] = [
  { id: 'recruiter1', uid: 'recruiter1', fullName: 'Dina Anggraini', email: 'dina@example.com', role: 'hrd', isActive: true, createdAt: daysAgo(100), photoUrl: 'https://i.pravatar.cc/150?u=recruiter1' },
  { id: 'recruiter2', uid: 'recruiter2', fullName: 'Budi Santoso', email: 'budi@example.com', role: 'hrd', isActive: true, createdAt: daysAgo(100), photoUrl: 'https://i.pravatar.cc/150?u=recruiter2' },
];

export const mockJobs: Job[] = [
  {
    id: 'job1',
    position: 'Senior Frontend Engineer',
    slug: 'senior-frontend-engineer',
    statusJob: 'fulltime',
    division: 'Technology',
    location: 'Yogyakarta',
    brandId: 'brand1',
    brandName: 'Environesia',
    publishStatus: 'published',
    createdAt: daysAgo(45),
    updatedAt: daysAgo(5),
    createdBy: 'recruiter1',
    updatedBy: 'recruiter1',
    generalRequirementsHtml: '<p>General requirements...</p>',
    specialRequirementsHtml: '<p>Special requirements...</p>',
  },
  {
    id: 'job2',
    position: 'Data Analyst Intern',
    slug: 'data-analyst-intern',
    statusJob: 'internship',
    division: 'Data',
    location: 'Remote',
    brandId: 'brand2',
    brandName: 'Tech Innovate',
    publishStatus: 'published',
    createdAt: daysAgo(20),
    updatedAt: daysAgo(2),
    createdBy: 'recruiter2',
    updatedBy: 'recruiter2',
    generalRequirementsHtml: '<p>General requirements...</p>',
    specialRequirementsHtml: '<p>Special requirements...</p>',
  },
    {
    id: 'job3',
    position: 'UX/UI Designer',
    slug: 'ux-ui-designer',
    statusJob: 'contract',
    division: 'Design',
    location: 'Yogyakarta',
    brandId: 'brand1',
    brandName: 'Environesia',
    publishStatus: 'published',
    createdAt: daysAgo(60),
    updatedAt: daysAgo(10),
    createdBy: 'recruiter1',
    updatedBy: 'recruiter1',
    generalRequirementsHtml: '<p>General requirements...</p>',
    specialRequirementsHtml: '<p>Special requirements...</p>',
  },
];

export const mockCandidates: Candidate[] = Array.from({ length: 50 }, (_, i) => ({
  id: `candidate${i + 1}`,
  fullName: `Kandidat ${i + 1}`,
  email: `kandidat${i + 1}@email.com`,
  phone: '08123456789',
  city: i % 2 === 0 ? 'Yogyakarta' : 'Jakarta',
  createdAt: daysAgo(Math.floor(Math.random() * 90)),
  photoUrl: `https://i.pravatar.cc/150?u=candidate${i + 1}`,
}));

const stages: ApplicationStage[] = ['applied', 'screening', 'assessment', 'interview', 'offer', 'hired', 'rejected'];
const sources: ApplicationSource[] = ['linkedin', 'website', 'referral', 'jobstreet'];

export const mockApplications: JobApplication[] = mockCandidates.map((candidate, i) => {
  const job = mockJobs[i % mockJobs.length];
  const stageIndex = Math.floor(Math.random() * stages.length);
  const stage = stages[stageIndex];
  const appliedAtDays = Math.floor(Math.random() * 30) + 1;
  const stageEnteredAtDays = Math.max(1, appliedAtDays - Math.floor(Math.random() * appliedAtDays));
  const lastActivityAtDays = Math.max(1, stageEnteredAtDays - Math.floor(Math.random() * stageEnteredAtDays));

  return {
    id: `app${i + 1}`,
    candidateId: candidate.id!,
    jobId: job.id!,
    candidateName: candidate.fullName,
    candidateEmail: candidate.email,
    candidatePhotoUrl: candidate.photoUrl,
    jobPosition: job.position,
    jobLocation: job.location,
    stage: stage,
    appliedAt: daysAgo(appliedAtDays),
    stageEnteredAt: daysAgo(stageEnteredAtDays),
    lastActivityAt: daysAgo(lastActivityAtDays),
    source: sources[i % sources.length],
    assignedRecruiterId: mockRecruiters[i % mockRecruiters.length].id!,
    status: stage === 'hired' ? 'hired' : stage === 'rejected' ? 'rejected' : 'active',
    scoreManual: Math.floor(Math.random() * 5) + 1,
    scoreAssessment: Math.floor(Math.random() * 50) + 50,
    tags: i % 5 === 0 ? ['priority'] : [],
    // Legacy fields for compatibility
    candidateUid: candidate.id!,
    jobSlug: job.slug,
    brandId: job.brandId,
    brandName: job.brandName!,
    jobType: job.statusJob,
    location: job.location,
    createdAt: daysAgo(appliedAtDays),
    updatedAt: daysAgo(lastActivityAtDays),
    submittedAt: daysAgo(appliedAtDays),
  };
});
