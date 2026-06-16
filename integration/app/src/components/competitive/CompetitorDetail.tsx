import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ExternalLink, Search, Swords } from 'lucide-react';
import { getCompetitorDetail, CATEGORY_COLORS, type CompetitorDetail as Detail } from '../../services/competitiveApi';
import { DateRange, matchesRange, EMPTY_RANGE, type RangeValue } from './DateRange';

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px' };
const chip = (color: string): React.CSSProperties => ({ fontSize: '11px', color, padding: '2px 8px', borderRadius: '999px', border: `1px solid ${color}55`, background: `${color}1a`, whiteSpace: 'nowrap' });
const sel: React.CSSProperties = { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', fontSize: '12.5px', padding: '7px 10px', cursor: 'pointer', outline: 'none' };
const TELNYX = '#00c389';
const colorFor = (c: string | null) => (c && CATEGORY_COLORS[c]) || '#7f8c8d';
const scoreColor = (s: number | null) => { const n = s ?? 0; return n >= 90 ? '#1e7e3e' : n >= 70 ? '#2980b9' : n >= 40 ? '#e67e22' : n >= 15 ? '#95a5a6' : '#c0392b'; };

type Row = { cat: string; compProducts: string[]; compSignals: number; telnyx: string[]; coverage: string };
function buildRows(d: Detail): Row[] {
  const cats = new Set<string>();
  d.signals.filter((s) => s.relevant && s.category).forEach((s) => cats.add(s.category as string));
  d.products.forEach((p) => p.category && cats.add(p.category));
  d.offerings.forEach((o) => o.category && cats.add(o.category));
  return [...cats].sort().map((cat) => {
    const compProducts = d.products.filter((p) => p.category === cat).map((p) => p.name);
    const compSignals = d.signals.filter((s) => s.relevant && s.category === cat).length;
    const telnyx = d.offerings.filter((o) => o.category === cat).map((o) => o.name);
    const hasComp = compProducts.length > 0 || compSignals > 0;
    return { cat, compProducts, compSignals, telnyx, coverage: hasComp && telnyx.length ? 'head-to-head' : hasComp ? 'competitor only' : 'Telnyx only' };
  });
}

// Sub-bullet line: a labelled list of product names (falls back to signal count when
// the competitor has activity but no named product yet).
function SubBullet({ label, labelColor, names, fallback }: { label: string; labelColor: string; names: string[]; fallback?: string }) {
  return (
    <div className="flex gap-1.5" style={{ fontSize: '12px', paddingLeft: 16 }}>
      <span style={{ color: labelColor, fontWeight: 600, whiteSpace: 'nowrap' }}>{label}:</span>
      {names.length ? <span style={{ color: 'var(--text)' }}>{names.join(' · ')}</span>
        : <span style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>{fallback ?? '—'}</span>}
    </div>
  );
}

function Buckets({ rows, name }: { rows: Row[]; name: string }) {
  const groups = [
    { key: 'head-to-head', title: 'Head-to-head', color: 'var(--accent-green)', note: 'both compete here', icon: true },
    { key: 'competitor only', title: 'Telnyx gap', color: 'var(--accent-yellow)', note: `${name} active · Telnyx absent`, icon: false },
    { key: 'Telnyx only', title: 'Telnyx-only', color: 'var(--text-dim)', note: `Telnyx covers · ${name} quiet`, icon: false },
  ];
  const compFallback = (r: Row) => (r.compSignals ? `${r.compSignals} signal${r.compSignals === 1 ? '' : 's'}` : '—');
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {groups.map((g) => {
        const items = rows.filter((r) => r.coverage === g.key);
        return (
          <div key={g.key} className="p-3 flex flex-col gap-3" style={{ ...card, borderTop: `3px solid ${g.color}` }}>
            <div>
              <div className="flex items-center gap-2">
                {g.icon && <Swords size={13} color={g.color} />}
                <span style={{ color: 'var(--text)', fontSize: '13px', fontWeight: 700 }}>{g.title}</span>
                <span style={{ color: 'var(--text-dim)', fontSize: '12px' }}>({items.length})</span>
              </div>
              <span style={{ color: 'var(--text-dim)', fontSize: '11px' }}>{g.note}</span>
            </div>
            <div className="flex flex-col gap-2.5">
              {items.length === 0 && <span style={{ color: 'var(--text-dim)', fontSize: '12px' }}>—</span>}
              {items.map((r) => (
                <div key={r.cat} className="flex flex-col gap-1">
                  <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--text)', fontSize: '12.5px', fontWeight: 600 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: colorFor(r.cat) }} />{r.cat}
                  </span>
                  {g.key === 'head-to-head' && (
                    <>
                      <SubBullet label={name} labelColor="var(--text-dim)" names={r.compProducts} fallback={compFallback(r)} />
                      <SubBullet label="Telnyx" labelColor={TELNYX} names={r.telnyx} />
                    </>
                  )}
                  {g.key === 'competitor only' && (
                    <SubBullet label={name} labelColor="var(--text-dim)" names={r.compProducts} fallback={compFallback(r)} />
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function CompetitorDetail({ competitorId, name, onBack }: { competitorId: number | string; name: string; onBack: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);

  // signal filters
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [signalType, setSignalType] = useState('all');
  const [relevantOnly, setRelevantOnly] = useState(false);
  const [range, setRange] = useState<RangeValue>(EMPTY_RANGE);

  useEffect(() => {
    let live = true; setLoading(true);
    getCompetitorDetail(competitorId).then((res) => { if (live) { setD(res); setLoading(false); } });
    return () => { live = false; };
  }, [competitorId]);

  const rows = useMemo(() => (d ? buildRows(d) : []), [d]);
  const signals = d?.signals ?? [];
  const categoryNames = useMemo(() => Array.from(new Set(signals.map((s) => s.category).filter((c): c is string => !!c))).sort(), [signals]);
  const signalTypes = useMemo(() => Array.from(new Set(signals.map((s) => s.signalType).filter((c): c is string => !!c))).sort(), [signals]);

  const filtered = useMemo(() => {
    const qy = query.trim().toLowerCase();
    return signals.filter((s) => {
      if (category !== 'all' && s.category !== category) return false;
      if (signalType !== 'all' && s.signalType !== signalType) return false;
      if (relevantOnly && !s.relevant) return false;
      if (!matchesRange(s.scrapedAt, range)) return false;
      if (qy && !`${s.title ?? ''} ${s.summary ?? ''} ${s.product ?? ''}`.toLowerCase().includes(qy)) return false;
      return true;
    });
  }, [signals, query, category, signalType, relevantOnly, range]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="inline-flex items-center gap-1.5" style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-dim)', fontSize: '12.5px', padding: '6px 10px', cursor: 'pointer' }}><ArrowLeft size={14} /> Companies</button>
        <h1 style={{ color: 'var(--text)', fontSize: '20px', fontWeight: 700, margin: 0 }}>{name}</h1>
      </div>

      {loading && <div style={{ color: 'var(--text-dim)', fontSize: '13px' }}>Loading…</div>}

      {d && (
        <>
          {/* Coverage vs Telnyx — buckets with product sub-bullets */}
          <h3 style={{ color: 'var(--text)', fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Coverage vs Telnyx</h3>
          {rows.length === 0 ? <div className="rounded-lg p-4" style={{ ...card, color: 'var(--text-dim)', fontSize: '13px' }}>No category overlap yet.</div> : <Buckets rows={rows} name={name} />}

          {/* Signals + filters */}
          <div className="flex items-center justify-between flex-wrap gap-2" style={{ marginTop: 4 }}>
            <h3 style={{ color: 'var(--text)', fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Signals</h3>
            <span style={{ color: 'var(--text-dim)', fontSize: '12px' }}>{filtered.length}{filtered.length !== signals.length && <span> · filtered from {signals.length}</span>}</span>
          </div>
          <div className="rounded-lg p-3 flex items-center flex-wrap gap-3" style={card}>
            <div className="flex items-center gap-2 flex-1 min-w-[200px]" style={{ ...sel, cursor: 'text', padding: '0 10px' }}>
              <Search size={14} color="var(--text-dim)" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search signals…" style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontSize: '12.5px', padding: '8px 0', width: '100%' }} />
            </div>
            <select style={sel} value={category} onChange={(e) => setCategory(e.target.value)}><option value="all">All categories</option>{categoryNames.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            <select style={sel} value={signalType} onChange={(e) => setSignalType(e.target.value)}><option value="all">All types</option>{signalTypes.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}</select>
            <select style={sel} value={relevantOnly ? 'relevant' : 'all'} onChange={(e) => setRelevantOnly(e.target.value === 'relevant')}><option value="all">All</option><option value="relevant">Relevant only</option></select>
          </div>
          <div className="flex items-center flex-wrap gap-2">
            <span style={{ color: 'var(--text-dim)', fontSize: '12px' }}>Date range</span>
            <DateRange value={range} onChange={setRange} />
          </div>
          <div className="flex flex-col gap-2">
            {filtered.length === 0 ? <div className="rounded-lg p-8 text-center" style={{ ...card, color: 'var(--text-dim)', fontSize: '13px' }}>No signals match your filters.</div>
              : filtered.map((s) => (
                <div key={s.id} className="p-3" style={{ ...card, borderLeft: `3px solid ${colorFor(s.category)}` }}>
                  <div className="flex items-center flex-wrap gap-2" style={{ marginBottom: '5px' }}>
                    <span style={{ color: scoreColor(s.relevanceScore), fontWeight: 700, fontSize: '12px' }}>{s.relevanceScore ?? 0}</span>
                    {s.signalType && <span style={{ color: 'var(--text-dim)', fontSize: '11px' }}>{s.signalType.replace('_', ' ')}</span>}
                    {s.category && <span style={chip(colorFor(s.category))}>{s.category}</span>}
                    {s.product && <span style={{ color: 'var(--text-dim)', fontSize: '11px' }}>· {s.product}</span>}
                    {!s.relevant && <span style={{ color: 'var(--text-dim)', fontSize: '10.5px', fontWeight: 700 }}>NOT RELEVANT</span>}
                  </div>
                  <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1" style={{ color: 'var(--accent-blue)', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}>{s.title || s.url} <ExternalLink size={11} /></a>
                  {s.summary && <p style={{ color: 'var(--text-dim)', fontSize: '12px', lineHeight: 1.5, margin: '4px 0 0' }}>{s.summary}</p>}
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
