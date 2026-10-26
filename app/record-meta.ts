import type { Kind } from './model';

export const label: Record<Kind, string> = { projects: 'project', activities: 'activity', inspections: 'inspection', actions: 'corrective action' };
export const statusOptions: Record<Kind, string[]> = { projects: [], activities: ['Not started', 'In progress', 'Blocked', 'Complete'], inspections: ['Pending', 'Passed', 'Failed', 'Reinspection required'], actions: ['Open', 'Closed'] };
export const dateLabel = (s: string) => (s ? new Date(`${s}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
