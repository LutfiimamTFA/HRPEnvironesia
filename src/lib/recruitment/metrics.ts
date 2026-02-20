// @/lib/recruitment/metrics.ts
import { subDays, differenceInDays } from 'date-fns';
import type { JobApplication, ApplicationStage, ApplicationSource } from '@/lib/types';

// TODO: Replace mock data with Firestore queries

type FilterState = {
  dateRange: { from?: Date; to?: Date };
  jobs: string[];
  stages: ApplicationStage[];
  // ... other filters
};

export const calculateKpis = (applications: JobApplication[], filters: FilterState) => {
  const now = new Date();
  const rangeStart = filters.dateRange.from || subDays(now, 30);
  const rangeEnd = filters.dateRange.to || now;

  const appsInDateRange = applications.filter(app => {
    const appliedDate = app.appliedAt.toDate();
    return appliedDate >= rangeStart && appliedDate <= rangeEnd;
  });

  const activeCandidates = applications.filter(app => app.status === 'active');
  
  const offersInDateRange = applications.filter(app => 
    app.offer?.sentAt && app.offer.sentAt.toDate() >= rangeStart && app.offer.sentAt.toDate() <= rangeEnd
  );
  
  const acceptedOffers = offersInDateRange.filter(app => app.offer?.status === 'accepted');
  
  const hiredInDateRange = applications.filter(app => 
    app.stage === 'hired' && app.lastActivityAt.toDate() >= rangeStart && app.lastActivityAt.toDate() <= rangeEnd
  );

  const timeToHireDays = hiredInDateRange
    .map(app => differenceInDays(app.lastActivityAt.toDate(), app.appliedAt.toDate()))
    .sort((a, b) => a - b);
  
  const medianTimeToHire = timeToHireDays.length > 0 
    ? timeToHireDays[Math.floor(timeToHireDays.length / 2)] 
    : 0;

  const overdueCandidates = activeCandidates.filter(app => {
      const daysInStage = differenceInDays(now, app.stageEnteredAt.toDate());
      if (app.stage === 'screening' && daysInStage > 3) return true;
      if (app.stage === 'interview' && daysInStage > 5) return true;
      return false;
  }).length;
  
  return {
    newApplicants: appsInDateRange.length,
    activeCandidates: activeCandidates.length,
    inScreening: activeCandidates.filter(app => app.stage === 'screening').length,
    interviewsToday: 0, // Placeholder
    assessmentPending: activeCandidates.filter(app => app.stage === 'assessment').length,
    offersPending: activeCandidates.filter(app => app.stage === 'offer').length,
    offerAcceptanceRate: offersInDateRange.length > 0 ? (acceptedOffers.length / offersInDateRange.length) * 100 : 0,
    avgTimeToFirstResponse: 2.1, // Placeholder
    avgTimeToHire: medianTimeToHire,
    overdueCandidates: overdueCandidates,
  };
};

export const getFunnelData = (applications: JobApplication[]) => {
  // TODO: Replace with real calculation based on filters
  return [
    { stage: 'Applied', count: 1203, rate: 100 },
    { stage: 'Screening', count: 850, rate: 70.6 },
    { stage: 'Assessment', count: 452, rate: 53.2 },
    { stage: 'Interview', count: 153, rate: 33.8 },
    { stage: 'Offer', count: 45, rate: 29.4 },
    { stage: 'Hired', count: 21, rate: 46.6 },
  ];
};

export const getApplicantsTrend = (applications: JobApplication[], filters: FilterState) => {
    // TODO: Replace with real calculation based on filters
    return [
      { date: 'Mon', applicants: 5 },
      { date: 'Tue', applicants: 8 },
      { date: 'Wed', applicants: 12 },
      { date: 'Thu', applicants: 7 },
      { date: 'Fri', applicants: 15 },
      { date: 'Sat', applicants: 4 },
      { date: 'Sun', applicants: 2 },
    ];
};

export const getSourcePerformance = (applications: JobApplication[]) => {
    // TODO: Replace with real calculation based on filters
    const sources: ApplicationSource[] = ['linkedin', 'website', 'referral', 'jobstreet'];
    return sources.map(source => ({
        source,
        applicants: Math.floor(Math.random() * 200) + 50,
        hired: Math.floor(Math.random() * 10) + 1,
    }));
};
