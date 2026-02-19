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
        created: { 
            template_likert: false, 
            template_forced_choice: false, 
            questions_likert: 0,
            questions_forced_choice: 0 
        },
        updated: { 
            template_likert: false, 
            template_forced_choice: false 
        },
        existing: { 
            template_likert: true, 
            template_forced_choice: true, 
            questions_likert: 'Not Checked',
            questions_forced_choice: 'Not Checked'
        },
    };

    // --- TEMPLATE 1: LIKERT (Big Five & DISC) ---
    const templateLikertRef = db.collection('assessment_templates').doc('personality_test_1');
    const templateLikertSnap = await templateLikertRef.get();
    const likertTemplateData = {
        name: "Tes Kepribadian 1 (Likert)",
        format: "likert",
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

    if (!templateLikertSnap.exists) {
        batch.set(templateLikertRef, likertTemplateData);
        results.created.template_likert = true;
        results.existing.template_likert = false;
    } else {
        const existingData = templateLikertSnap.data()!;
        if (!existingData.scale || !existingData.dimensions || !existingData.scoring) {
            batch.set(templateLikertRef, likertTemplateData, { merge: true });
            results.updated.template_likert = true;
        }
    }
    
    // --- TEMPLATE 2: FORCED-CHOICE ---
    const templateForcedChoiceRef = db.collection('assessment_templates').doc('personality_test_2');
    const templateForcedChoiceSnap = await templateForcedChoiceRef.get();
    const forcedChoiceTemplateData = {
        name: "Tes Kepribadian 2 (Forced-Choice)",
        format: "forced-choice",
        engine: "dual",
        dimensions: {
            disc: [ { key: 'D', label: 'Dominance' }, { key: 'I', label: 'Influence' }, { key: 'S', label: 'Steadiness' }, { key: 'C', label: 'Conscientiousness' } ],
            bigfive: [],
        },
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
    };

    if (!templateForcedChoiceSnap.exists) {
        batch.set(templateForcedChoiceRef, forcedChoiceTemplateData);
        results.created.template_forced_choice = true;
        results.existing.template_forced_choice = false;
    } else {
        const existingData = templateForcedChoiceSnap.data()!;
        if (!existingData.dimensions.disc) {
            batch.set(templateForcedChoiceRef, forcedChoiceTemplateData, { merge: true });
            results.updated.template_forced_choice = true;
        }
    }


    // --- 2. Bootstrap/Repair Default Assessment ---
    const assessmentRef = db.collection('assessments').doc('default');
    const assessmentSnap = await assessmentRef.get();
    const defaultAssessmentData = {
        templateId: "default_dual", // This should ideally be a multi-template system, but we adapt
        name: "Tes Kepribadian Internal (Gabungan)",
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
            { type: 'likert', engineKey: "bigfive", dimensionKey: "O", text: "Saya tertarik dengan ide-ide yang abstrak.", reverse: false, weight: 1 },
            { type: 'likert', engineKey: "bigfive", dimensionKey: "O", text: "Saya tidak terlalu tertarik pada seni atau museum.", reverse: true, weight: 1 },
            { type: 'likert', engineKey: "bigfive", dimensionKey: "O", text: "Saya suka mencoba makanan baru yang belum pernah saya coba.", reverse: false, weight: 1 },
            { type: 'likert', engineKey: "bigfive", dimensionKey: "O", text: "Saya merasa nyaman dengan hal-hal yang sudah familiar.", reverse: true, weight: 1 },
            { type: 'likert', engineKey: "bigfive", dimensionKey: "O", text: "Saya memiliki rasa ingin tahu yang besar terhadap banyak hal.", reverse: false, weight: 1 },
            { type: 'likert', engineKey: "bigfive", dimensionKey: "O", text: "Saya cenderung melihat sesuatu dari sudut pandang konvensional.", reverse: true, weight: 1 },
            { type: 'likert', engineKey: "bigfive", dimensionKey: "O", text: "Saya senang melakukan perjalanan ke tempat-tempat baru.", reverse: false, weight: 1 },
            { type: 'likert', engineKey: "bigfive", dimensionKey: "O", text: "Saya tidak suka perubahan.", reverse: true, weight: 1 },

            // Big Five - Conscientiousness
            { type: 'likert', engineKey: "bigfive", dimensionKey: "C", text: "Saya selalu memastikan pekerjaan saya selesai dengan sempurna.", reverse: false, weight: 1 },
            { type: 'likert', engineKey: "bigfive", dimensionKey: "C", text: "Saya sering menunda-nunda pekerjaan penting.", reverse: true, weight: 1 },
            { type: 'likert', engineKey: "bigfive", dimensionKey: "C", text: "Saya membuat rencana yang jelas dan menepatinya.", reverse: false, weight: 1 },
            { type: 'likert', engineKey: "bigfive", dimensionKey: "C", text: "Saya sering lupa mengembalikan barang ke tempatnya.", reverse: true, weight: 1 },
            { type: 'likert', engineKey: "bigfive", dimensionKey: "C", text: "Saya adalah orang yang sangat terorganisir.", reverse: false, weight: 1 },
            { type: 'likert', engineKey: "bigfive", dimensionKey: "C", text: "Saya cenderung berantakan.", reverse: true, weight: 1 },
            { type: 'likert', engineKey: "bigfive", dimensionKey: "C", text: "Saya memperhatikan detail-detail kecil.", reverse: false, weight: 1 },
            { type: 'likert', engineKey: "bigfive", dimensionKey: "C", text: "Saya sering bekerja tanpa persiapan.", reverse: true, weight: 1 },
            { type: 'likert', engineKey: "bigfive", dimensionKey: "C", text: "Saya menyelesaikan tugas tepat waktu.", reverse: false, weight: 1 },
            { type: 'likert', engineKey: "bigfive", dimensionKey: "C", text: "Saya sering mengabaikan tugas-tugas saya.", reverse: true, weight: 1 },

            // Big Five - Extraversion
            { type: 'likert', engineKey: "bigfive", dimensionKey: "E", text: "Saya tidak suka menjadi pusat perhatian.", reverse: true, weight: 1 },
            { type: 'likert', engineKey: "bigfive", dimensionKey: "E", text: "Saya mudah bergaul dan memulai percakapan dengan orang baru.", reverse: false, weight: 1 },
            { type: 'likert', engineKey: "bigfive", dimensionKey: "E", text: "Saya merasa lelah setelah bersosialisasi dalam waktu lama.", reverse: true, weight: 1 },
            { type: 'likert', engineKey: "bigfive", dimensionKey: "E", text: "Di sebuah pesta, saya adalah orang yang aktif berbicara dengan banyak orang.", reverse: false, weight: 1 },
            { type: 'likert', engineKey: "bigfive", dimensionKey: "E", text: "Saya lebih suka menyendiri daripada bersama orang banyak.", reverse: true, weight: 1 },
            { type: 'likert', engineKey: "bigfive", dimensionKey: "E", text: "Saya penuh semangat dan energi.", reverse: false, weight: 1 },
            { type: 'likert', engineKey: "bigfive", dimensionKey: "E", text: "Saya cenderung pendiam di sekitar orang asing.", reverse: true, weight: 1 },
            { type: 'likert', engineKey: "bigfive", dimensionKey: "E", text: "Saya suka bertemu orang-orang baru.", reverse: false, weight: 1 },
            { type: 'likert', engineKey: "bigfive", dimensionKey: "E", text: "Saya tidak banyak bicara.", reverse: true, weight: 1 },
            { type: 'likert', engineKey: "bigfive", dimensionKey: "E", text: "Saya adalah nyawa dari sebuah pesta.", reverse: false, weight: 1 },
            
            // Big Five - Agreeableness
            { type: 'likert', engineKey: "bigfive", dimensionKey: "A", text: "Saya lebih mementingkan keharmonisan daripada menyampaikan pendapat yang bisa menimbulkan konflik.", reverse: false, weight: 1 },
            { type: 'likert', engineKey: "bigfive", dimensionKey: "A", text: "Saya tidak ragu mengkritik orang lain jika memang diperlukan.", reverse: true, weight: 1 },
            { type: 'likert', engineKey: "bigfive", dimensionKey: "A", text: "Saya memiliki hati yang lembut untuk orang lain.", reverse: false, weight: 1 },
            { type: 'likert', engineKey: "bigfive", dimensionKey: "A", text: "Saya sering menghina orang lain.", reverse: true, weight: 1 },
            { type: 'likert', engineKey: "bigfive", dimensionKey: "A", text: "Saya percaya bahwa orang lain pada dasarnya baik.", reverse: false, weight: 1 },
            { type: 'likert', engineKey: "bigfive", dimensionKey: "A", text: "Saya curiga terhadap niat orang lain.", reverse: true, weight: 1 },
            { type: 'likert', engineKey: "bigfive", dimensionKey: "A", text: "Saya bersimpati pada perasaan orang lain.", reverse: false, weight: 1 },
            { type: 'likert', engineKey: "bigfive", dimensionKey: "A", text: "Saya tidak tertarik pada masalah orang lain.", reverse: true, weight: 1 },
            { type: 'likert', engineKey: "bigfive", dimensionKey: "A", text: "Saya membuat orang merasa nyaman.", reverse: false, weight: 1 },
            { type: 'likert', engineKey: "bigfive", dimensionKey: "A", text: "Saya sering merasa kesal.", reverse: true, weight: 1 },

            // Big Five - Neuroticism
            { type: 'likert', engineKey: "bigfive", dimensionKey: "N", text: "Saya sering merasa cemas atau khawatir tentang masa depan.", reverse: false, weight: 1 },
            { type: 'likert', engineKey: "bigfive", dimensionKey: "N", text: "Saya merasa santai dan tenang dalam banyak situasi.", reverse: true, weight: 1 },
            { type: 'likert', engineKey: "bigfive", dimensionKey: "N", text: "Suasana hati saya mudah berubah-ubah.", reverse: false, weight: 1 },
            { type: 'likert', engineKey: "bigfive", dimensionKey: "N", text: "Saya jarang merasa sedih atau tertekan.", reverse: true, weight: 1 },
            { type: 'likert', engineKey: "bigfive", dimensionKey: "N", text: "Saya mudah stres.", reverse: false, weight: 1 },
            { type: 'likert', engineKey: "bigfive", dimensionKey: "N", text: "Saya dapat menangani stres dengan baik.", reverse: true, weight: 1 },
            { type: 'likert', engineKey: "bigfive", dimensionKey: "N", text: "Saya sering merasa tidak puas dengan diri sendiri.", reverse: false, weight: 1 },
            { type: 'likert', engineKey: "bigfive", dimensionKey: "N", text: "Saya secara emosional stabil.", reverse: true, weight: 1 },
            { type: 'likert', engineKey: "bigfive", dimensionKey: "N", text: "Saya sering merasa gugup.", reverse: false, weight: 1 },
            { type: 'likert', engineKey: "bigfive", dimensionKey: "N", text: "Saya jarang merasa cemas.", reverse: true, weight: 1 },
            
            // DISC - Dominance
            { type: 'likert', engineKey: "disc", dimensionKey: "D", text: "Saya suka mengambil kendali dalam sebuah proyek atau diskusi.", reverse: false, weight: 1 },
            { type: 'likert', engineKey: "disc", dimensionKey: "D", text: "Saya lebih memilih untuk mengikuti arahan daripada memimpin.", reverse: true, weight: 1 },
            { type: 'likert', engineKey: "disc", dimensionKey: "D", text: "Saya langsung menyatakan apa yang saya inginkan dalam sebuah diskusi.", reverse: false, weight: 1 },
            { type: 'likert', engineKey: "disc", dimensionKey: "D", text: "Saya cenderung menghindari konfrontasi.", reverse: true, weight: 1 },
            { type: 'likert', engineKey: "disc", dimensionKey: "D", text: "Saya berani mengambil risiko untuk mencapai hasil.", reverse: false, weight: 1 },
            { type: 'likert', engineKey: "disc", dimensionKey: "D", text: "Saya lebih suka bermain aman.", reverse: true, weight: 1 },
            { type: 'likert', engineKey: "disc", dimensionKey: "D", text: "Saya adalah orang yang kompetitif.", reverse: false, weight: 1 },
            { type: 'likert', engineKey: "disc", dimensionKey: "D", text: "Saya tidak terlalu peduli dengan menang atau kalah.", reverse: true, weight: 1 },
            { type: 'likert', engineKey: "disc", dimensionKey: "D", text: "Saya tegas dalam membuat keputusan.", reverse: false, weight: 1 },
            { type: 'likert', engineKey: "disc", dimensionKey: "D", text: "Saya sering ragu-ragu saat membuat keputusan.", reverse: true, weight: 1 },
            
            // DISC - Influence
            { type: 'likert', engineKey: "disc", dimensionKey: "I", text: "Saya antusias dan pandai memotivasi orang lain.", reverse: false, weight: 1 },
            { type: 'likert', engineKey: "disc", dimensionKey: "I", text: "Saya lebih suka bekerja sendiri daripada berkolaborasi secara intensif.", reverse: true, weight: 1 },
            { type: 'likert', engineKey: "disc", dimensionKey: "I", text: "Saya optimis dan melihat sisi baik dari segala sesuatu.", reverse: false, weight: 1 },
            { type: 'likert', engineKey: "disc", dimensionKey: "I", text: "Saya cenderung skeptis dan realistis.", reverse: true, weight: 1 },
            { type: 'likert', engineKey: "disc", dimensionKey: "I", text: "Saya suka berada di sekitar orang banyak.", reverse: false, weight: 1 },
            { type: 'likert', engineKey: "disc", dimensionKey: "I", text: "Saya lebih suka lingkungan yang tenang.", reverse: true, weight: 1 },
            { type: 'likert', engineKey: "disc", dimensionKey: "I", text: "Saya pandai membujuk orang lain.", reverse: false, weight: 1 },
            { type: 'likert', engineKey: "disc", dimensionKey: "I", text: "Saya lebih suka mengandalkan fakta daripada persuasi.", reverse: true, weight: 1 },
            { type: 'likert', engineKey: "disc", dimensionKey: "I", text: "Saya adalah orang yang ramah dan mudah didekati.", reverse: false, weight: 1 },
            { type: 'likert', engineKey: "disc", dimensionKey: "I", text: "Saya cenderung menjaga jarak dengan orang lain.", reverse: true, weight: 1 },

            // DISC - Steadiness
            { type: 'likert', engineKey: "disc", dimensionKey: "S", text: "Saya adalah pendengar yang baik dan sabar.", reverse: false, weight: 1 },
            { type: 'likert', engineKey: "disc", dimensionKey: "S", text: "Saya menyukai lingkungan kerja yang dinamis dan selalu berubah.", reverse: true, weight: 1 },
            { type: 'likert', engineKey: "disc", dimensionKey: "S", text: "Saya adalah pemain tim yang suportif.", reverse: false, weight: 1 },
            { type: 'likert', engineKey: "disc", dimensionKey: "S", text: "Saya lebih suka bekerja secara mandiri.", reverse: true, weight: 1 },
            { type: 'likert', engineKey: "disc", dimensionKey: "S", text: "Saya dapat diandalkan untuk menyelesaikan tugas.", reverse: false, weight: 1 },
            { type: 'likert', engineKey: "disc", dimensionKey: "S", text: "Saya sering berganti-ganti prioritas.", reverse: true, weight: 1 },
            { type: 'likert', engineKey: "disc", dimensionKey: "S", text: "Saya metodis dan konsisten dalam bekerja.", reverse: false, weight: 1 },
            { type: 'likert', engineKey: "disc", dimensionKey: "S", text: "Saya suka melakukan banyak hal sekaligus.", reverse: true, weight: 1 },
            { type: 'likert', engineKey: "disc", dimensionKey: "S", text: "Saya tenang di bawah tekanan.", reverse: false, weight: 1 },
            { type: 'likert', engineKey: "disc", dimensionKey: "S", text: "Saya mudah panik saat menghadapi tekanan.", reverse: true, weight: 1 },

            // DISC - Conscientiousness
            { type: 'likert', engineKey: "disc", dimensionKey: "C", text: "Saya selalu memeriksa kembali pekerjaan saya untuk memastikan tidak ada kesalahan.", reverse: false, weight: 1 },
            { type: 'likert', engineKey: "disc", dimensionKey: "C", text: "Saya lebih fokus pada gambaran besar daripada detail-detail kecil.", reverse: true, weight: 1 },
            { type: 'likert', engineKey: "disc", dimensionKey: "C", text: "Saya adalah orang yang analitis dan logis.", reverse: false, weight: 1 },
            { type: 'likert', engineKey: "disc", dimensionKey: "C", text: "Saya membuat keputusan berdasarkan perasaan.", reverse: true, weight: 1 },
            { type: 'likert', engineKey: "disc", dimensionKey: "C", text: "Saya suka mengikuti aturan dan prosedur.", reverse: false, weight: 1 },
            { type: 'likert', engineKey: "disc", dimensionKey: "C", text: "Saya suka mencari cara baru untuk melakukan sesuatu.", reverse: true, weight: 1 },
            { type: 'likert', engineKey: "disc", dimensionKey: "C", text: "Saya terorganisir dan sistematis.", reverse: false, weight: 1 },
            { type: 'likert', engineKey: "disc", dimensionKey: "C", text: "Saya cenderung tidak teratur.", reverse: true, weight: 1 },
            { type: 'likert', engineKey: "disc", dimensionKey: "C", text: "Saya memiliki standar kualitas yang tinggi.", reverse: false, weight: 1 },
            { type: 'likert', engineKey: "disc", dimensionKey: "C", text: "Saya puas dengan pekerjaan yang 'cukup baik'.", reverse: true, weight: 1 },
        ];
        
        const forcedChoiceQuestions = Array.from({ length: 100 }, (_, i) => {
            const d = { text: `Pernyataan Dominan ${i+1}`, engineKey: 'disc', dimensionKey: 'D' };
            const influencer = { text: `Pernyataan Influence ${i+1}`, engineKey: 'disc', dimensionKey: 'I' };
            const s = { text: `Pernyataan Steadiness ${i+1}`, engineKey: 'disc', dimensionKey: 'S' };
            const c = { text: `Pernyataan Conscientiousness ${i+1}`, engineKey: 'disc', dimensionKey: 'C' };
            // Simple rotation for variety
            const choices = [d, influencer, s, c];
            const rotatedChoices = choices.slice(i % 4).concat(choices.slice(0, i % 4));
            return {
                type: 'forced-choice',
                forcedChoices: rotatedChoices
            };
        });
        
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

  