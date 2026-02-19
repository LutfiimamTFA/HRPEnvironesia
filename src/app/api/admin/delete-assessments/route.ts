
'use server';

import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
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
        if (!ROLES_INTERNAL.includes(userProfile.role) || !['super-admin', 'hrd'].includes(userProfile.role)) {
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
    let deletedQuestions = 0;

    try {
        // Delete the default assessment
        const assessmentRef = db.collection('assessments').doc('default');
        batch.delete(assessmentRef);

        // Delete the default template
        const templateRef = db.collection('assessment_templates').doc('default_dual');
        batch.delete(templateRef);

        // Delete the main config
        const configRef = db.collection('assessment_config').doc('main');
        batch.delete(configRef);

        // Delete all associated questions
        const questionsQuery = db.collection('assessment_questions').where('assessmentId', '==', 'default');
        const questionsSnap = await questionsQuery.get();
        
        if (!questionsSnap.empty) {
            questionsSnap.docs.forEach(doc => {
                batch.delete(doc.ref);
                deletedQuestions++;
            });
        }
        
        await batch.commit();

        return NextResponse.json({
            ok: true,
            message: 'Default assessment data deleted successfully.',
            deleted: {
                assessment: 1,
                template: 1,
                config: 1,
                questions: deletedQuestions,
            }
        });

    } catch (error: any) {
        console.error('Error deleting assessment data:', error);
        return NextResponse.json({ error: 'Failed to delete assessment data: ' + error.message }, { status: 500 });
    }
}
