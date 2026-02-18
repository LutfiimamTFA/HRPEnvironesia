import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { UserRole } from '@/lib/types';
import { Timestamp } from 'firebase-admin/firestore';

const seedUsers: { email: string; password: string; fullName: string; role: UserRole }[] = [
  { email: 'super_admin@gmail.com', password: '12345678', fullName: 'Super Admin', role: 'super-admin' },
  { email: 'hrd@gmail.com', password: '12345678', fullName: 'HRD', role: 'hrd' },
  { email: 'manager@gmail.com', password: '12345678', fullName: 'Manager', role: 'manager' },
  { email: 'kandidat@gmail.com', password: '12345678', fullName: 'Kandidat', role: 'kandidat' },
  { email: 'karyawan@gmail.com', password: '12345678', fullName: 'Karyawan', role: 'karyawan' },
];

async function seedAssessment(db: admin.firestore.Firestore) {
    const assessmentId = 'personality-v1';
    const assessmentRef = db.collection('assessments').doc(assessmentId);

    const assessmentData = {
        name: 'Tes Kepribadian Internal',
        version: 1,
        isActive: true,
        scoringConfig: {
            dimensions: ['OPENNESS', 'CONSCIENTIOUSNESS', 'EXTRAVERSION', 'AGREEABLENESS', 'NEUROTICISM'],
            rules: {
                resultType: 'highest_score', // Simple rule: result is the dimension with the highest score
            },
        },
        resultTemplates: {
            // Placeholder result templates
            OPENNESS: {
                title: 'Si Penjelajah Kreatif',
                subtitle: 'Imajinatif, Penuh Rasa Ingin Tahu, dan Terbuka pada Pengalaman Baru',
                descBlocks: ['Anda adalah individu yang sangat imajinatif dan kreatif. Anda tidak takut untuk mencoba hal-hal baru dan sering kali memiliki minat yang luas.', 'Di tempat kerja, Anda unggul dalam peran yang membutuhkan pemikiran out-of-the-box dan kemampuan untuk beradaptasi dengan perubahan.'],
                strengths: ['Inovatif', 'Berpikiran Terbuka', 'Cepat Belajar'],
                weaknesses: ['Kurang praktis', 'Bisa jadi tidak fokus', 'Tidak menyukai rutinitas'],
                roleFit: ['Desainer Grafis', 'Spesialis R&D', 'Content Creator'],
            },
            CONSCIENTIOUSNESS: {
                title: 'Sang Organisator yang Andal',
                subtitle: 'Disiplin, Bertanggung Jawab, dan Berorientasi pada Tujuan',
                descBlocks: ['Anda adalah seorang perencana yang ulung dan sangat dapat diandalkan. Anda memiliki standar tinggi untuk diri sendiri dan selalu menyelesaikan apa yang Anda mulai.', 'Anda berkembang dalam lingkungan yang terstruktur dan unggul dalam peran yang membutuhkan ketelitian dan manajemen proyek.'],
                strengths: ['Terorganisir', 'Dapat Diandalkan', 'Penuh Perhatian'],
                weaknesses: ['Cenderung kaku', 'Bisa jadi perfeksionis', 'Sulit beradaptasi dengan perubahan mendadak'],
                roleFit: ['Manajer Proyek', 'Akuntan', 'Analis Data'],
            },
            // ... add other dimension templates
        },
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
    };
    await assessmentRef.set(assessmentData);

    const questions = [
        { order: 1, text: 'Saya suka mencoba hal-hal baru dan berbeda.', dimensionKey: 'OPENNESS', weight: 1, reverse: false },
        { order: 2, text: 'Saya selalu mempersiapkan segala sesuatu dengan matang.', dimensionKey: 'CONSCIENTIOUSNESS', weight: 1, reverse: false },
        { order: 3, text: 'Saya tidak suka menjadi pusat perhatian.', dimensionKey: 'EXTRAVERSION', weight: 1, reverse: true },
        { order: 4, text: 'Saya mudah merasa empati terhadap orang lain.', dimensionKey: 'AGREEABLENESS', weight: 1, reverse: false },
        { order: 5, text: 'Saya sering merasa cemas tentang banyak hal.', dimensionKey: 'NEUROTICISM', weight: 1, reverse: false },
        // ... add more questions (e.g., 20-50 questions for a basic test)
    ];

    const questionsBatch = db.batch();
    for (const q of questions) {
        const questionRef = db.collection('assessment_questions').doc();
        questionsBatch.set(questionRef, {
            ...q,
            assessmentId: assessmentId,
            choices: [
                { text: 'Sangat Tidak Setuju', value: 1 },
                { text: 'Tidak Setuju', value: 2 },
                { text: 'Agak Tidak Setuju', value: 3 },
                { text: 'Netral', value: 4 },
                { text: 'Agak Setuju', value: 5 },
                { text: 'Setuju', value: 6 },
                { text: 'Sangat Setuju', value: 7 },
            ],
        });
    }
    await questionsBatch.commit();
    return { assessmentId: assessmentId, questionsCount: questions.length };
}


