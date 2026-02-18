'use server';
/**
 * @fileOverview An AI flow to analyze a candidate's specific answer in a personality test.
 *
 * - analyzeAnswer - A function that provides a brief psychological analysis of an answer.
 */

import { ai } from '@/ai/genkit';
import { 
    AnalyzeAnswerInputSchema, 
    AnalyzeAnswerOutputSchema,
} from '@/ai/schemas/assessment-schemas';
import type { AnalyzeAnswerInput, AnalyzeAnswerOutput } from '@/ai/schemas/assessment-schemas';


const prompt = ai.definePrompt({
  name: 'analyzeAnswerPrompt',
  input: {schema: AnalyzeAnswerInputSchema},
  output: {schema: AnalyzeAnswerOutputSchema},
  prompt: `Anda adalah seorang psikolog ahli HR. Tugas Anda adalah memberikan analisis singkat (satu kalimat) dalam Bahasa Indonesia tentang jawaban seorang kandidat pada sebuah tes kepribadian.

Konteks:
- Pertanyaan: "{{questionText}}"
- Dimensi yang Diukur: {{dimensionLabel}} ({{dimensionKey}})
- Jawaban Kandidat: {{answerValue}} - "{{answerScale}}"

Analisis Anda harus menjelaskan bagaimana jawaban spesifik ini berkontribusi pada penilaian dimensi yang diukur. Jaga agar tetap singkat, profesional, dan fokus pada interpretasi perilaku.

Contoh:
- Input: Pertanyaan "Saya suka mencoba hal-hal baru", Jawaban "7 - Sangat Setuju", Dimensi "Openness".
- Output: Jawaban ini menunjukkan keterbukaan kandidat yang tinggi terhadap pengalaman baru dan rasa ingin tahu yang kuat.
- Input: Pertanyaan "Saya tidak suka menjadi pusat perhatian", Jawaban "6 - Setuju", Dimensi "Extraversion" (dibalik).
- Output: Pilihan ini mengindikasikan kecenderungan kandidat ke arah introversi, di mana ia lebih nyaman di lingkungan yang tidak terlalu ramai.

Berikan analisis untuk input berikut:`,
});

const analyzeAnswerFlow = ai.defineFlow(
  {
    name: 'analyzeAnswerFlow',
    inputSchema: AnalyzeAnswerInputSchema,
    outputSchema: AnalyzeAnswerOutputSchema,
  },
  async (input: AnalyzeAnswerInput) => {
    const {output} = await prompt(input);
    return output!;
  }
);

export async function analyzeAnswer(input: AnalyzeAnswerInput): Promise<AnalyzeAnswerOutput> {
  return analyzeAnswerFlow(input);
}
