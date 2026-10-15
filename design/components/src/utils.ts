export type Status = 'pending' | 'reviewing' | 'planned' | 'progress' | 'completed' | 'closed';

export const STATUS_ORDER: Status[] = ['pending', 'reviewing', 'planned', 'progress', 'completed', 'closed'];

/** Label and fill level (0–1) of each status. The fill rises from the bottom of the circle. */
export const STATUS: Record<Status, { label: string; fill: number }> = {
  pending: { label: 'Pending', fill: 0 },
  reviewing: { label: 'Reviewing', fill: 0.28 },
  planned: { label: 'Planned', fill: 0.5 },
  progress: { label: 'In progress', fill: 0.8 },
  completed: { label: 'Completed', fill: 1 },
  closed: { label: 'Closed', fill: 1 },
};

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/** SVG path of a circle of radius r (centred in a 16×16 box) filled from the bottom up to fraction f. */
export function fillPath(f: number, r: number): string {
  if (f <= 0) return '';
  if (f >= 1) return `M${8 - r} 8A${r} ${r} 0 1 0 ${8 + r} 8A${r} ${r} 0 1 0 ${8 - r} 8Z`;
  const y = 8 + r - 2 * r * f;
  const dx = Math.sqrt(r * r - (y - 8) ** 2);
  const n = (v: number) => +v.toFixed(2);
  return `M${n(8 - dx)} ${n(y)}A${r} ${r} 0 ${f > 0.5 ? 1 : 0} 0 ${n(8 + dx)} ${n(y)}Z`;
}
