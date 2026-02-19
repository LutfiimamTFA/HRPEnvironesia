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

    const results = {
        created: { template: false, assessment: false, questions: 0 },
        updated: { template: false, assessment: false },
        existing: { template: true, assessment: true, questions: 'Not Checked' },
    };

    // --- 1. Bootstrap/Repair Default Template ---
    const templateRef = db.collection('assessment_templates').doc('default_dual');
    const templateSnap = await templateRef.get();
    const defaultTemplateData = {
        name: "Environesia Dual Personality Template",
        format: "likert" as const,
        engine: "dual" as const,
        scale: { type: "likert", points: 7, leftLabel: "Setuju", rightLabel: "Tidak setuju", ui: "bubbles" },
        dimensions: {
            disc: [
                { key: "D", label: "Dominance" },
                { key: "I", label: "Influence" },
                { key: "S", label: "Steadiness" },
                { key: "C", label: "Conscientiousness" }
            ],
            bigfive: [
                { key: "O", label: "Openness" },
                { key: "C", label: "Conscientiousness" },
                { key: "E", label: "Extraversion" },
                { key: "A", label: "Agreeableness" },
                { key: "N", label: "Neuroticism" }
            ]
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
        if (!existingData.scale || !existingData.dimensions || !existingData.scoring || !existingData.format) {
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
        rules: {
            discRule: 'highest',
            bigfiveNormalization: 'minmax'
        },
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
                interviewQuestions: [
                    "Bagaimana Anda biasanya menangani tekanan atau tenggat waktu yang ketat?",
                    "Ceritakan pengalaman Anda bekerja dalam sebuah tim untuk mencapai tujuan bersama."
                ]
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
            { type: 'likert', order: 1, engineKey: "bigfive", dimensionKey: "O", text: "Saya memiliki imajinasi yang kaya dan sering melamun.", reverse: false, weight: 1 },
            { type: 'likert', order: 2, engineKey: "bigfive", dimensionKey: "O", text: "Saya lebih suka rutinitas yang terprediksi daripada perubahan yang mendadak.", reverse: true, weight: 1 },
            // Big Five - Conscientiousness
            { type: 'likert', order: 3, engineKey: "bigfive", dimensionKey: "C", text: "Saya selalu memastikan pekerjaan saya selesai dengan sempurna.", reverse: false, weight: 1 },
            { type: 'likert', order: 4, engineKey: "bigfive", dimensionKey: "C", text: "Saya sering menunda-nunda pekerjaan penting.", reverse: true, weight: 1 },
            // Big Five - Extraversion
            { type: 'likert', order: 5, engineKey: "bigfive", dimensionKey: "E", text: "Saya tidak suka menjadi pusat perhatian.", reverse: true, weight: 1 },
            { type: 'likert', order: 6, engineKey: "bigfive", dimensionKey: "E", text: "Saya mudah bergaul dan memulai percakapan dengan orang baru.", reverse: false, weight: 1 },
            // Big Five - Agreeableness
            { type: 'likert', order: 7, engineKey: "bigfive", dimensionKey: "A", text: "Saya lebih mementingkan keharmonisan daripada menyampaikan pendapat yang bisa menimbulkan konflik.", reverse: false, weight: 1 },
            { type: 'likert', order: 8, engineKey: "bigfive", dimensionKey: "A", text: "Saya tidak ragu mengkritik orang lain jika memang diperlukan.", reverse: true, weight: 1 },
            // Big Five - Neuroticism
            { type: 'likert', order: 9, engineKey: "bigfive", dimensionKey: "N", text: "Saya sering merasa cemas atau khawatir tentang masa depan.", reverse: false, weight: 1 },
            { type: 'likert', order: 10, engineKey: "bigfive", dimensionKey: "N", text: "Saya merasa santai dan tenang dalam banyak situasi.", reverse: true, weight: 1 },
            
            // DISC - Dominance
            { type: 'likert', order: 11, engineKey: "disc", dimensionKey: "D", text: "Saya suka mengambil kendali dalam sebuah proyek atau diskusi.", reverse: false, weight: 1 },
            { type: 'likert', order: 12, engineKey: "disc", dimensionKey: "D", text: "Saya lebih memilih untuk mengikuti arahan daripada memimpin.", reverse: true, weight: 1 },
            // DISC - Influence
            { type: 'likert', order: 13, engineKey: "disc", dimensionKey: "I", text: "Saya antusias dan pandai memotivasi orang lain.", reverse: false, weight: 1 },
            { type: 'likert', order: 14, engineKey: "disc", dimensionKey: "I", text: "Saya lebih suka bekerja sendiri daripada berkolaborasi secara intensif.", reverse: true, weight: 1 },
            // DISC - Steadiness
            { type: 'likert', order: 15, engineKey: "disc", dimensionKey: "S", text: "Saya adalah pendengar yang baik dan sabar.", reverse: false, weight: 1 },
            { type: 'likert', order: 16, engineKey: "disc", dimensionKey: "S", text: "Saya menyukai lingkungan kerja yang dinamis dan selalu berubah.", reverse: true, weight: 1 },
            // DISC - Conscientiousness
            { type: 'likert', order: 17, engineKey: "disc", dimensionKey: "C", text: "Saya selalu memeriksa kembali pekerjaan saya untuk memastikan tidak ada kesalahan.", reverse: false, weight: 1 },
            { type: 'likert', order: 18, engineKey: "disc", dimensionKey: "C", text: "Saya lebih fokus pada gambaran besar daripada detail-detail kecil.", reverse: true, weight: 1 },
             // Mixed
            { type: 'likert', order: 19, engineKey: "bigfive", dimensionKey: "E", text: "Di sebuah pesta, saya cenderung berdiam diri di sudut.", reverse: true, weight: 1 },
            { type: 'likert', order: 20, engineKey: "disc", dimensionKey: "D", text: "Saya tidak takut untuk menghadapi tantangan yang sulit.", reverse: false, weight: 1 },
        ];
        
        for (const q of questions) {
            const qRef = db.collection('assessment_questions').doc();
            batch.set(qRef, { ...q, assessmentId: 'default', isActive: true });
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
