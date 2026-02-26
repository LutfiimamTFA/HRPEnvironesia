'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Edit, User, Home, BookOpen, Briefcase, Sparkles, Building, Info as InfoIcon } from 'lucide-react';
import type {
  Profile,
  Address,
  Education,
  WorkExperience,
  OrganizationalExperience,
  Certification,
} from '@/lib/types';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

// Helper to mask NIK for display
const maskNik = (nik?: string): string => {
  if (!nik || nik.length < 4) return '----';
  return '************' + nik.slice(-4);
};

const Section = ({
  title,
  step,
  onEditRequest,
  icon: Icon,
  children,
}: {
  title: string;
  step: number;
  onEditRequest: (step: number) => void;
  icon: React.ElementType;
  children: React.ReactNode;
}) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between pb-2">
      <CardTitle className="text-lg flex items-center gap-3">
        <Icon className="h-5 w-5 text-primary" />
        {title}
      </CardTitle>
      <Button variant="ghost" size="sm" onClick={() => onEditRequest(step)}>
        <Edit className="mr-2 h-4 w-4" />
        Edit
      </Button>
    </CardHeader>
    <CardContent>{children}</CardContent>
  </Card>
);

const InfoRow = ({ label, value }: { label: string; value?: string | number | null }) => (
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 py-2 border-b">
    <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
    <dd className="text-sm col-span-2">{value || '-'}</dd>
  </div>
);

const AddressView = ({ title, address }: { title: string; address?: Partial<Address> }) => {
    if (!address) return null;
    return (
         <div>
            <h4 className="font-medium text-sm mb-1">{title}</h4>
            <div className="text-sm text-muted-foreground">
                <p>{address.street}, RT {address.rt}/RW {address.rw}</p>
                <p>{address.village}, {address.district}</p>
                <p>{address.city}, {address.province} {address.postalCode}</p>
            </div>
        </div>
    )
};

const EducationView = ({ item }: { item: Education }) => (
    <div className="text-sm border-t first:border-t-0 py-3">
        <p className="font-semibold">{item.institution}</p>
        <p>{item.level} - {item.fieldOfStudy}</p>
        <p className="text-muted-foreground text-xs">{item.startDate} - {item.isCurrent ? 'Sekarang' : item.endDate}</p>
        {item.gpa && <p className="text-muted-foreground text-xs">IPK/Nilai: {item.gpa}</p>}
    </div>
);

const WorkExperienceView = ({ item }: { item: WorkExperience }) => (
    <div className="text-sm border-t first:border-t-0 py-3">
        <p className="font-semibold">{item.position} <span className="font-normal text-muted-foreground">di {item.company}</span></p>
        <p className="capitalize text-xs">{item.jobType}</p>
        <p className="text-muted-foreground text-xs">{item.startDate} - {item.isCurrent ? 'Sekarang' : item.endDate}</p>
        {item.description && <p className="mt-2 text-xs">{item.description}</p>}
    </div>
);

const OrgExperienceView = ({ item }: { item: OrganizationalExperience }) => (
    <div className="text-sm border-t first:border-t-0 py-3">
        <p className="font-semibold">{item.position} <span className="font-normal text-muted-foreground">di {item.organization}</span></p>
        <p className="text-muted-foreground text-xs">{item.startDate} - {item.isCurrent ? 'Sekarang' : item.endDate}</p>
        {item.description && <p className="mt-2 text-xs">{item.description}</p>}
    </div>
);

const CertificationView = ({ item }: { item: Certification }) => (
    <div className="text-sm border-t first:border-t-0 py-3">
        <p className="font-semibold">{item.name}</p>
        <p className="text-muted-foreground text-xs">Penerbit: {item.organization}</p>
        <p className="text-muted-foreground text-xs">Tanggal: {item.issueDate} {item.expirationDate ? ` - ${item.expirationDate}` : ''}</p>
    </div>
);

