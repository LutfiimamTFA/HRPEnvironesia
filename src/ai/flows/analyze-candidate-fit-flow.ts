'use server';
/**
 * @fileOverview An AI flow to analyze a candidate's fit for a job.
 *
 * - analyzeCandidateFit - A function that provides a detailed analysis of a candidate's profile against job requirements.
 */

import { ai } from '@/ai/genkit';
import { 
    CandidateFitAnalysisInputSchema, 
    CandidateFitAnalysisOutputSchema
} from '@/ai/schemas/candidate-analysis-schemas';
import type { CandidateFitAnalysisInput, CandidateFitAnalysisOutput } from '@/ai/schemas/candidate-analysis-schemas';


const prompt = ai.definePrompt({
  name: 'analyzeCandidateFitPrompt',
  input: {schema: CandidateFitAnalysisInputSchema},
  output: {schema: CandidateFitAnalysisOutputSchema},
  prompt: `KAMU ADALAH HR ANALYST. JANGAN BERASUMSI. DILARANG menulis “diasumsikan/mungkin” tanpa bukti dari CV.

INPUT:
1) Job Requirement (teks):
\`\`\`html
{{{jobRequirements}}}
\`\`\`
2) CV Kandidat (teks):
\`\`\`json
{{{candidateProfile}}}
\`\`\`

OUTPUT WAJIB (format terstruktur, ringkas, bisa dipakai HRD ambil keputusan):
A. Recommended Decision: {advance_interview | advance_test | hold | reject}
B. Confidence: {high | medium | low} + alasan 3 bullet
C. Requirement Match Matrix (WAJIB):
   - requirement
   - type: must-have / nice-to-have
   - match: yes / partial / no
   - evidence_from_cv: kutip teks CV atau sebut bagian spesifik CV
   - risk_note (jika partial/no)
D. Score Breakdown (0-100) per dimensi:
   - Relevant Experience
   - Admin/Documentation
   - Communication/Teamwork
   - Analytical/Problem Solving
   - Tools/Hard Skills
   - Initiative/Ownership
   - Culture Fit (dengan alasan)
E. Strengths (maks 5) — setiap poin wajib ada evidence_from_cv
F. Gaps/Risks (maks 5) — setiap poin wajib ada dampak + mitigasi onboarding
G. Red Flags (jika ada)
H. Interview Questions (10) + “jawaban ideal singkat”
I. Quick Test Recommendation (maks 3) sesuai role (misal excel, writing, case)
J. Missing Information to Ask Candidate (maks 5)

KETENTUAN:
- Jika must-have tidak terpenuhi -> Recommended Decision minimal “hold” atau “reject” dengan alasan jelas.
- Semua klaim harus punya evidence_from_cv. Jika tidak ada, tulis “NOT FOUND IN CV”.
- HASILKAN SEMUA OUTPUT DALAM BAHASA INDONESIA.`,
});

const analyzeCandidateFitFlow = ai.defineFlow(
  {
    name: 'analyzeCandidateFitFlow',
    inputSchema: CandidateFitAnalysisInputSchema,
    outputSchema: CandidateFitAnalysisOutputSchema,
  },
  async (input: CandidateFitAnalysisInput) => {
    const {output} = await prompt(input);
    return output!;
  }
);

export async function analyzeCandidateFit(input: CandidateFitAnalysisInput): Promise<CandidateFitAnalysisOutput> {
  return analyzeCandidateFitFlow(input);
}
