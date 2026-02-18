
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

export const CandidateFitAnalysisInputSchema = z.object({
    candidateProfile: SimplifiedProfileSchema.describe("Objek JSON yang berisi profil kandidat (CV, pengalaman, dll)."),
    jobRequirements: z.string().describe("String HTML yang berisi kualifikasi khusus untuk pekerjaan yang dilamar."),
    personalityAnalysis: z.any().optional(), // This is no longer used by the new prompt, but kept for compatibility.
});
export type CandidateFitAnalysisInput = z.infer<typeof CandidateFitAnalysisInputSchema>;


// --- NEW DETAILED OUTPUT SCHEMA ---

const RecommendedDecisionSchema = z.enum(['advance_interview', 'advance_test', 'hold', 'reject']);

const ConfidenceSchema = z.object({
  level: z.enum(['high', 'medium', 'low']),
  reasons: z.array(z.string()).max(3),
});

const RequirementMatchSchema = z.object({
  requirement: z.string(),
  type: z.enum(['must-have', 'nice-to-have']),
  match: z.enum(['yes', 'partial', 'no']),
  evidence_from_cv: z.string(),
  risk_note: z.string().optional(),
});

const ScoreBreakdownSchema = z.object({
  relevantExperience: z.number().int().min(0).max(100),
  adminDocumentation: z.number().int().min(0).max(100),
  communicationTeamwork: z.number().int().min(0).max(100),
  analyticalProblemSolving: z.number().int().min(0).max(100),
  toolsHardSkills: z.number().int().min(0).max(100),
  initiativeOwnership: z.number().int().min(0).max(100),
  cultureFit: z.object({
    score: z.number().int().min(0).max(100),
    reason: z.string(),
  }),
});

const StrengthSchema = z.object({
  strength: z.string(),
  evidence_from_cv: z.string(),
});

const GapRiskSchema = z.object({
  gap: z.string(),
  impact: z.string(),
  onboarding_mitigation: z.string(),
});

const InterviewQuestionSchema = z.object({
  question: z.string(),
  ideal_answer: z.string(),
});

export const CandidateFitAnalysisOutputSchema = z.object({
  recommendedDecision: RecommendedDecisionSchema.describe('A. Recommended Decision'),
  confidence: ConfidenceSchema.describe('B. Confidence level and reasons'),
  requirementMatchMatrix: z.array(RequirementMatchSchema).describe('C. Requirement Match Matrix'),
  scoreBreakdown: ScoreBreakdownSchema.describe('D. Score Breakdown (0-100) per dimension'),
  strengths: z.array(StrengthSchema).max(5).describe('E. Strengths with evidence from CV'),
  gapsRisks: z.array(GapRiskSchema).max(5).describe('F. Gaps/Risks with impact and mitigation'),
  redFlags: z.array(z.string()).optional().describe('G. Red Flags, if any'),
  interviewQuestions: z.array(InterviewQuestionSchema).max(10).describe('H. Interview Questions with ideal answers'),
  quickTestRecommendation: z.array(z.string()).max(3).describe('I. Quick Test Recommendation based on role'),
  missingInformation: z.array(z.string()).max(5).describe('J. Missing Information to ask the candidate'),
});
export type CandidateFitAnalysisOutput = z.infer<typeof CandidateFitAnalysisOutputSchema>;
