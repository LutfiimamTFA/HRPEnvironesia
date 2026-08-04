/**
 * Seed script untuk initialize default landing sections ke Firestore
 * Run: ts-node scripts/seed-landing-sections.ts
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, setDoc, doc, Timestamp } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const firestore = getFirestore(app);

const DEFAULT_SECTIONS = [
  {
    sectionKey: 'hero',
    title: 'Mari Buat Perubahan Bersama Kami',
    description:
      'Jadilah bagian dari tim inovatif yang berdedikasi untuk menciptakan solusi lingkungan berkelanjutan. Temukan karier berdampak Anda di Environesia.',
    primaryButtonText: 'Lihat Lowongan',
    primaryButtonUrl: '#lowongan',
    secondaryButtonText: 'Kirim Lamaran Cepat',
    secondaryButtonUrl: '/careers/register',
    order: 1,
    isActive: true,
    isSystem: true,
    isDeletable: false,
    isEditable: true,
  },
  {
    sectionKey: 'jobs',
    title: 'Temukan Peluang Anda',
    description:
      'Kami mencari individu berbakat untuk bergabung dengan berbagai tim kami. Jelajahi posisi yang sesuai dengan keahlian Anda.',
    order: 2,
    isActive: true,
    isSystem: true,
    isDeletable: false,
    isEditable: true,
  },
  {
    sectionKey: 'why_environesia',
    title: 'Mengapa Environesia?',
    description:
      'Kami lebih dari sekadar tempat kerja. Kami adalah komunitas yang berkomitmen untuk masa depan bumi.',
    benefits: [
      {
        id: 'benefit-1',
        title: 'Karier Berdampak',
        description: 'Bekerja pada proyek-proyek lingkungan nyata di seluruh Indonesia.',
        order: 1,
        isActive: true,
      },
      {
        id: 'benefit-2',
        title: 'Pertumbuhan Profesional',
        description: 'Kami berinvestasi pada pengembangan diri Anda melalui pelatihan dan sertifikasi.',
        order: 2,
        isActive: true,
      },
      {
        id: 'benefit-3',
        title: 'Kolaborasi Inovatif',
        description: 'Bergabunglah dengan tim ahli yang solid dan saling mendukung.',
        order: 3,
        isActive: true,
      },
      {
        id: 'benefit-4',
        title: 'Keseimbangan Hidup',
        description:
          'Kami menghargai waktu pribadi Anda untuk menciptakan lingkungan kerja yang sehat.',
        order: 4,
        isActive: true,
      },
    ],
    order: 3,
    isActive: true,
    isSystem: true,
    isDeletable: false,
    isEditable: true,
  },
  {
    sectionKey: 'ecosystem_companies',
    title: 'Perusahaan dalam Ekosistem Kami',
    description:
      'Bagian dari grup bisnis yang berkolaborasi untuk menciptakan solusi berkelanjutan bagi masa depan bumi.',
    order: 4,
    isActive: true,
    isSystem: true,
    isDeletable: false,
    isEditable: true,
  },
  {
    sectionKey: 'recruitment_process',
    title: 'Proses Rekrutmen Kami',
    description: 'Kami merancang proses yang adil dan transparan untuk menemukan talenta terbaik.',
    steps: [
      {
        id: 'step-1',
        title: 'Daftar Online',
        description: 'Lengkapi profil dan kirimkan lamaran Anda melalui portal karir kami.',
        order: 1,
        isActive: true,
      },
      {
        id: 'step-2',
        title: 'Psikotes',
        description: 'Kerjakan tes psikologi untuk mengukur potensi dan kesesuaian Anda.',
        order: 2,
        isActive: true,
      },
      {
        id: 'step-3',
        title: 'Seleksi Administrasi',
        description: 'Tim rekrutmen akan meninjau kelengkapan profil dan hasil psikotes Anda.',
        order: 3,
        isActive: true,
      },
      {
        id: 'step-4',
        title: 'Wawancara',
        description: 'Bertemu dengan HR dan calon user untuk diskusi lebih mendalam.',
        order: 4,
        isActive: true,
      },
      {
        id: 'step-5',
        title: 'Tawaran Kerja',
        description: 'Kandidat terpilih akan menerima tawaran kerja resmi dari kami.',
        order: 5,
        isActive: true,
      },
    ],
    order: 5,
    isActive: true,
    isSystem: true,
    isDeletable: false,
    isEditable: true,
  },
  {
    sectionKey: 'basecamp',
    title: 'Basecamp Environesia',
    description:
      'Tempat ide-ide hebat lahir. Kantor pusat kami di Yogyakarta adalah pusat kolaborasi, inovasi, dan aksi nyata untuk lingkungan.',
    textPosition: 'left',
    overlayMode: 'dark',
    order: 6,
    isActive: true,
    isSystem: true,
    isDeletable: false,
    isEditable: true,
  },
  {
    sectionKey: 'how_to_apply',
    title: 'Cara Mudah Melamar',
    description:
      'Ikuti langkah-langkah sederhana ini untuk memulai perjalanan karir Anda di Environesia.',
    buttonText: 'Daftar Akun Sekarang',
    buttonUrl: '/careers/register',
    howToApplySteps: [
      {
        id: 'step-1',
        title: 'Buat Akun',
        description: 'Daftarkan diri Anda dengan email dan buat kata sandi.',
        order: 1,
        isActive: true,
      },
      {
        id: 'step-2',
        title: 'Cari Lowongan',
        description: 'Jelajahi berbagai posisi yang tersedia dan temukan yang cocok.',
        order: 2,
        isActive: true,
      },
      {
        id: 'step-3',
        title: 'Kirim Lamaran',
        description: 'Unggah CV terbaru Anda dan kirimkan lamaran dengan mudah.',
        order: 3,
        isActive: true,
      },
      {
        id: 'step-4',
        title: 'Pantau Proses',
        description: 'Lacak status lamaran Anda langsung dari dasbor kandidat.',
        order: 4,
        isActive: true,
      },
    ],
    order: 7,
    isActive: true,
    isSystem: true,
    isDeletable: false,
    isEditable: true,
  },
  {
    sectionKey: 'faq',
    title: 'Pertanyaan Umum (FAQ)',
    description: 'Jawaban atas pertanyaan umum seputar proses lamaran kerja di Environesia.',
    faqItems: [
      {
        id: 'faq-1',
        question: 'Apa saja yang harus saya siapkan sebelum melamar?',
        answer:
          'Pastikan Anda telah menyiapkan CV (Curriculum Vitae) terbaru dalam format PDF, surat lamaran (opsional), dan portofolio jika posisi yang dilamar memerlukannya.',
        order: 1,
        isActive: true,
      },
      {
        id: 'faq-2',
        question: 'Berapa lama proses rekrutmen biasanya berlangsung?',
        answer:
          'Proses rekrutmen kami biasanya memakan waktu 2-4 minggu dari penutupan lowongan, namun bisa bervariasi. Kami akan memberikan informasi terbaru melalui email.',
        order: 2,
        isActive: true,
      },
      {
        id: 'faq-3',
        question: 'Apakah saya bisa melamar lebih dari satu posisi?',
        answer:
          'Ya, Anda dapat melamar hingga 3 posisi yang berbeda secara bersamaan. Namun, kami sarankan fokus pada posisi yang paling sesuai kualifikasi Anda.',
        order: 3,
        isActive: true,
      },
      {
        id: 'faq-4',
        question: 'Siapa yang bisa saya hubungi jika ada pertanyaan?',
        answer:
          'Jika Anda memiliki pertanyaan, jangan ragu untuk menghubungi tim rekrutmen kami melalui email di careers@environesia.co.id.',
        order: 4,
        isActive: true,
      },
    ],
    order: 8,
    isActive: true,
    isSystem: true,
    isDeletable: false,
    isEditable: true,
  },
  {
    sectionKey: 'footer',
    title: 'Footer',
    brandText: 'Environesia Vacancies',
    tagline: 'Membangun karier, menjaga bumi.',
    description: '© 2026 Environesia. All Rights Reserved.',
    order: 9,
    isActive: true,
    isSystem: true,
    isDeletable: false,
    isEditable: true,
  },
];

async function seedSections() {
  console.log('🌱 Starting to seed landing sections...\n');

  try {
    for (const section of DEFAULT_SECTIONS) {
      const docRef = doc(firestore, 'landing_sections', section.sectionKey);
      const now = Timestamp.now();

      await setDoc(docRef, {
        ...section,
        createdAt: now,
        updatedAt: now,
        createdBy: 'seed-script',
      });

      console.log(`✅ Created: ${section.title} (${section.sectionKey})`);
    }

    console.log('\n✨ All sections seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding sections:', error);
    process.exit(1);
  }
}

seedSections();
