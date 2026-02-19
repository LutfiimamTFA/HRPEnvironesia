'use server';

import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { ROLES_INTERNAL, type UserProfile } from '@/lib/types';

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
        if (!['super-admin', 'hrd'].includes(userProfile.role)) {
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
    const repairBatch = db.batch();
    let repairedQuestions = 0;
    let repairedTemplate = false;

    try {
        // 1. Repair template
        const templateToRepairRef = db.collection('assessment_templates').doc('default_dual');
        const templateToRepairSnap = await templateToRepairRef.get();
        if (templateToRepairSnap.exists && !templateToRepairSnap.data()?.format) {
            repairBatch.update(templateToRepairRef, { format: 'likert' });
            repairedTemplate = true;
        }

        // 2. Repair questions missing 'type' or 'isActive'
        const questionsToRepairQuery = db.collection('assessment_questions').where('assessmentId', '==', 'default');
        const questionsToRepairSnap = await questionsToRepairQuery.get();

        if (!questionsToRepairSnap.empty) {
            questionsToRepairSnap.docs.forEach(doc => {
                const data = doc.data();
                if (data.type === undefined || data.isActive === undefined) {
                    repairBatch.update(doc.ref, { type: 'likert', isActive: true });
                    repairedQuestions++;
                }
            });
        }

        if (repairedQuestions > 0 || repairedTemplate) {
            await repairBatch.commit();
        }

        return NextResponse.json({
            ok: true,
            message: 'Repair process completed.',
            repaired: {
                questions: repairedQuestions,
                template: repairedTemplate,
            },
        });

    } catch (error: any) {
        console.error('Error during assessment repair:', error);
        return NextResponse.json({ error: 'Failed to repair assessment data: ' + error.message }, { status: 500 });
    }
}
