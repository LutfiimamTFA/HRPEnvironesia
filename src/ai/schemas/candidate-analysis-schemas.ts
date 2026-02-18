
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

const PersonalityAnalysisSchema = z.object({
  typeTitle: z.string().describe("Judul tipe kepribadian dari hasil tes, misal: 'Tipe Dominan'."),
  typeSubtitle: z.string().describe("Sub-judul atau deskripsi singkat tipe kepribadian."),
  strengths: z.array(z.string()).describe("Kekuatan berdasarkan hasil tes kepribadian."),
  risks: z.array(z.string()).describe("Potensi risiko atau area pengembangan berdasarkan tes."),
  roleFit: z.array(z.string()).describe("Rekomendasi peran yang cocok berdasarkan tes."),
}).optional();


export const CandidateFitAnalysisInputSchema = z.object({
    candidateProfile: SimplifiedProfileSchema.describe("Objek JSON yang berisi profil kandidat (CV, pengalaman, dll)."),
    jobRequirements: z.string().describe("String HTML yang berisi kualifikasi khusus untuk pekerjaan yang dilamar."),
    personalityAnalysis: PersonalityAnalysisSchema.describe("Hasil dari tes kepribadian kandidat (jika tersedia)."),
});
export type CandidateFitAnalysisInput = z.infer<typeof CandidateFitAnalysisInputSchema>;

export const CandidateFitAnalysisOutputSchema = z.object({
  summary: z.string().describe("Ringkasan analisis 2-3 kalimat yang holistik, menarik 'benang merah' antara profil profesional dan kepribadian kandidat."),
  score: z.number().int().min(1).max(100).describe("Skor kecocokan numerik dari 1 hingga 100 untuk posisi yang dilamar."),
  strengths: z.array(z.string()).describe("Daftar 3-5 poin kekuatan utama kandidat yang cocok dengan pekerjaan, gabungkan aspek profesional dan kepribadian."),
  weaknesses: z.array(z.string()).describe("Daftar 2-3 potensi kesenjangan atau area yang kurang cocok, gabungkan aspek profesional dan kepribadian."),
  roleSuggestions: z.array(z.string()).describe("Saran 2-3 peran alternatif lain yang mungkin cocok untuk kandidat berdasarkan profil keseluruhan, di luar posisi yang dilamar saat ini."),
});
export type CandidateFitAnalysisOutput = z.infer<typeof CandidateFitAnalysisOutputSchema>;
