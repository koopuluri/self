import type { Beat } from './types';

const months = 'jan feb mar apr may jun jul aug sep oct nov dec'.split(' ');
const pad = (n: number) => String(n).padStart(2, '0');

// Stream days follow the writer's local calendar, not UTC midnight.
export function beatClock(beat: Pick<Beat, 'createdAt' | 'source'>) {
  if (beat.createdAt) {
    const date = new Date(beat.createdAt);
    if (Number.isFinite(date.getTime())) return {
      day: `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`,
      time: `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
    };
  }
  // The notebook import records the original day, but not a time of day.
  const source = beat.source?.path.match(/(?:^|\/)_(\w{3})-(\d{1,2})-(\d{4})\.md$/i);
  const month = source?.[1].toLowerCase();
  return { day: source && month && months.includes(month) ? `${month} ${Number(source[2])}, ${source[3]}` : '', time: '' };
}
