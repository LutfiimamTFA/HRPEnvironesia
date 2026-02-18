import { z } from 'genkit';

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
