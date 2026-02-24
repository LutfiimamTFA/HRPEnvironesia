'use server';

import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { ROLES_INTERNAL, type UserProfile } from '@/lib/types';

export async function POST(req: NextRequest) {
    const authorization = req.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized: No token provided.' }, { status: 401 });
    }
    const idToken = authorization.split('Bearer ')[1];

    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const uid = decodedToken.uid;

        const db = admin.firestore();
        const userDocRef = db.collection('users').doc(uid);
        const userDoc = await userDocRef.get();

        if (!userDoc.exists) {
            // User exists in Auth but not in Firestore, this is an issue but not this API's to solve.
            return NextResponse.json({ message: 'User profile not found in Firestore.' }, { status: 200 });
        }

        const userProfile = userDoc.data() as UserProfile;
        const batch = db.batch();
        const adminRoleRef = db.collection('roles_admin').doc(uid);
        const hrdRoleRef = db.collection('roles_hrd').doc(uid);
        
        let actionTaken = 'none';

        // Sync super-admin role
        if (userProfile.role === 'super-admin') {
            batch.set(adminRoleRef, { role: 'super-admin' });
            actionTaken = 'synced super-admin';
        } else {
            batch.delete(adminRoleRef);
        }

        // Sync hrd role
        if (userProfile.role === 'hrd') {
            batch.set(hrdRoleRef, { role: 'hrd' });
            actionTaken = 'synced hrd';
        } else {
            batch.delete(hrdRoleRef);
        }
        
        await batch.commit();

        return NextResponse.json({ message: 'Role documents synced successfully.', action: actionTaken }, { status: 200 });

    } catch (error: any) {
        console.error('Error syncing role documents:', error);
        return NextResponse.json({ error: 'Invalid token or server error.' }, { status: 500 });
    }
}
