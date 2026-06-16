/** Shared date-range filter: All / 15d / 30d / 60d / 90d presets + custom From→To. */
export interface RangeValue { days: number | null; from: string; to: string }
export const EMPTY_RANGE: RangeValue = { days: null, from: '', to: '' };

const DAY = 86400000;
const PRESETS = [15, 30, 60, 90];

/** True if an ISO date falls within the active range (all-pass when nothing is set). */
export function matchesRange(dateIso: string | null, r: RangeValue): boolean {
  if (!r.days && !r.from && !r.to) return true;
  if (!dateIso) return false;
  const t = new Date(dateIso).getTime();
  if (Number.isNaN(t)) return false;
  if (r.from || r.to) {
    if (r.from && t < new Date(`${r.from}T00:00:00`).getTime()) return false;
    if (r.to && t > new Date(`${r.to}T23:59:59`).getTime()) return false;
    return true;
  }
  return t >= Date.now() - (r.days as number) * DAY;
}

const pill = (active: boolean): React.CSSProperties => ({
  background: active ? 'var(--accent-blue)' : 'var(--bg)',
  color: active ? '#fff' : 'var(--text-dim)',
  border: '1px solid var(--border)', borderRadius: 6, fontSize: '12px', fontWeight: 600,
  padding: '6px 10px', cursor: 'pointer',
});
const dateInput: React.CSSProperties = {
  background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6,
  color: 'var(--text)', fontSize: '12px', padding: '5px 8px', colorScheme: 'dark',
};

export function DateRange({ value, onChange }: { value: RangeValue; onChange: (v: RangeValue) => void }) {
  const custom = !!(value.from || value.to);
  return (
    <div className="flex items-center flex-wrap gap-1.5">
      <button style={pill(!value.days && !custom)} onClick={() => onChange(EMPTY_RANGE)}>All</button>
      {PRESETS.map((d) => (
        <button key={d} style={pill(value.days === d && !custom)} onClick={() => onChange({ days: d, from: '', to: '' })}>{d}d</button>
      ))}
      <input type="date" value={value.from} max={value.to || undefined} style={dateInput}
        onChange={(e) => onChange({ days: null, from: e.target.value, to: value.to })} title="From" />
      <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>→</span>
      <input type="date" value={value.to} min={value.from || undefined} style={dateInput}
        onChange={(e) => onChange({ days: null, from: value.from, to: e.target.value })} title="To" />
    </div>
  );
}
