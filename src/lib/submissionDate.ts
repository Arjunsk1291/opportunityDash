import { Opportunity } from '@/data/opportunityData';

function parseFlexibleDate(raw?: string | null): Date | null {
  if (!raw) return null;
  const value = String(raw).trim();
  if (!value) return null;

  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const dayFirst = value.match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?$/);
  if (dayFirst) {
    const day = Number(dayFirst[1]);
    const month = Number(dayFirst[2]) - 1;
    const yearRaw = dayFirst[3];
    const year = yearRaw ? (yearRaw.length === 2 ? Number(`20${yearRaw}`) : Number(yearRaw)) : new Date().getFullYear();
    const d = new Date(year, month, day);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function diffDaysFromToday(date: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function getEffectiveSubmissionDate(opp: Pick<Opportunity, 'tenderSubmittedDate' | 'tenderPlannedSubmissionDate'>): Date | null {
  const submitted = parseFlexibleDate(opp.tenderSubmittedDate);
  const planned = parseFlexibleDate(opp.tenderPlannedSubmissionDate);

  const candidates = [submitted, planned].filter((d): d is Date => !!d);
  if (!candidates.length) return null;

  const upcoming = candidates
    .map((date) => ({ date, days: diffDaysFromToday(date) }))
    .filter((item) => item.days >= 0)
    .sort((a, b) => a.days - b.days);

  if (upcoming.length) return upcoming[0].date;

  return candidates.sort((a, b) => b.getTime() - a.getTime())[0];
}

export function isSubmissionWithinDays(
  opp: Pick<Opportunity, 'tenderSubmittedDate' | 'tenderPlannedSubmissionDate'>,
  days: number,
): boolean {
  const date = getEffectiveSubmissionDate(opp);
  if (!date) return false;
  const diff = diffDaysFromToday(date);
  return diff >= 0 && diff <= days;
}

export function getSubmissionDaysLeft(opp: Pick<Opportunity, 'tenderSubmittedDate' | 'tenderPlannedSubmissionDate'>): number {
  const date = getEffectiveSubmissionDate(opp);
  if (!date) return Number.POSITIVE_INFINITY;
  return Math.max(0, diffDaysFromToday(date));
}
