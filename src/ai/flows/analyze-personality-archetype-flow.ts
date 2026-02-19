
'use server';
/**
 * @fileOverview An AI flow to analyze personality scores and determine an MBTI-like archetype.
 *
 * - analyzePersonalityArchetype - A function that maps DISC and Big Five scores to a 16-Personalities style archetype.
 */

import {ai} from '@/ai/genkit';
import { ArchetypeAnalysisInputSchema, ArchetypeAnalysisOutputSchema } from '@/ai/schemas/assessment-schemas';
import type { ArchetypeAnalysisInput, ArchetypeAnalysisOutput } from '@/ai/schemas/assessment-schemas';

const prompt = ai.definePrompt({
    name: 'analyzeArchetypePrompt',
    input: { schema: ArchetypeAnalysisInputSchema },
    output: { schema: ArchetypeAnalysisOutputSchema },
    prompt: `You are an expert psychologist who specializes in mapping personality models. Your task is to analyze a candidate's DISC and Big Five scores and determine their 16 Personalities (MBTI-like) archetype.

    **Input Scores:**
    - **DISC Scores:** These are raw scores. The highest score indicates the primary DISC type.
      - D (Dominance): Direct, decisive, problem-solver.
      - I (Influence): Enthusiastic, persuasive, sociable.
      - S (Steadiness): Calm, patient, supportive.
      - C (Conscientiousness): Careful, analytical, private.
      - Scores: {{{json discScores}}}

    - **Big Five Scores (Normalized 0-100):**
      - O (Openness): High score = imaginative, curious. Low score = practical, conventional.
      - C (Conscientiousness): High score = organized, disciplined. Low score = spontaneous, flexible.
      - E (Extraversion): High score = sociable, energetic. Low score = reserved, solitary.
      - A (Agreeableness): High score = cooperative, empathetic. Low score = competitive, skeptical.
      - N (Neuroticism): High score = anxious, sensitive to stress. Low score = calm, emotionally stable.
      - Scores: {{{json bigFiveScores}}}

    **Mapping Logic to 4-Letter Code:**
    1.  **Introvert (I) vs. Extravert (E):** Primarily from Big Five 'E' score. High E (>55) -> Extravert (E), Low E (<45) -> Introvert (I).
    2.  **Intuitive (N) vs. Sensing (S):** Primarily from Big Five 'O' score. High O (>55) -> Intuitive (N), Low O (<45) -> Sensing (S).
    3.  **Thinking (T) vs. Feeling (F):** From Big Five 'A' score and DISC. Low A (<45, more competitive/skeptical) -> Thinking (T). High A (>55, more cooperative/empathetic) -> Feeling (F). High DISC 'D' or 'C' also suggests Thinking (T). High DISC 'I' or 'S' suggests Feeling (F). Combine these signals.
    4.  **Judging (J) vs. Perceiving (P):** Primarily from Big Five 'C' score. High C (>55, organized, disciplined) -> Judging (J). Low C (<45, spontaneous, flexible) -> Perceiving (P).

    **Mapping Logic for the 5th letter (Assertive -A vs. Turbulent -T):**
    - This is based on Big Five 'N' (Neuroticism). High N (>55) -> Turbulent (-T), Low N (<45) -> Assertive (-A).

    **Archetype Name:**
    - Based on the final 4-letter code, provide the corresponding 16 Personalities archetype name in Bahasa Indonesia (e.g., ENTJ -> "Komandan", INTP -> "Logis", INFJ -> "Advokat").

    **Your Task:**
    Analyze the provided scores, determine the 5-letter code (e.g., ENTJ-T), and the corresponding archetype name. Provide the output in the specified JSON format.
    `,
});

const analyzeArchetypeFlow = ai.defineFlow(
  {
    name: 'analyzeArchetypeFlow',
    inputSchema: ArchetypeAnalysisInputSchema,
    outputSchema: ArchetypeAnalysisOutputSchema,
  },
  async (input: ArchetypeAnalysisInput) => {
    const {output} = await prompt(input);
    return output!;
  }
);

export async function analyzePersonalityArchetype(input: ArchetypeAnalysisInput): Promise<ArchetypeAnalysisOutput> {
  return analyzeArchetypeFlow(input);
}

    