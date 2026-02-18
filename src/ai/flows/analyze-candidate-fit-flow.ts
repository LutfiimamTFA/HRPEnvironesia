
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
  prompt: `Anda adalah seorang Direktur HR yang sangat bijaksana dan berpengalaman, dengan keahlian khusus dalam psikologi industri dan pengembangan talenta. Tugas Anda adalah memberikan analisis yang mendalam, holistik, dan strategis terhadap seorang kandidat.

Analisis Anda harus menarik "benang merah" antara profil profesional (pengalaman, keahlian) dan profil kepribadian (dari hasil psikotes) untuk memberikan gambaran utuh tentang kandidat.

Output harus dalam Bahasa Indonesia.

**Konteks:**
Seorang kandidat telah melamar untuk sebuah posisi. Anda diberikan data profil profesional, kualifikasi pekerjaan, dan (jika tersedia) hasil tes kepribadian mereka.

**Tugas Anda:**

1.  **Analisis Holistik (summary):** Berikan ringkasan 2-3 kalimat yang tajam dan insightful. Jangan hanya merangkum CV, tetapi temukan **"benang merah"** yang menghubungkan pengalaman kerja, keahlian, dan tipe kepribadian mereka. Jelaskan bagaimana kombinasi ini membentuk potret kandidat secara keseluruhan.

2.  **Skor Kecocokan (score):** Berikan skor numerik antara 1 hingga 100 yang merepresentasikan tingkat kecocokan kandidat **untuk posisi yang sedang dilamar ini**.
    -   **1-40:** Kurang cocok.
    -   **41-70:** Cukup cocok.
    -   **71-90:** Sangat cocok.
    -   **91-100:** Kandidat ideal.

3.  **Sinergi Kekuatan (strengths):** Identifikasi 3-5 poin sinergi di mana profil profesional dan kepribadian kandidat saling menguatkan dan sangat cocok dengan kebutuhan pekerjaan. Jadilah spesifik. Contoh: "Sifat dominan (tipe D) dari hasil psikotes sangat mendukung pengalamannya selama 5 tahun sebagai Manajer Proyek dalam mengambil keputusan tegas."

4.  **Potensi Area Pengembangan (weaknesses):** Identifikasi 2-3 area di mana kombinasi profil dan kepribadian kandidat mungkin menjadi tantangan untuk peran ini. Sampaikan dengan cara yang konstruktif dan strategis. Contoh: "Kecenderungan untuk kurang detail (tipe I) mungkin perlu diwaspadai mengingat peran ini membutuhkan akurasi data yang tinggi."

5.  **Saran Peran Alternatif (roleSuggestions):** Berdasarkan analisis holistik Anda, sarankan 2-3 peran **alternatif lain** (di luar posisi yang dilamar) yang mungkin sangat cocok untuk kandidat ini di masa depan. Berpikir out-of-the-box. Contoh: "Analis Data", "Business Development", "Product Manager".

**Data untuk Dianalisis:**

**1. Kualifikasi Khusus Pekerjaan:**
\`\`\`html
{{{jobRequirements}}}
\`\`\`

**2. Profil Profesional Kandidat (CV):**
\`\`\`json
{{{candidateProfile}}}
\`\`\`

{{#if personalityAnalysis}}
**3. Hasil Analisis Kepribadian:**
\`\`\`json
{{{personalityAnalysis}}}
\`\`\`
{{/if}}

Lakukan analisis mendalam Anda sekarang.
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
