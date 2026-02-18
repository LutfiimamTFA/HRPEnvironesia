import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import type { Assessment, AssessmentQuestion, AssessmentSession, ResultTemplate } from '@/lib/types';

export async function POST(req: NextRequest) {
  if (!admin.apps.length) {
    return NextResponse.json({ error: 'Firebase Admin SDK not initialized.' }, { status: 500 });
  }

  const { sessionId } = await req.json();

  if (!sessionId) {
    return NextResponse.json({ error: 'Session ID is required.' }, { status: 400 });
  }

  const db = admin.firestore();
  const sessionRef = db.collection('assessment_sessions').doc(sessionId as string);

  try {
    const sessionDoc = await sessionRef.get();
    if (!sessionDoc.exists) {
      return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
    }
    const session = sessionDoc.data() as AssessmentSession;

    // Prevent re-submission
    if (session.status === 'submitted') {
        return NextResponse.json({ message: 'Assessment already submitted.', resultType: session.resultType }, { status: 200 });
    }

    const assessmentRef = db.collection('assessments').doc(session.assessmentId);
    const assessmentDoc = await assessmentRef.get();
    if (!assessmentDoc.exists) {
        throw new Error('Assessment configuration not found.');
    }
    const assessment = assessmentDoc.data() as Assessment;

    const questionsQuery = db.collection('assessment_questions').where('assessmentId', '==', session.assessmentId);
    const questionsSnap = await questionsQuery.get();
    const questions = questionsSnap.docs.map(doc => doc.data() as AssessmentQuestion);

    // --- Scoring Engine ---
    const scores: Record<string, number> = {};
    assessment.scoringConfig.dimensions.forEach(dim => scores[dim] = 0);

    for (const question of questions) {
        const answerValue = session.answers[question.id!];
        if (answerValue === undefined) continue;

        let finalValue = answerValue;
        // Apply reverse scoring if needed
        if (question.reverse) {
            // Assuming choices are 1-7, reverse is (max + min) - value
            finalValue = 8 - answerValue;
        }
        
        scores[question.dimensionKey] = (scores[question.dimensionKey] || 0) + (finalValue * (question.weight || 1));
    }
    
    // --- Result Type Determination ---
    let resultType = 'DEFAULT'; // Fallback result type
    if (assessment.scoringConfig.rules.resultType === 'highest_score') {
        resultType = Object.entries(scores).reduce((a, b) => a[1] > b[1] ? a : b)[0];
    }
    // More complex rules could be added here

    // --- Report Generation ---
    const template = assessment.resultTemplates[resultType] || assessment.resultTemplates['DEFAULT'];
    if (!template) {
        throw new Error(`Result template for type "${resultType}" not found.`);
    }

    const report: ResultTemplate = {
        title: template.title,
        subtitle: template.subtitle,
        descBlocks: template.descBlocks,
        strengths: template.strengths,
        weaknesses: template.weaknesses,
        roleFit: template.roleFit,
    };

    // --- Update Session Document ---
    await sessionRef.update({
        status: 'submitted',
        scores: scores,
        resultType: resultType,
        report: report,
        completedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
    });

    return NextResponse.json({ message: 'Assessment submitted successfully.', resultType });

  } catch (error: any) {
    console.error('Error submitting assessment:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
