
import { z } from 'genkit';

const SimplifiedWorkExperienceSchema = z.object({
  company: z.string(),
  position: z.string(),
  jobType: z.string().optional(),
  startDate: z.string(),
  endDate: z.string().optional(),
  isCurrent: z.boolean(),
  description: z.string().optional(),
});

const SimplifiedEducationSchema = z.object({
  institution: z.string(),
  level: z.string(),
  fieldOfStudy: z.string().optional(),
});

const SimplifiedProfileSchema = z.object({
  skills: z.array(z.string()).optional().describe("Daftar keahlian yang dimiliki kandidat."),
  workExperience: z.array(SimplifiedWorkExperienceSchema).optional().describe("Riwayat pengalaman kerja kandidat."),
  education: z.array(SimplifiedEducationSchema).optional().describe("Riwayat pendidikan kandidat."),
});


export const CandidateFitAnalysisInputSchema = z.object({
    candidateProfile: SimplifiedProfileSchema.describe("Objek JSON yang berisi profil kandidat."),
    jobRequirements: z.string().describe("String HTML yang berisi kualifikasi khusus untuk pekerjaan tersebut."),
});
export type CandidateFitAnalysisInput = z.infer<typeof CandidateFitAnalysisInputSchema>;

export const CandidateFitAnalysisOutputSchema = z.object({
  summary: z.string().describe("Ringkasan analisis 2-3 kalimat mengenai kecocokan kandidat."),
  score: z.number().int().min(1).max(100).describe("Skor kecocokan numerik dari 1 hingga 100."),
  strengths: z.array(z.string()).describe("Daftar 3-5 poin kekuatan utama kandidat yang cocok dengan pekerjaan."),
  weaknesses: z.array(z.string()).describe("Daftar 2-3 potensi kesenjangan atau area yang kurang cocok."),
});
export type CandidateFitAnalysisOutput = z.infer<typeof CandidateFitAnalysisOutputSchema>;
