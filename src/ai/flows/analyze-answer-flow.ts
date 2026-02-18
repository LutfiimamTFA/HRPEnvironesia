'use server';
/**
 * @fileOverview An AI flow to analyze a candidate's specific answer in a personality test.
 *
 * - analyzeAnswer - A function that provides a brief psychological analysis of an answer.
 * - AnalyzeAnswerInput - The input type for the analyzeAnswer function.
 * - AnalyzeAnswerOutput - The return type for the analyzeAnswer function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

export const AnalyzeAnswerInputSchema = z.object({
    questionText: z.string().describe("The personality test question."),
    answerValue: z.number().describe("The candidate's answer on a Likert scale (1-7)."),
    answerScale: z.string().describe("The label for the answer value (e.g., 'Sangat Setuju')."),
    dimensionKey: z.string().describe("The psychological dimension key being measured (e.g., 'O' for Openness, 'D' for Dominance)."),
    dimensionLabel: z.string().describe("The full label for the dimension (e.g., 'Openness')."),
});
export type AnalyzeAnswerInput = z.infer<typeof AnalyzeAnswerInputSchema>;

export const AnalyzeAnswerOutputSchema = z.object({
  analysis: z.string().describe("A brief, one-sentence analysis of the candidate's answer in Bahasa Indonesia."),
});
export type AnalyzeAnswerOutput = z.infer<typeof AnalyzeAnswerOutputSchema>;


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
  async (input) => {
    const {output} = await prompt(input);
    return output!;
  }
);

export async function analyzeAnswer(input: AnalyzeAnswerInput): Promise<AnalyzeAnswerOutput> {
  return analyzeAnswerFlow(input);
}
