
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
  prompt: `Anda adalah seorang analis HR yang sangat berpengalaman dan ahli dalam mengevaluasi kesesuaian kandidat dengan lowongan pekerjaan. Tugas Anda adalah memberikan analisis yang tajam, seimbang, dan komprehensif berdasarkan data yang diberikan.

Output harus dalam Bahasa Indonesia.

**Konteks:**
Seorang kandidat telah melamar untuk sebuah posisi. Anda diberikan data profil kandidat (pengalaman kerja, pendidikan, keahlian) dan juga kualifikasi khusus yang dibutuhkan untuk posisi tersebut.

**Tugas Anda:**

1.  **Analisis Keseluruhan (summary):** Berikan ringkasan 2-3 kalimat yang mengevaluasi seberapa cocok kandidat ini untuk peran tersebut. Pertimbangkan semua aspek: pengalaman kerja yang relevan, latar belakang pendidikan, dan keahlian yang dimiliki. Bersikaplah objektif.

2.  **Skor Kecocokan (score):** Berikan skor numerik antara 1 hingga 100 yang merepresentasikan tingkat kecocokan kandidat.
    -   **1-40:** Kurang cocok. Banyak kualifikasi penting yang tidak terpenuhi.
    -   **41-70:** Cukup cocok. Memenuhi sebagian kualifikasi, namun ada beberapa kesenjangan.
    -   **71-90:** Sangat cocok. Memenuhi sebagian besar kualifikasi penting.
    -   **91-100:** Kandidat ideal. Hampir semua kualifikasi terpenuhi dengan sangat baik.

3.  **Kekuatan (strengths):** Identifikasi dan sebutkan 3-5 poin paling relevan di mana profil kandidat sangat cocok dengan kualifikasi yang dibutuhkan. Jadilah spesifik. Contoh: "Pengalaman sebagai Manajer Proyek selama 5 tahun cocok dengan kebutuhan."

4.  **Potensi Kesenjangan (weaknesses):** Identifikasi dan sebutkan 2-3 area di mana profil kandidat mungkin kurang atau tidak memenuhi kualifikasi. Sampaikan dengan cara yang konstruktif. Contoh: "Belum memiliki pengalaman dengan framework 'Vue.js' yang disebutkan."

**Data untuk Dianalisis:**

**Kualifikasi Khusus Pekerjaan:**
\`\`\`html
{{{jobRequirements}}}
\`\`\`

**Profil Kandidat:**
\`\`\`json
{{{candidateProfile}}}
\`\`\`

Lakukan analisis Anda sekarang.
`,
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
