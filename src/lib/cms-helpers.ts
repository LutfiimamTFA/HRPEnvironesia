/**
 * CMS Helpers untuk Landing Page Careers
 * Fetch data dari landing_sections collection dengan fallback ke hardcode defaults
 */

import { collection, query, where, getDocs, Firestore } from 'firebase/firestore';
import type { LandingSection } from './types';

// Default fallback data (dari hardcode landing page saat ini)
const DEFAULT_SECTIONS: Record<string, Partial<LandingSection>> = {
  hero: {
    sectionKey: 'hero',
    title: 'Mari Buat Perubahan Bersama Kami',
    description:
      'Jadilah bagian dari tim inovatif yang berdedikasi untuk menciptakan solusi lingkungan berkelanjutan. Temukan karier berdampak Anda di Environesia.',
    primaryButtonText: 'Lihat Lowongan',
    primaryButtonUrl: '#lowongan',
    secondaryButtonText: 'Kirim Lamaran Cepat',
    secondaryButtonUrl: '/careers/register',
    isActive: true,
  },
  jobs: {
    sectionKey: 'jobs',
    title: 'Temukan Peluang Anda',
    description:
      'Kami mencari individu berbakat untuk bergabung dengan berbagai tim kami. Jelajahi posisi yang sesuai dengan keahlian Anda.',
    isActive: true,
  },
  why_environesia: {
    sectionKey: 'why_environesia',
    title: 'Mengapa Environesia?',
    description:
      'Kami lebih dari sekadar tempat kerja. Kami adalah komunitas yang berkomitmen untuk masa depan bumi.',
    benefits: [
      {
        title: 'Karier Berdampak',
        description: 'Bekerja pada proyek-proyek lingkungan nyata di seluruh Indonesia.',
        order: 1,
        isActive: true,
      },
      {
        title: 'Pertumbuhan Profesional',
        description:
          'Kami berinvestasi pada pengembangan diri Anda melalui pelatihan dan sertifikasi.',
        order: 2,
        isActive: true,
      },
      {
        title: 'Kolaborasi Inovatif',
        description: 'Bergabunglah dengan tim ahli yang solid dan saling mendukung.',
        order: 3,
        isActive: true,
      },
      {
        title: 'Keseimbangan Hidup',
        description: 'Kami menghargai waktu pribadi Anda untuk menciptakan lingkungan kerja yang sehat.',
        order: 4,
        isActive: true,
      },
    ],
    isActive: true,
  },
  ecosystem_companies: {
    sectionKey: 'ecosystem_companies',
    title: 'Perusahaan dalam Ekosistem Kami',
    description:
      'Bagian dari grup bisnis yang berkolaborasi untuk menciptakan solusi berkelanjutan bagi masa depan bumi.',
    isActive: true,
  },
  recruitment_process: {
    sectionKey: 'recruitment_process',
    title: 'Proses Rekrutmen Kami',
    description: 'Kami merancang proses yang adil dan transparan untuk menemukan talenta terbaik.',
    steps: [
      {
        title: 'Daftar Online',
        description: 'Lengkapi profil dan kirimkan lamaran Anda melalui portal karir kami.',
        order: 1,
        isActive: true,
      },
      {
        title: 'Psikotes',
        description: 'Kerjakan tes psikologi untuk mengukur potensi dan kesesuaian Anda.',
        order: 2,
        isActive: true,
      },
      {
        title: 'Seleksi Administrasi',
        description: 'Tim rekrutmen akan meninjau kelengkapan profil dan hasil psikotes Anda.',
        order: 3,
        isActive: true,
      },
      {
        title: 'Wawancara',
        description: 'Bertemu dengan HR dan calon user untuk diskusi lebih mendalam.',
        order: 4,
        isActive: true,
      },
      {
        title: 'Tawaran Kerja',
        description: 'Kandidat terpilih akan menerima tawaran kerja resmi dari kami.',
        order: 5,
        isActive: true,
      },
    ],
    isActive: true,
  },
  basecamp: {
    sectionKey: 'basecamp',
    title: 'Basecamp Environesia',
    description:
      'Tempat ide-ide hebat lahir. Kantor pusat kami di Yogyakarta adalah pusat kolaborasi, inovasi, dan aksi nyata untuk lingkungan.',
    textPosition: 'left',
    overlayMode: 'dark',
    isActive: true,
  },
  how_to_apply: {
    sectionKey: 'how_to_apply',
    title: 'Cara Mudah Melamar',
    description:
      'Ikuti langkah-langkah sederhana ini untuk memulai perjalanan karir Anda di Environesia.',
    buttonText: 'Daftar Akun Sekarang',
    buttonUrl: '/careers/register',
    howToApplySteps: [
      {
        title: 'Buat Akun',
        description: 'Daftarkan diri Anda dengan email dan buat kata sandi.',
        order: 1,
        isActive: true,
      },
      {
        title: 'Cari Lowongan',
        description: 'Jelajahi berbagai posisi yang tersedia dan temukan yang cocok.',
        order: 2,
        isActive: true,
      },
      {
        title: 'Kirim Lamaran',
        description: 'Unggah CV terbaru Anda dan kirimkan lamaran dengan mudah.',
        order: 3,
        isActive: true,
      },
      {
        title: 'Pantau Proses',
        description: 'Lacak status lamaran Anda langsung dari dasbor kandidat.',
        order: 4,
        isActive: true,
      },
    ],
    isActive: true,
  },
  faq: {
    sectionKey: 'faq',
    title: 'Pertanyaan Umum (FAQ)',
    description: 'Jawaban atas pertanyaan umum seputar proses lamaran kerja di Environesia.',
    faqItems: [
      {
        question: 'Apa saja yang harus saya siapkan sebelum melamar?',
        answer:
          'Pastikan Anda telah menyiapkan CV (Curriculum Vitae) terbaru dalam format PDF, surat lamaran (opsional), dan portofolio jika posisi yang dilamar memerlukannya.',
        order: 1,
        isActive: true,
      },
      {
        question: 'Berapa lama proses rekrutmen biasanya berlangsung?',
        answer:
          'Proses rekrutmen kami biasanya memakan waktu 2-4 minggu dari penutupan lowongan, namun bisa bervariasi. Kami akan memberikan informasi terbaru melalui email.',
        order: 2,
        isActive: true,
      },
      {
        question: 'Apakah saya bisa melamar lebih dari satu posisi?',
        answer:
          'Ya, Anda dapat melamar hingga 3 posisi yang berbeda secara bersamaan. Namun, kami sarankan fokus pada posisi yang paling sesuai kualifikasi Anda.',
        order: 3,
        isActive: true,
      },
      {
        question: 'Siapa yang bisa saya hubungi jika ada pertanyaan?',
        answer:
          'Jika Anda memiliki pertanyaan, jangan ragu untuk menghubungi tim rekrutmen kami melalui email di careers@environesia.co.id.',
        order: 4,
        isActive: true,
      },
    ],
    isActive: true,
  },
  footer: {
    sectionKey: 'footer',
    title: 'Footer',
    brandText: 'Environesia Vacancies',
    tagline: 'Membangun karier, menjaga bumi.',
    isActive: true,
  },
};

