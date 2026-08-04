export const isMonitoringDisabled = () =>
  process.env.NEXT_PUBLIC_DISABLE_ANALYTICS === 'true' ||
  process.env.NEXT_PUBLIC_DISABLE_REALTIME_MONITORING === 'true';
