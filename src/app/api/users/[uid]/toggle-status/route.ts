import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';

async function verifySuperAdmin(req: NextRequest) {
    const authorization = req.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) {
        return { error: 'Unauthorized: Missing token.', status: 401 };
    }
    const idToken = authorization.split('Bearer ')[1];
    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const userDoc = await admin.firestore().collection('users').doc(decodedToken.uid).get();
        if (!userDoc.exists || userDoc.data()?.role !== 'super-admin') {
            return { error: 'Forbidden: Only super-admins can toggle user status.', status: 403 };
        }
        return { uid: decodedToken.uid, adminName: userDoc.data()?.fullName || 'Admin' };
    } catch (error: any) {
        if (error.code === 'auth/id-token-expired') {
            return { error: 'Sesi Anda telah berakhir, silakan muat ulang halaman dan coba lagi.', status: 401 };
        }
        return { error: 'Invalid token.', status: 401 };
    }
}

export async function POST(
    req: NextRequest,
    { params }: { params: { uid: string } }
) {
    if (!admin.apps.length) {
        return NextResponse.json({ error: 'Firebase Admin SDK not initialized.' }, { status: 500 });
    }

    const authResult = await verifySuperAdmin(req);
    if (authResult.error) {
        return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { uid } = params;
    if (!uid) {
        return NextResponse.json({ error: 'User UID is required.' }, { status: 400 });
    }

    const body = await req.json();
    const { newStatus } = body;

    if (typeof newStatus !== 'boolean') {
        return NextResponse.json({ error: 'newStatus must be boolean.' }, { status: 400 });
    }

    try {
        const db = admin.firestore();
        const userRef = db.collection('users').doc(uid);
        const userSnapshot = await userRef.get();

        if (!userSnapshot.exists) {
            return NextResponse.json({ error: 'User not found.' }, { status: 404 });
        }

        const userData = userSnapshot.data();
        const oldStatus = userData?.isActive ?? true;
        const userName = userData?.fullName || 'Unknown';

        if (oldStatus === newStatus) {
            return NextResponse.json({
                success: true,
                message: `User is already ${newStatus ? 'active' : 'inactive'}.`,
            });
        }

        // Update user status
        await userRef.update({
            isActive: newStatus,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Log to audit
        const auditRef = db.collection('audit_logs').doc();
        await auditRef.set({
            id: auditRef.id,
            actionType: 'status_changed',
            targetUid: uid,
            targetName: userName,
            changedByUid: authResult.uid,
            changedByName: authResult.adminName,
            changedAt: admin.firestore.FieldValue.serverTimestamp(),
            before: { isActive: oldStatus },
            after: { isActive: newStatus },
            note: `Account ${newStatus ? 'activated' : 'deactivated'}`,
        });

        return NextResponse.json({
            success: true,
            newStatus,
            message: `User account has been ${newStatus ? 'activated' : 'deactivated'}.`,
        });

    } catch (error: any) {
        console.error(`Failed to toggle status for user ${uid}:`, error);
        return NextResponse.json(
            { error: error.message || 'An unexpected error occurred.' },
            { status: 500 }
        );
    }
}
