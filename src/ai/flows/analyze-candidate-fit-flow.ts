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
  prompt: `KAMU ADALAH ANALIS HR REKRUTMEN AHLI. CV DIBERIKAN SEBAGAI FILE PDF / TEKS HASIL EKSTRAKSI.

ATURAN KERAS:
1. JANGAN PERNAH BERASUMSI. DILARANG menulis “diasumsikan/mungkin” tanpa bukti dari CV.
2. Semua klaim HARUS punya evidence_from_cv. Jika tidak ada, tulis “NOT FOUND IN CV”.
3. NOT_FOUND_IN_CV hanya boleh dipakai jika semua kata kunci yang relevan (termasuk sinonim) benar-benar tidak ditemukan.
4. ATURAN SPESIFIK "Microsoft Office":
   - Untuk requirement terkait "Microsoft Office", kamu WAJIB mencari sinonim berikut di seluruh CV: "Microsoft Office", "MS Office", "Word", "Excel", "PowerPoint", "Office".
   - Jika menemukan salah satu sinonim tersebut, kamu WAJIB menandai requirement ini sebagai match = yes atau partial, dan MENGUTIP bukti kalimatnya di evidence_from_cv.
5. Jika CV sulit dibaca (misal: hasil scan buram, teks sangat kecil, format acak-acakan), kamu WAJIB mengatur confidence = rendah dan jelaskan alasannya di bagian 'reasons'.

---

INPUT:
1) Job Requirement (teks HTML):
\`\`\`html
{{{jobRequirements}}}
\`\`\`
2) CV Kandidat (teks JSON):
\`\`\`json
{{{candidateProfile}}}
\`\`\`

---

OUTPUT WAJIB (format JSON terstruktur, ringkas, dalam BAHASA INDONESIA, bisa dipakai HRD ambil keputusan):
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

---

KETENTUAN TAMBAHAN:
- Jika ada requirement \`must-have\` yang tidak terpenuhi (\`match: no\`), maka Recommended Decision maksimal adalah “hold” atau “reject”, dengan alasan yang jelas di bagian Confidence.
- Hasil output harus selalu dalam Bahasa Indonesia.`,
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
