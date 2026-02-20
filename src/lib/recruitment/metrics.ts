import { subDays, differenceInDays, startOfDay } from 'date-fns';
import type { JobApplication } from '@/lib/types';
import { statusDisplayLabels } from '@/components/recruitment/ApplicationStatusBadge';

export type FilterState = {
  dateRange: { from?: Date; to?: Date };
  jobIds?: string[];
  recruiterIds?: string[];
  stages?: string[];
};

const countBy = <T,>(arr: T[], fn: (item: T) => string | number | undefined) => {
    return arr.reduce((acc, item) => {
        const key = fn(item);
        if (key === undefined) return acc;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {} as Record<string | number, number>);
};

export const calculateKpis = (applications: JobApplication[], filters: FilterState) => {
  const now = new Date();
  const rangeStart = filters.dateRange.from || subDays(now, 30);
  const rangeEnd = filters.dateRange.to || now;

  const appsInDateRange = applications.filter(app => {
    const appliedDate = app.submittedAt?.toDate();
    return appliedDate && appliedDate >= rangeStart && appliedDate <= rangeEnd;
  });

  const activeCandidates = applications.filter(app => !['hired', 'rejected', 'draft'].includes(app.status));
  
  const hiredInDateRange = applications.filter(app => 
    app.status === 'hired' && app.updatedAt.toDate() >= rangeStart && app.updatedAt.toDate() <= rangeEnd
  );

  const timeToHireDays = hiredInDateRange
    .filter(app => app.submittedAt)
    .map(app => differenceInDays(app.updatedAt.toDate(), app.submittedAt!.toDate()))
    .sort((a, b) => a - b);
  
  const medianTimeToHire = timeToHireDays.length > 0 
    ? timeToHireDays[Math.floor(timeToHireDays.length / 2)] 
    : 0;

  // NOTE: These KPIs require fields not yet in the data model (interviews, offers, stageEnteredAt, source).
  // They are kept as placeholders.
  return {
    newApplicants: appsInDateRange.length,
    activeCandidates: activeCandidates.length,
    inScreening: activeCandidates.filter(app => app.status === 'verification').length,
    assessmentPending: activeCandidates.filter(app => app.status === 'tes_kepribadian').length,
    avgTimeToHire: medianTimeToHire,
    // --- Placeholders ---
    interviewsToday: 0,
    offersPending: 0,
    offerAcceptanceRate: 0,
    overdueCandidates: 0,
    avgTimeToFirstResponse: 0,
  };
};

export const getFunnelData = (applications: JobApplication[]) => {
  const stageOrder: JobApplication['status'][] = ['submitted', 'tes_kepribadian', 'verification', 'document_submission', 'interview', 'hired'];
  
  const stageCounts = countBy(applications, app => app.status);

  let cumulativeCount = applications.filter(app => app.status !== 'draft').length;
  if(cumulativeCount === 0) return [];

  const funnel = stageOrder.map((stage, index) => {
    const count = stageCounts[stage] || 0;
    const previousStageCount = index > 0 ? (stageCounts[stageOrder[index-1]] || 0) : cumulativeCount;
    
    // For 'hired', the conversion is from the previous step ('interview'), not the total.
    let rate = 0;
    if (index === 0) {
      // The first stage's "conversion" isn't meaningful in the same way, but can be shown as 100% of its own count
      rate = 100;
    } else if (previousStageCount > 0) {
      // Calculate how many progressed from the previous stage to this one. This requires a more complex model with stage history.
      // A simplified approach: assume anyone in a later stage must have passed through the previous one.
      const cumulativeLaterStages = stageOrder.slice(index).reduce((sum, s) => sum + (stageCounts[s] || 0), 0);
      const cumulativeCurrentAndLater = stageOrder.slice(index - 1).reduce((sum, s) => sum + (stageCounts[s] || 0), 0);
      rate = cumulativeCurrentAndLater > 0 ? (cumulativeLaterStages / cumulativeCurrentAndLater) * 100 : 0;
    }

    return {
      stage: statusDisplayLabels[stage],
      count: count,
      rate: parseFloat(rate.toFixed(1))
    };
  });

  return funnel.filter(f => f.count > 0 || f.stage === 'Terkirim');
};


export const getApplicantsTrend = (applications: JobApplication[], filters: FilterState) => {
    const now = new Date();
    const rangeStart = filters.dateRange.from || subDays(now, 30);
    const rangeEnd = filters.dateRange.to || now;

    const appsInDateRange = applications.filter(app => {
        const appliedDate = app.submittedAt?.toDate();
        return appliedDate && appliedDate >= rangeStart && appliedDate <= rangeEnd;
    });

    const trendData = countBy(appsInDateRange, app => formatDate(startOfDay(app.submittedAt!.toDate()), 'yyyy-MM-dd'));

    const result = Object.entries(trendData).map(([date, applicants]) => ({
        date,
        applicants,
    })).sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    return result;
};


export const getSourcePerformance = (applications: JobApplication[]) => {
    // This cannot be implemented until a 'source' field is added to the JobApplication data model.
    return [];
};
