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
  prompt: `YOU ARE AN EXPERT HR RECRUITMENT ANALYST. YOUR PRIMARY SOURCE OF TRUTH IS THE CANDIDATE'S CV PROVIDED AS RAW TEXT.

STRICT RULES:
1.  **NEVER ASSUME.** Do not write "assumed" or "maybe". All claims MUST have \`evidence_from_cv\`.
2.  **EVIDENCE IS KING.** \`evidence_from_cv\` MUST be a direct quote from the provided \`cvText\`. If no evidence is found, you MUST use the string "NOT_FOUND_IN_CV".
3.  **"Microsoft Office" RULE:** For requirements related to "Microsoft Office", you MUST search for the following synonyms in the \`cvText\`: "Microsoft Office", "MS Office", "Word", "Excel", "PowerPoint", "Office Suite". If any synonym is found, you MUST mark the requirement as 'yes' or 'partial' and quote the evidence in \`evidence_from_cv\`.
4.  **UNREADABLE CV:** If \`cvText\` is very short (e.g., less than 500 characters) or gibberish, it's likely a scanned/unreadable PDF. In this case, you MUST:
    a. Set \`confidence.level\` to "low".
    b. Add a reason to \`confidence.reasons\` like "CV text is too short or unreadable, analysis is likely inaccurate."
    c. Set \`overallFitScore\` to a maximum of 40.
    d. Add to \`missingInformation\`: "CV tidak dapat dibaca, minta kandidat untuk mengunggah ulang CV berbasis teks (bukan hasil scan)."

**SCORING LOGIC:**
- **Overall Fit Score (0-100):** Calculate this based on the \`requirementMatchMatrix\`.
  - Start with a base score of 100.
  - For each 'must-have' requirement with a 'no' match, subtract 25 points.
  - For each 'must-have' requirement with a 'partial' match, subtract 10 points.
  - For each 'nice-to-have' requirement with a 'no' match, subtract 5 points.
  - If \`confidence\` is 'low', the maximum score is capped at 40.
- **Overall Fit Label:**
  - 85-100: strong_fit
  - 60-84: moderate_fit
  - <60: weak_fit
- **Score Summary:** Provide 2-3 bullet points explaining the final score, referencing key strengths or critical missing requirements.

---

**INPUT:**
1.  **Job Requirements (HTML):**
    \`\`\`html
    {{{jobRequirementsHtml}}}
    \`\`\`
2.  **Candidate CV (Raw Text):**
    \`\`\`text
    {{{cvText}}}
    \`\`\`
3.  **CV Metadata (Optional):**
    \`\`\`json
    {{{json cvMeta}}}
    \`\`\`
4.  **Candidate Profile (JSON, Supplemental):**
    \`\`\`json
    {{{json candidateProfileJson}}}
    \`\`\`

---

**OUTPUT (JSON, in BAHASA INDONESIA, for HR decision making):**
-   **overallFitScore**: (0-100)
-   **overallFitLabel**: (strong_fit | moderate_fit | weak_fit)
-   **scoreSummary**: (Array of 2-3 strings)
-   **A. recommendedDecision**: {advance_interview | advance_test | hold | reject}
-   **B. confidence**: {high | medium | low} + 3 reasons
-   **C. requirementMatchMatrix**: Each item must have \`requirement\`, \`type\`, \`match\`, \`evidence_from_cv\` (direct quote or "NOT_FOUND_IN_CV"), and \`risk_note\` (if partial/no).
-   **D. scoreBreakdown**: (0-100) for all dimensions, must be integer.
-   **E. strengths**: (max 5) - each point MUST have \`evidence_from_cv\`.
-   **F. gapsRisks**: (max 5) - each point MUST have impact + onboarding mitigation.
-   **G. redFlags**: (if any).
-   **H. interviewQuestions**: (10 questions) + "jawaban ideal singkat".
-   **I. quickTestRecommendation**: (max 3) relevant to the role.
-   **J. missingInformation**: (max 5) things to ask the candidate.

---
**ADDITIONAL RULES:**
- If a 'must-have' requirement has a 'no' match, \`recommendedDecision\` can be at most 'hold' or 'reject'.
- The entire output MUST be in Bahasa Indonesia.
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
