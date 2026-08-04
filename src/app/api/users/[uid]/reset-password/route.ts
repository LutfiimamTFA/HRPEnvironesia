import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';

// Helper to verify that the requester is a super-admin
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
            return { error: 'Forbidden: Only super-admins can reset passwords.', status: 403 };
        }
        return { uid: decodedToken.uid, adminName: userDoc.data()?.fullName || 'Admin' };
    } catch (error: any) {
        if (error.code === 'auth/id-token-expired') {
            return { error: 'Sesi Anda telah berakhir, silakan muat ulang halaman dan coba lagi.', status: 401 };
        }
        return { error: 'Invalid token.', status: 401 };
    }
}

// Generate random temporary password (12 characters)
function generateTemporaryPassword(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 12; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
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

    try {
        const db = admin.firestore();
        const auth = admin.auth();

        // Generate temporary password
        const tempPassword = generateTemporaryPassword();

        // Update password in Firebase Auth
        await auth.updateUser(uid, {
            password: tempPassword,
            emailVerified: true,
        });

        // Update Firestore metadata
        const userRef = db.collection('users').doc(uid);
        const userSnapshot = await userRef.get();

        if (!userSnapshot.exists) {
            return NextResponse.json({ error: 'User not found.' }, { status: 404 });
        }

        const userData = userSnapshot.data();
        const userName = userData?.fullName || 'Unknown';

        await userRef.update({
            mustChangePassword: true,
            passwordResetBy: authResult.uid,
            passwordResetByName: authResult.adminName,
            passwordResetAt: admin.firestore.FieldValue.serverTimestamp(),
            temporaryPasswordIssued: true,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Log to audit
        const auditRef = db.collection('audit_logs').doc();
        await auditRef.set({
            id: auditRef.id,
            actionType: 'password_reset',
            targetUid: uid,
            targetName: userName,
            changedByUid: authResult.uid,
            changedByName: authResult.adminName,
            changedAt: admin.firestore.FieldValue.serverTimestamp(),
            note: 'Super Admin reset password and issued temporary password',
            metadata: {
                tempPasswordLength: tempPassword.length,
            }
        });

        return NextResponse.json({
            success: true,
            tempPassword,
            message: 'Temporary password created successfully. User must change password on next login.',
        });

    } catch (error: any) {
        console.error(`Failed to reset password for user ${uid}:`, error);
        return NextResponse.json(
            { error: error.message || 'An unexpected error occurred.' },
            { status: 500 }
        );
    }
}
