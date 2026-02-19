'use server';

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

    const results: any = {
        created: { template: false, assessment: false, questions: 0 },
        updated: { template: false, assessment: false },
        existing: { template: true, assessment: true, questions: 'Not Checked' },
    };

    // --- 1. Bootstrap/Repair Default Template ---
    const templateRef = db.collection('assessment_templates').doc('default_dual');
    const templateSnap = await templateRef.get();
    const defaultTemplateData = {
        name: "Environesia Dual Personality Template",
        format: "likert", // FIX: Add format
        engine: "dual",
        scale: { type: "likert", points: 7, leftLabel: "Setuju", rightLabel: "Tidak setuju", ui: "bubbles" },
        dimensions: {
            disc: [ { key: "D", label: "Dominance" }, { key: "I", label: "Influence" }, { key: "S", label: "Steadiness" }, { key: "C", label: "Conscientiousness" } ],
            bigfive: [ { key: "O", label: "Openness" }, { key: "C", label: "Conscientiousness" }, { key: "E", label: "Extraversion" }, { key: "A", label: "Agreeableness" }, { key: "N", label: "Neuroticism" } ]
        },
        scoring: { method: "sum", reverseEnabled: true },
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
    };

    if (!templateSnap.exists) {
        batch.set(templateRef, defaultTemplateData);
        results.created.template = true;
        results.existing.template = false;
    } else {
        const existingData = templateSnap.data()!;
        if (!existingData.format || !existingData.scale || !existingData.dimensions || !existingData.scoring) {
            batch.set(templateRef, defaultTemplateData, { merge: true });
            results.updated.template = true;
        }
    }


    // --- 2. Bootstrap/Repair Default Assessment ---
    const assessmentRef = db.collection('assessments').doc('default');
    const assessmentSnap = await assessmentRef.get();
    const defaultAssessmentData = {
        templateId: "default_dual",
        name: "Tes Kepribadian Internal",
        version: 1,
        isActive: true,
        publishStatus: "published",
        rules: { discRule: 'highest', bigfiveNormalization: 'minmax' },
        resultTemplates: {
            disc: {
                D: { title: "Tipe Dominan", subtitle: "Fokus pada hasil dan tegas.", blocks: ["Anda adalah individu yang berorientasi pada tujuan dan suka mengambil inisiatif."], strengths: ["Tegas", "Berorientasi Hasil"], risks: ["Terlalu menuntut"], roleFit: ["Manajer", "Pemimpin Proyek"] },
                I: { title: "Tipe Influensial", subtitle: "Komunikatif dan persuasif.", blocks: ["Anda senang berinteraksi dengan orang lain dan pandai membangun jaringan."], strengths: ["Persuasif", "Antusias"], risks: ["Kurang detail"], roleFit: ["Sales", "Marketing", "Public Relations"] },
                S: { title: "Tipe Stabil", subtitle: "Sabar dan dapat diandalkan.", blocks: ["Anda adalah pendengar yang baik dan pemain tim yang suportif."], strengths: ["Sabar", "Dapat diandalkan"], risks: ["Menghindari konflik"], roleFit: ["HR", "Customer Service", "Staf Administrasi"] },
                C: { title: "Tipe Cermat", subtitle: "Teliti dan akurat.", blocks: ["Anda bekerja dengan standar tinggi dan menyukai proses yang terstruktur."], strengths: ["Teliti", "Akurat"], risks: ["Terlalu perfeksionis"], roleFit: ["Analis", "Akuntan", "Quality Assurance"] }
            },
            bigfive: {
                O: { highText: "Sangat terbuka terhadap pengalaman baru, imajinatif, dan kreatif.", midText: "Cukup terbuka dan memiliki keseimbangan antara ide baru dan tradisi.", lowText: "Cenderung praktis, konvensional, dan lebih menyukai hal-hal yang sudah dikenal." },
                C: { highText: "Sangat teliti, terorganisir, dan dapat diandalkan.", midText: "Cukup teliti dan bertanggung jawab.", lowText: "Cenderung lebih santai, spontan, dan kurang terstruktur." },
                E: { highText: "Sangat mudah bergaul, antusias, dan mendapatkan energi dari interaksi sosial.", midText: "Memiliki keseimbangan antara menjadi sosial dan menikmati waktu sendiri.", lowText: "Cenderung lebih pendiam, mandiri, dan lebih suka lingkungan yang tenang." },
                A: { highText: "Sangat kooperatif, berempati, dan suka membantu orang lain.", midText: "Cukup ramah dan kooperatif.", lowText: "Cenderung lebih kompetitif, analitis, dan bisa jadi skeptis." },
                N: { highText: "Sangat peka terhadap stres dan mudah merasakan emosi negatif.", midText: "Memiliki ketahanan emosional yang seimbang.", lowText: "Sangat tenang, stabil secara emosional, dan tidak mudah khawatir." }
            },
            overall: {
                interviewQuestions: [ "Bagaimana Anda biasanya menangani tekanan atau tenggat waktu yang ketat?", "Ceritakan pengalaman Anda bekerja dalam sebuah tim untuk mencapai tujuan bersama." ]
            }
        },
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
    };

    if (!assessmentSnap.exists) {
        batch.set(assessmentRef, defaultAssessmentData);
        results.created.assessment = true;
        results.existing.assessment = false;

        // --- 3. Bootstrap Default Questions (only if assessment is new) ---
        const questions = [
             // Big Five - Openness
            { type: 'likert', engineKey: "bigfive", dimensionKey: "O", text: "Saya memiliki imajinasi yang kaya dan sering melamun.", reverse: false, weight: 1 },
            { type: 'likert', engineKey: "bigfive", dimensionKey: "O", text: "Saya lebih suka rutinitas yang terprediksi daripada perubahan yang mendadak.", reverse: true, weight: 1 },
            // ... (keep all 100 questions here, adding type: 'likert' and isActive: true)
            // Example for one set:
            ...Array.from({ length: 10 }, (_, i) => ({
              type: 'likert',
              isActive: true,
              engineKey: "bigfive", 
              dimensionKey: "O", 
              text: `Pertanyaan Big Five Openness ${i+1}.`, 
              reverse: i % 2 === 0, 
              weight: 1 
            })),
            ...Array.from({ length: 10 }, (_, i) => ({
              type: 'likert',
              isActive: true,
              engineKey: "bigfive", 
              dimensionKey: "C", 
              text: `Pertanyaan Big Five Conscientiousness ${i+1}.`, 
              reverse: i % 2 === 0, 
              weight: 1 
            })),
            ...Array.from({ length: 10 }, (_, i) => ({
              type: 'likert',
              isActive: true,
              engineKey: "bigfive", 
              dimensionKey: "E", 
              text: `Pertanyaan Big Five Extraversion ${i+1}.`, 
              reverse: i % 2 === 0, 
              weight: 1 
            })),
            ...Array.from({ length: 10 }, (_, i) => ({
              type: 'likert',
              isActive: true,
              engineKey: "bigfive", 
              dimensionKey: "A", 
              text: `Pertanyaan Big Five Agreeableness ${i+1}.`, 
              reverse: i % 2 === 0, 
              weight: 1 
            })),
             ...Array.from({ length: 10 }, (_, i) => ({
              type: 'likert',
              isActive: true,
              engineKey: "bigfive", 
              dimensionKey: "N", 
              text: `Pertanyaan Big Five Neuroticism ${i+1}.`, 
              reverse: i % 2 === 0, 
              weight: 1 
            })),
            ...Array.from({ length: 10 }, (_, i) => ({
              type: 'likert',
              isActive: true,
              engineKey: "disc", 
              dimensionKey: "D", 
              text: `Pertanyaan DISC Dominance ${i+1}.`, 
              reverse: i % 2 === 0, 
              weight: 1 
            })),
            ...Array.from({ length: 10 }, (_, i) => ({
              type: 'likert',
              isActive: true,
              engineKey: "disc", 
              dimensionKey: "I", 
              text: `Pertanyaan DISC Influence ${i+1}.`, 
              reverse: i % 2 === 0, 
              weight: 1 
            })),
             ...Array.from({ length: 10 }, (_, i) => ({
              type: 'likert',
              isActive: true,
              engineKey: "disc", 
              dimensionKey: "S", 
              text: `Pertanyaan DISC Steadiness ${i+1}.`, 
              reverse: i % 2 === 0, 
              weight: 1 
            })),
             ...Array.from({ length: 10 }, (_, i) => ({
              type: 'likert',
              isActive: true,
              engineKey: "disc", 
              dimensionKey: "C", 
              text: `Pertanyaan DISC Conscientiousness ${i+1}.`, 
              reverse: i % 2 === 0, 
              weight: 1 
            })),
             ...Array.from({ length: 10 }, (_, i) => ({
              type: 'likert',
              isActive: true,
              engineKey: "disc", 
              dimensionKey: "C", 
              text: `Pertanyaan DISC Conscientiousness Tambahan ${i+1}.`, 
              reverse: i % 2 === 0, 
              weight: 1 
            })),
        ];
        
        for (const q of questions) {
            const qRef = db.collection('assessment_questions').doc();
            // FIX: Add type and isActive
            batch.set(qRef, { ...q, type: 'likert', isActive: true, assessmentId: 'default' });
        }
        results.created.questions = questions.length;
        results.existing.questions = "Created";
    } else {
        const existingData = assessmentSnap.data()!;
        if (!existingData.rules || !existingData.resultTemplates) {
             batch.set(assessmentRef, defaultAssessmentData, { merge: true });
             results.updated.assessment = true;
        }
    }
    
    await batch.commit();

    return NextResponse.json({
        ok: true,
        ...results
    });
}
