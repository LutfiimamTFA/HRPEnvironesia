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
    let updatedCount = 0;
    let skippedCount = 0;

    try {
        const sessionsToUpdateQuery = db.collection('assessment_sessions').where('candidateName', '==', null);
        const snapshot = await sessionsToUpdateQuery.get();

        if (snapshot.empty) {
            return NextResponse.json({ message: 'No sessions needed backfilling.', updated: 0, skipped: 0 });
        }

        const updates = snapshot.docs.map(async (sessionDoc) => {
            const sessionData = sessionDoc.data();
            const candidateUid = sessionData.candidateUid;

            if (!candidateUid) {
                skippedCount++;
                return;
            }

            try {
                const userDoc = await db.collection('users').doc(candidateUid).get();
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    if (userData) {
                        await sessionDoc.ref.update({
                            candidateName: userData.fullName || null,
                            candidateEmail: userData.email || null,
                        });
                        updatedCount++;
                    } else {
                       skippedCount++;
                    }
                } else {
                    skippedCount++;
                }
            } catch (e) {
                console.error(`Failed to process session ${sessionDoc.id}`, e);
                skippedCount++;
            }
        });

        await Promise.all(updates);

        return NextResponse.json({
            message: 'Backfill complete.',
            updated: updatedCount,
            skipped: skippedCount,
        });

    } catch (error: any) {
        console.error('Error during session backfill:', error);
        return NextResponse.json({ error: 'Failed to backfill sessions: ' + error.message }, { status: 500 });
    }
}
