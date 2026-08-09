export function getTodayDate(): string {
  const now = new Date();
  return `${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} (${now.toISOString().split('T')[0]})`;
}

export function formatDurationMmSs(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0s';
  const m = Math.floor(seconds / 60), s = seconds % 60;
  return m ? `${m}m ${s}s` : `${s}s`;
}

