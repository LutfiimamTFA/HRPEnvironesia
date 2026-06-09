import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

// Initialize Firebase Admin SDK
if (getApps().length === 0) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const adminDb = getFirestore();
const adminAuth = getAuth();

/**
 * Verify Firebase ID Token and check admin role
 */
async function verifyAdminToken(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return { error: 'Missing or invalid authorization header', status: 401 };
    }

    const token = authHeader.substring(7);
    const decodedToken = await adminAuth.verifyIdToken(token);

    // Check if user is admin
    const email = decodedToken.email;
    if (email !== 'super_admin@gmail.com') {
      // Optionally check Firestore user role
      const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
      const userData = userDoc.data();
      const role = userData?.role;

      const allowedRoles = ['super-admin', 'super_admin', 'admin', 'hrd'];
      if (!allowedRoles.includes(role)) {
        return { error: 'Insufficient permissions', status: 403 };
      }
    }

    return { decodedToken, status: 200 };
  } catch (error: any) {
    return { error: error.message, status: 401 };
  }
}

/**
 * GET /api/admin/landing-sections
 * List all landing sections
 */
async function handleGet(request: NextRequest) {
  try {
    const authResult = await verifyAdminToken(request);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const snapshot = await adminDb.collection('landing_sections').orderBy('order').get();
    const sections = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json({ sections }, { status: 200 });
  } catch (error: any) {
    console.error('GET landing_sections error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/admin/landing-sections
 * Create or update a landing section
 */
async function handlePost(request: NextRequest) {
  try {
    const authResult = await verifyAdminToken(request);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const body = await request.json();
    const { sectionKey, data } = body;

    if (!sectionKey) {
      return NextResponse.json({ error: 'sectionKey is required' }, { status: 400 });
    }

    if (!data) {
      return NextResponse.json({ error: 'data is required' }, { status: 400 });
    }

    // Add metadata
    const now = new Date();
    const sectionData = {
      ...data,
      sectionKey,
      updatedAt: now,
      updatedBy: authResult.decodedToken?.email,
    };

    // If creating new section, add createdAt
    const existing = await adminDb.collection('landing_sections').doc(sectionKey).get();
    if (!existing.exists) {
      sectionData.createdAt = now;
      sectionData.createdBy = authResult.decodedToken?.email;
    }

    await adminDb.collection('landing_sections').doc(sectionKey).set(sectionData, { merge: true });

    return NextResponse.json(
      { message: 'Section saved successfully', sectionKey },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('POST landing_sections error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/landing-sections
 * Toggle or update isActive status
 */
async function handlePatch(request: NextRequest) {
  try {
    const authResult = await verifyAdminToken(request);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const body = await request.json();
    const { sectionKey, data } = body;

    if (!sectionKey) {
      return NextResponse.json({ error: 'sectionKey is required' }, { status: 400 });
    }

    if (!data) {
      return NextResponse.json({ error: 'data is required' }, { status: 400 });
    }

    // Add metadata
    const updateData = {
      ...data,
      updatedAt: new Date(),
      updatedBy: authResult.decodedToken?.email,
    };

    await adminDb.collection('landing_sections').doc(sectionKey).update(updateData);

    return NextResponse.json(
      { message: 'Section updated successfully', sectionKey },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('PATCH landing_sections error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/landing-sections
 * Delete a custom section (only if not system section)
 */
async function handleDelete(request: NextRequest) {
  try {
    const authResult = await verifyAdminToken(request);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const body = await request.json();
    const { sectionKey } = body;

    if (!sectionKey) {
      return NextResponse.json({ error: 'sectionKey is required' }, { status: 400 });
    }

    // Check if system section
    const doc = await adminDb.collection('landing_sections').doc(sectionKey).get();
    const sectionData = doc.data();
    if (sectionData?.isSystem) {
      return NextResponse.json(
        { error: 'Cannot delete system sections' },
        { status: 403 }
      );
    }

    await adminDb.collection('landing_sections').doc(sectionKey).delete();

    return NextResponse.json(
      { message: 'Section deleted successfully', sectionKey },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('DELETE landing_sections error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * Main handler
 */
export async function GET(request: NextRequest) {
  return handleGet(request);
}

export async function POST(request: NextRequest) {
  return handlePost(request);
}

export async function PATCH(request: NextRequest) {
  return handlePatch(request);
}

export async function DELETE(request: NextRequest) {
  return handleDelete(request);
}