/**
 * Fetch section data dari CMS dengan fallback ke default
 */
export async function getSectionData(
  firestore: Firestore,
  sectionKey: string
): Promise<Partial<LandingSection>> {
  try {
    const q = query(collection(firestore, 'landing_sections'), where('sectionKey', '==', sectionKey));
    const snapshot = await getDocs(q);

    if (snapshot.docs.length > 0) {
      const doc = snapshot.docs[0];
      const data = doc.data() as LandingSection;
      // Return data if active, else fallback
      if (data.isActive) {
        return data;
      }
    }
  } catch (error) {
    console.error(`Error fetching section ${sectionKey}:`, error);
  }

  // Fallback ke default
  return DEFAULT_SECTIONS[sectionKey] || {};
}

/**
 * Fetch semua section sekaligus
 */
export async function getAllSectionsData(
  firestore: Firestore
): Promise<Record<string, Partial<LandingSection>>> {
  const result: Record<string, Partial<LandingSection>> = {};

  try {
    const q = query(collection(firestore, 'landing_sections'));
    const snapshot = await getDocs(q);

    snapshot.docs.forEach((doc) => {
      const data = doc.data() as LandingSection;
      if (data.isActive) {
        result[data.sectionKey] = data;
      }
    });
  } catch (error) {
    console.error('Error fetching sections:', error);
  }

  // Merge dengan defaults untuk section yang tidak ada
  Object.keys(DEFAULT_SECTIONS).forEach((key) => {
    if (!result[key]) {
      result[key] = DEFAULT_SECTIONS[key];
    }
  });

  return result;
}
