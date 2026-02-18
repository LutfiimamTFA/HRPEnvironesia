
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { Profile, Education, WorkExperience, OrganizationalExperience, Certification } from "@/lib/types";
import { format } from 'date-fns';
import { Badge } from "../ui/badge";

type InfoRowProps = {
  label: string;
  value?: string | number | null;
};

const InfoRow = ({ label, value }: InfoRowProps) => (
  <div className="grid grid-cols-3 gap-4">
    <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
    <dd className="text-sm col-span-2">{value || '-'}</dd>
  </div>
);

type SectionProps = {
    title: string;
    children: React.ReactNode;
}
const Section = ({ title, children }: SectionProps) => (
    <div className="space-y-4">
        <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
        <div className="space-y-3 pl-4 border-l-2 border-border">{children}</div>
    </div>
);

const AddressView = ({ title, address }: { title: string; address: Profile['addressKtp'] }) => (
    <div>
        <h4 className="font-medium text-sm text-muted-foreground">{title}</h4>
        <p className="text-sm">{address.street}, RT {address.rt}/RW {address.rw}</p>
        <p className="text-sm">{address.village}, {address.district}</p>
        <p className="text-sm">{address.city}, {address.province} {address.postalCode}</p>
    </div>
);

const EducationView = ({ item }: { item: Education }) => (
    <div className="text-sm">
        <p className="font-semibold">{item.institution}</p>
        <p>{item.level} - {item.fieldOfStudy}</p>
        <p className="text-muted-foreground">{item.startDate} - {item.isCurrent ? 'Sekarang' : item.endDate}</p>
        {item.gpa && <p className="text-muted-foreground">IPK/Nilai: {item.gpa}</p>}
    </div>
);

const WorkExperienceView = ({ item }: { item: WorkExperience }) => (
    <div className="text-sm">
        <p className="font-semibold">{item.position} <span className="font-normal text-muted-foreground">di {item.company}</span></p>
        <p className="capitalize">{item.jobType}</p>
        <p className="text-muted-foreground">{item.startDate} - {item.isCurrent ? 'Sekarang' : item.endDate}</p>
        {item.description && <p className="mt-1">{item.description}</p>}
        {!item.isCurrent && item.reasonForLeaving && <p className="mt-1 text-sm italic text-muted-foreground">Alasan berhenti: {item.reasonForLeaving}</p>}
    </div>
);

const OrgExperienceView = ({ item }: { item: OrganizationalExperience }) => (
    <div className="text-sm">
        <p className="font-semibold">{item.position} <span className="font-normal text-muted-foreground">di {item.organization}</span></p>
        <p className="text-muted-foreground">{item.startDate} - {item.isCurrent ? 'Sekarang' : item.endDate}</p>
        {item.description && <p className="mt-1">{item.description}</p>}
    </div>
);

const CertificationView = ({ item }: { item: Certification }) => (
    <div className="text-sm">
        <p className="font-semibold">{item.name}</p>
        <p className="text-muted-foreground">Penerbit: {item.organization}</p>
        <p className="text-muted-foreground">Tanggal: {item.issueDate} {item.expirationDate ? ` - ${item.expirationDate}` : ''}</p>
    </div>
);

export function ProfileView({ profile }: { profile: Profile }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Candidate Profile</CardTitle>
        <CardDescription>
          Detailed information submitted by {profile.fullName}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        <section className="space-y-4">
            <h3 className="text-xl font-semibold tracking-tight border-b pb-2">Informasi Pribadi</h3>
            <InfoRow label="Nama Lengkap" value={profile.fullName} />
            <InfoRow label="Nama Panggilan" value={profile.nickname} />
            <InfoRow label="Email" value={profile.email} />
            <InfoRow label="Telepon" value={profile.phone} />
            <InfoRow label="Jenis Kelamin" value={profile.gender} />
            <InfoRow label="Tempat, Tanggal Lahir" value={`${profile.birthPlace}, ${format(profile.birthDate.toDate(), 'dd MMMM yyyy')}`} />
            <InfoRow label="Nomor e-KTP" value={profile.eKtpNumber} />
        </section>

        <Separator />

        <section className="space-y-4">
            <h3 className="text-xl font-semibold tracking-tight border-b pb-2">Alamat</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <AddressView title="Alamat KTP" address={profile.addressKtp} />
                {profile.isDomicileSameAsKtp ? <p className="text-sm text-muted-foreground">Alamat domisili sama dengan alamat KTP.</p> : <AddressView title="Alamat Domisili" address={profile.addressDomicile} />}
            </div>
        </section>

        <Separator />
        
        <section className="space-y-4">
            <h3 className="text-xl font-semibold tracking-tight border-b pb-2">Informasi Lainnya</h3>
            <InfoRow label="NPWP" value={profile.hasNpwp ? profile.npwpNumber : 'Tidak ada'} />
            <InfoRow label="Bersedia WFO" value={profile.willingToWfo ? 'Ya' : 'Tidak'} />
            <InfoRow label="LinkedIn" value={profile.linkedinUrl} />
            <InfoRow label="Website/Portfolio" value={profile.websiteUrl} />
        </section>

        <Separator />
        
        <div className="grid md:grid-cols-2 gap-8">
          <Section title="Pendidikan">
            {profile.education?.map((item, i) => <EducationView key={i} item={item} />)}
          </Section>
          
          <Section title="Keahlian">
            <div className="flex flex-wrap gap-2">
                {profile.skills?.map(skill => <Badge key={skill} variant="secondary">{skill}</Badge>)}
            </div>
          </Section>

          {profile.workExperience && profile.workExperience.length > 0 && (
            <Section title="Pengalaman Kerja">
              {profile.workExperience.map((item, i) => <WorkExperienceView key={i} item={item} />)}
            </Section>
          )}

          {profile.organizationalExperience && profile.organizationalExperience.length > 0 && (
             <Section title="Pengalaman Organisasi">
              {profile.organizationalExperience.map((item, i) => <OrgExperienceView key={i} item={item} />)}
            </Section>
          )}

          {profile.certifications && profile.certifications.length > 0 && (
            <Section title="Sertifikasi">
              {profile.certifications.map((item, i) => <CertificationView key={i} item={item} />)}
            </Section>
          )}
        </div>

        <Separator />
        
        <section className="space-y-4">
            <h3 className="text-xl font-semibold tracking-tight border-b pb-2">Deskripsi & Motivasi</h3>
            <InfoRow label="Profil Singkat" value={profile.selfDescription} />
            <InfoRow label="Ekspektasi Gaji" value={profile.salaryExpectation} />
            <InfoRow label="Motivasi" value={profile.motivation} />
        </section>
      </CardContent>
    </Card>
  );
}