export function ProfilePreview({
  profile,
  onEditRequest,
}: {
  profile: Profile;
  onEditRequest: (step: number) => void;
}) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-2xl">{profile.fullName}</CardTitle>
              <CardDescription>
                {profile.email} &bull; {profile.phone}
              </CardDescription>
            </div>
            <Badge variant={profile.profileStatus === 'completed' ? 'default' : 'secondary'}>
              {profile.profileStatus === 'completed' ? 'Lengkap' : 'Draf'}
            </Badge>
          </div>
        </CardHeader>
      </Card>
      
      <Section title="Data Pribadi" step={1} onEditRequest={onEditRequest} icon={User}>
        <dl>
            <InfoRow label="Nama Panggilan" value={profile.nickname} />
            <InfoRow label="Nomor e-KTP" value={maskNik(profile.eKtpNumber)} />
            <InfoRow label="Tempat, Tanggal Lahir" value={`${profile.birthPlace}, ${profile.birthDate ? format(profile.birthDate.toDate(), 'dd MMMM yyyy', {locale: idLocale}) : '-'}`} />
            <InfoRow label="Jenis Kelamin" value={profile.gender} />
        </dl>
      </Section>
      
       <Section title="Alamat" step={1} onEditRequest={onEditRequest} icon={Home}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <AddressView title="Alamat KTP" address={profile.addressKtp} />
            {profile.isDomicileSameAsKtp ? <p className="text-sm text-muted-foreground self-center">Alamat domisili sama dengan alamat KTP.</p> : <AddressView title="Alamat Domisili" address={profile.addressDomicile} />}
        </div>
      </Section>

      <div className="grid md:grid-cols-2 gap-6">
        <Section title="Pendidikan" step={2} onEditRequest={onEditRequest} icon={BookOpen}>
            {profile.education?.length > 0 ? profile.education.map((item) => <EducationView key={item.id} item={item} />) : <p className="text-sm text-muted-foreground">Belum ada data.</p>}
        </Section>
         <Section title="Pengalaman Kerja" step={3} onEditRequest={onEditRequest} icon={Briefcase}>
            {profile.workExperience?.length > 0 ? profile.workExperience.map((item) => <WorkExperienceView key={item.id} item={item} />) : <p className="text-sm text-muted-foreground">Belum ada data.</p>}
        </Section>
         <Section title="Pengalaman Organisasi" step={4} onEditRequest={onEditRequest} icon={Building}>
            {profile.organizationalExperience?.length > 0 ? profile.organizationalExperience.map((item) => <OrgExperienceView key={item.id} item={item} />) : <p className="text-sm text-muted-foreground">Belum ada data.</p>}
        </Section>
        <Section title="Keahlian & Sertifikasi" step={5} onEditRequest={onEditRequest} icon={Sparkles}>
            <h4 className="font-semibold text-sm">Keahlian</h4>
            <div className="flex flex-wrap gap-2">
                {profile.skills?.length > 0 ? profile.skills.map(skill => <Badge key={skill} variant="secondary">{skill}</Badge>) : <p className="text-sm text-muted-foreground">Belum ada data.</p>}
            </div>
            <Separator className="my-4"/>
             <h4 className="font-semibold text-sm">Sertifikasi</h4>
            {profile.certifications?.length > 0 ? profile.certifications.map((item) => <CertificationView key={item.id} item={item} />) : <p className="text-sm text-muted-foreground">Belum ada data.</p>}
        </Section>
      </div>

       <Section title="Tentang Saya" step={6} onEditRequest={onEditRequest} icon={InfoIcon}>
        <dl>
            <InfoRow label="Profil Singkat" value={profile.selfDescription} />
            <InfoRow label="Ekspektasi Gaji" value={profile.salaryExpectation} />
            <InfoRow label="Motivasi" value={profile.motivation} />
        </dl>
      </Section>
    </div>
  );
}
