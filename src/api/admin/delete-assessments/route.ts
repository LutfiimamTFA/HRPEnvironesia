
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
    let deletedAssessments = 0;
    let deletedTemplates = 0;

    try {
        // Find all templates to delete
        const templatesSnap = await db.collection('assessment_templates').get();
        const templateIds = templatesSnap.docs.map(doc => {
            batch.delete(doc.ref);
            deletedTemplates++;
            return doc.id;
        });

        // Find all assessments to delete
        const assessmentsSnap = await db.collection('assessments').get();
        const assessmentIds = assessmentsSnap.docs.map(doc => {
            batch.delete(doc.ref);
            deletedAssessments++;
            return doc.id;
        });

        // Find all questions related to those assessments to delete
        if (assessmentIds.length > 0) {
            const questionsQuery = db.collection('assessment_questions').where('assessmentId', 'in', assessmentIds);
            const questionsSnap = await questionsQuery.get();
            if (!questionsSnap.empty) {
                questionsSnap.docs.forEach(doc => {
                    batch.delete(doc.ref);
                    deletedQuestions++;
                });
            }
        }
        
        await batch.commit();

        return NextResponse.json({
            ok: true,
            message: 'All assessment data deleted successfully.',
            deleted: {
                assessments: deletedAssessments,
                templates: deletedTemplates,
                questions: deletedQuestions,
            }
        });

    } catch (error: any) {
        console.error('Error deleting assessment data:', error);
        return NextResponse.json({ error: 'Failed to delete assessment data: ' + error.message }, { status: 500 });
    }
}
