import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import { ROLES_INTERNAL, type UserProfile } from '@/lib/types';

// Helper function to verify user role via ID token
async function verifyUserRole(req: NextRequest) {
    const authorization = req.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) {
        return { error: 'Unauthorized', status: 401 };
    }
    const idToken = authorization.split('Bearer ')[1];
    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const userDoc = await admin.firestore().collection('users').doc(decodedToken.uid).get();
        if (!userDoc.exists) {
            return { error: 'User profile not found.', status: 404 };
        }
        const userProfile = userDoc.data() as UserProfile;
        if (!ROLES_INTERNAL.includes(userProfile.role)) {
            return { error: 'Forbidden', status: 403 };
        }
        return { user: userProfile };
    } catch (error) {
        return { error: 'Invalid token or authentication error.', status: 401 };
    }
}


export async function POST(req: NextRequest) {
    const roleCheck = await verifyUserRole(req);
    if (roleCheck.error) {
        return NextResponse.json({ error: roleCheck.error }, { status: roleCheck.status });
    }

    const db = admin.firestore();
    const batch = db.batch();

    let createdTemplate = false;
    let createdAssessment = false;
    let createdQuestions = 0;

    // --- 1. Bootstrap Default Template (Idempotent) ---
    const templateRef = db.collection('assessment_templates').doc('default_dual');
    const templateSnap = await templateRef.get();

    if (!templateSnap.exists) {
        batch.set(templateRef, {
            name: "Environesia Dual Personality Template",
            engine: "dual",
            scale: { type: "likert", points: 7, leftLabel: "Setuju", rightLabel: "Tidak setuju", ui: "bubbles" },
            dimensions: {
                disc: [
                    { key: "D", label: "Dominance" },
                    { key: "I", label: "Influence" },
                    { key: "S", label: "Steadiness" },
                    { key: "C", label: "Conscientiousness" }
                ],
                bigfive: [
                    { key: "O", label: "Openness" },
                    { key: "C", label: "Conscientiousness" },
                    { key: "E", label: "Extraversion" },
                    { key: "A", label: "Agreeableness" },
                    { key: "N", label: "Neuroticism" }
                ]
            },
            scoring: { method: "sum", reverseEnabled: true },
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
        });
        createdTemplate = true;
    }

    // --- 2. Bootstrap Default Assessment (Idempotent) ---
    const assessmentRef = db.collection('assessments').doc('default');
    const assessmentSnap = await assessmentRef.get();

    if (!assessmentSnap.exists) {
        batch.set(assessmentRef, {
            templateId: "default_dual",
            name: "Tes Kepribadian Internal",
            version: 1,
            isActive: true,
            publishStatus: "published",
            resultTemplates: {}, // Can be populated later by HRD
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
        });
        createdAssessment = true;

        // --- 3. Bootstrap Default Questions (only if assessment is new) ---
        const questions = [
            // Big Five Questions
            { engineKey: "bigfive", dimensionKey: "O", text: "Saya memiliki imajinasi yang kaya.", reverse: false, weight: 1, order: 1 },
            { engineKey: "bigfive", dimensionKey: "C", text: "Saya selalu mempersiapkan segala sesuatu.", reverse: false, weight: 1, order: 2 },
            { engineKey: "bigfive", dimensionKey: "E", text: "Saya tidak banyak bicara.", reverse: true, weight: 1, order: 3 },
            { engineKey: "bigfive", dimensionKey: "A", text: "Saya menaruh simpati pada perasaan orang lain.", reverse: false, weight: 1, order: 4 },
            { engineKey: "bigfive", dimensionKey: "N", text: "Saya jarang merasa sedih atau murung.", reverse: true, weight: 1, order: 5 },
            // DISC Questions
            { engineKey: "disc", dimensionKey: "D", text: "Saya suka mengambil alih dalam situasi kelompok.", reverse: false, weight: 1, order: 6 },
            { engineKey: "disc", dimensionKey: "I", text: "Saya mudah membujuk orang lain.", reverse: false, weight: 1, order: 7 },
            { engineKey: "disc", dimensionKey: "S", text: "Saya lebih suka bekerja dengan kecepatan yang stabil dan dapat diprediksi.", reverse: false, weight: 1, order: 8 },
            { engineKey: "disc", dimensionKey: "C", text: "Saya memperhatikan detail dan memastikan pekerjaan akurat.", reverse: false, weight: 1, order: 9 },
            { engineKey: "disc", dimensionKey: "D", text: "Saya cenderung menghindari memimpin sebuah diskusi.", reverse: true, weight: 1, order: 10 },
        ];
        
        for (const q of questions) {
            const qRef = db.collection('assessment_questions').doc();
            batch.set(qRef, { ...q, assessmentId: 'default', isActive: true });
        }
        createdQuestions = questions.length;
    }
    
    await batch.commit();

    return NextResponse.json({
        ok: true,
        created: {
            template: createdTemplate,
            assessment: createdAssessment,
            questions: createdQuestions
        }
    });
}