export async function POST(req: NextRequest) {
  // Gracefully handle cases where the Admin SDK is not initialized.
  if (!admin.apps.length) {
    console.error('Firebase Admin SDK has not been initialized. Please check your server-side environment variables.');
    return NextResponse.json(
      { error: 'Firebase Admin SDK not initialized. Ensure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY are set correctly in your .env.local file.' },
      { status: 500 }
    );
  }
  
  if (process.env.ENABLE_SEED !== 'true') {
    return NextResponse.json({ error: 'Seeder is disabled.' }, { status: 403 });
  }

  const secret = req.headers.get('x-seed-secret');
  if (secret !== process.env.SEED_SECRET) {
    return NextResponse.json({ error: 'Invalid secret.' }, { status: 401 });
  }

  const results: any[] = [];
  const db = admin.firestore();

  for (const userData of seedUsers) {
    try {
      let userRecord;
      let status: 'created' | 'already_exists' = 'already_exists';

      try {
        userRecord = await admin.auth().getUserByEmail(userData.email);
      } catch (error: any) {
        if (error.code === 'auth/user-not-found') {
          userRecord = await admin.auth().createUser({
            email: userData.email,
            password: userData.password,
            emailVerified: true,
            displayName: userData.fullName,
          });
          status = 'created';
        } else {
          throw error; // Re-throw other auth errors to be caught by the outer catch
        }
      }

      // At this point, userRecord is guaranteed to be defined.
      const userProfile: any = {
        uid: userRecord.uid,
        email: userData.email,
        fullName: userData.fullName,
        role: userData.role,
        isActive: true,
      };

      if (status === 'created') {
        userProfile.createdAt = Timestamp.now();
        // Use set without merge for new users
        await db.collection('users').doc(userRecord.uid).set(userProfile);
      } else {
        // Use set with merge for existing users to preserve createdAt
        await db.collection('users').doc(userRecord.uid).set(userProfile, { merge: true });
      }

      // Handle the roles_admin collection for admin
      if (userData.role === 'super-admin') {
        await db.collection('roles_admin').doc(userRecord.uid).set({ role: 'super-admin' });
      } else {
        // In case a user's role was demoted, ensure they are not in roles_admin
        await db.collection('roles_admin').doc(userRecord.uid).delete().catch(() => {}); // Ignore error if doc doesn't exist
      }
      
      results.push({ email: userData.email, status, uid: userRecord.uid });

    } catch (error: any) {
      console.error(`Failed to seed user ${userData.email}:`, error);
      results.push({ email: userData.email, status: 'error', message: error.message });
    }
  }

  try {
    const assessmentResult = await seedAssessment(db);
    results.push({
        type: 'assessment',
        status: 'seeded',
        ...assessmentResult,
    });
  } catch(error: any) {
     results.push({
        type: 'assessment',
        status: 'error',
        message: error.message
    });
  }

  return NextResponse.json({ message: 'Seeding complete.', results });
}
