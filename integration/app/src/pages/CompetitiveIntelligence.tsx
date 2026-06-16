import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Telescope, Search, RefreshCw, ExternalLink, Sparkles, Megaphone, Wrench,
  TrendingUp, CircleSlash, Building2, Layers, ChevronRight, Play, PackagePlus, Plus,
} from 'lucide-react';
import {
  getCompetitive, triggerRefresh, runPipeline, getPipelineStatus, addProduct,
  type CompetitivePayload, type FeedItem, type PipelineStatus,
} from '../services/competitiveApi';

const fmtDur = (ms?: number | null) => (ms == null ? '—' : ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`);
import CompetitorDetail from '../components/competitive/CompetitorDetail';
import { DateRange, matchesRange, EMPTY_RANGE, type RangeValue } from '../components/competitive/DateRange';
import TrainingTab from '../components/competitive/TrainingTab';
import SourcesTab from '../components/competitive/SourcesTab';

type SignalMeta = { label: string; color: string; icon: React.ComponentType<{ size?: number }> };
const SIGNAL_META: Record<string, SignalMeta> = {
  new_product: { label: 'New Product', color: 'var(--accent-purple)', icon: Megaphone },
  new_feature: { label: 'New Feature', color: 'var(--accent-blue)', icon: Sparkles },
  update: { label: 'Update', color: 'var(--accent-green)', icon: Wrench },
  tangential: { label: 'Tangential', color: 'var(--accent-yellow)', icon: TrendingUp },
  irrelevant: { label: 'Irrelevant', color: 'var(--text-dim)', icon: CircleSlash },
};
const signalMeta = (s: string | null): SignalMeta => (s && SIGNAL_META[s]) || SIGNAL_META.new_feature;

const TABS = ['Feed', 'Companies', 'Categories', 'Training', 'Sources'] as const;
type Tab = (typeof TABS)[number];

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const cardStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px' };
const chipStyle: React.CSSProperties = { fontSize: '11px', color: 'var(--text-dim)', padding: '2px 8px', borderRadius: '999px', border: '1px solid var(--border)' };
const flagStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 999, fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#a371f7', background: 'rgba(163,113,247,0.12)', border: '1px solid rgba(163,113,247,0.35)' };
const selectStyle: React.CSSProperties = { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', fontSize: '12.5px', padding: '7px 10px', cursor: 'pointer', outline: 'none' };

function SignalBadge({ signalType }: { signalType: string | null }) {
  const meta = signalMeta(signalType);
  const Icon = meta.icon;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 9px', borderRadius: '999px', fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', background: `${meta.color}1a`, color: meta.color, border: `1px solid ${meta.color}40` }}>
      <Icon size={10} />{meta.label}
    </span>
  );
}
function RelevanceChip({ score }: { score: number | null }) {
  const s = score ?? 0;
  const color = s >= 85 ? 'var(--accent-green)' : s >= 70 ? 'var(--accent-yellow)' : 'var(--text-dim)';
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 600, color }} title="Relevance score"><span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block' }} />{s}% relevant</span>;
}

function FeedCard({ item, onTrackProduct }: { item: FeedItem; onTrackProduct?: (item: FeedItem) => Promise<void> }) {
  const accent = signalMeta(item.signalType).color;
  const [adding, setAdding] = useState(false);
  return (
    <div className="rounded-lg p-4 transition-colors duration-150" style={{ ...cardStyle, borderLeft: `3px solid ${accent}` }}>
      <div className="flex items-center flex-wrap gap-3" style={{ marginBottom: '10px' }}>
        <SignalBadge signalType={item.signalType} />
        {item.potentialNewProduct && (
          <span style={flagStyle} title={item.product ? `Possible new product: ${item.product}` : 'Possible new product — not in tracked catalog'}>
            <PackagePlus size={10} /> Potential new product
          </span>
        )}
        {item.potentialNewProduct && item.product && onTrackProduct && (
          <button
            disabled={adding}
            onClick={async () => { setAdding(true); try { await onTrackProduct(item); } finally { setAdding(false); } }}
            title={`Add "${item.product}" to ${item.competitor}'s tracked products`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'transparent', border: '1px solid #a371f7', color: '#a371f7', borderRadius: 6, fontSize: '10.5px', fontWeight: 700, padding: '3px 8px', cursor: adding ? 'default' : 'pointer', opacity: adding ? 0.6 : 1 }}
          >
            <Plus size={10} /> {adding ? 'Adding…' : `Add ${item.product}`}
          </button>
        )}
        <span style={{ color: 'var(--text)', fontSize: '12.5px', fontWeight: 600 }}>{item.competitor}</span>
        {item.category && <span style={chipStyle}>{item.category}</span>}
        <span style={{ color: 'var(--text-dim)', fontSize: '12px' }}>{fmtDate(item.date)}</span>
        <div className="flex-1" />
        <RelevanceChip score={item.relevanceScore} />
      </div>
      <a href={item.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-blue)', fontSize: '15px', fontWeight: 600, textDecoration: 'none' }}>{item.title || item.url}</a>
      {item.summary && <p style={{ color: 'var(--text-dim)', fontSize: '13px', lineHeight: 1.6, margin: '6px 0 0' }}>{item.summary}</p>}
      <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5" style={{ color: 'var(--text-dim)', fontSize: '12px', textDecoration: 'none', marginTop: '10px' }}><ExternalLink size={12} /> View source</a>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="flex flex-col">
      <span style={{ color: color ?? 'var(--text)', fontSize: '20px', fontWeight: 700, lineHeight: 1.1 }}>{value}</span>
      <span style={{ color: 'var(--text-dim)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
    </div>
  );
}

function ClickCard({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <div role="button" onClick={onClick} className="p-4 flex flex-col gap-3 transition-colors duration-150"
      style={{ ...cardStyle, cursor: 'pointer' }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent-blue)')}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}>
      {children}
    </div>
  );
}

export default function CompetitiveIntelligence() {
  const [tab, setTab] = useState<Tab>('Feed');
  const [data, setData] = useState<CompetitivePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<{ id: number | string; name: string } | null>(null);

  const [query, setQuery] = useState('');
  const [competitor, setCompetitor] = useState('all');
  const [category, setCategory] = useState('all');
  const [relevantOnly, setRelevantOnly] = useState(false);
  const [flag, setFlag] = useState('all'); // 'all' | 'newproduct'
  const [range, setRange] = useState<RangeValue>(EMPTY_RANGE);

  async function load(rebuild = false) {
    setLoading(true);
    if (rebuild) await triggerRefresh();   // rebuild the cache from the DB first
    setData(await getCompetitive());
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  // Pipeline (cron) run state + polling
  const [pipe, setPipe] = useState<PipelineStatus | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    getPipelineStatus().then(setPipe);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);
  async function runPipe() {
    if (pipe?.running) return;
    await runPipeline();
    setPipe((p) => ({ running: true, startedAt: new Date().toISOString(), elapsedMs: 0, last: p?.last ?? null }));
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const s = await getPipelineStatus();
      setPipe(s);
      if (!s.running) { if (pollRef.current) clearInterval(pollRef.current); pollRef.current = null; load(); }
    }, 2000);
  }

  async function trackProduct(item: FeedItem) {
    if (!item.product) return;
    await addProduct({ competitorId: item.competitorId, name: item.product, category: item.category });
    await load(); // the route rebuilt the cache; refetch clears the flag now that it's tracked
  }

  const feed = data?.feed ?? [];
  const companies = data?.companies ?? [];
  const categories = data?.categories ?? [];

  const competitorNames = useMemo(() => (companies.length ? companies.map((c) => c.name) : Array.from(new Set(feed.map((f) => f.competitor)))).sort(), [companies, feed]);
  const categoryNames = useMemo(() => (categories.length ? categories.map((c) => c.category) : Array.from(new Set(feed.map((f) => f.category).filter((c): c is string => !!c)))).sort(), [categories, feed]);

  const filtered = useMemo(() => {
    const qy = query.trim().toLowerCase();
    return feed.filter((f) => {
      if (competitor !== 'all' && f.competitor !== competitor) return false;
      if (category !== 'all' && f.category !== category) return false;
      if (relevantOnly && !f.relevant) return false;
      if (flag === 'newproduct' && !f.potentialNewProduct) return false;
      if (!matchesRange(f.date, range)) return false;
      if (qy && !`${f.title ?? ''} ${f.summary ?? ''} ${f.competitor}`.toLowerCase().includes(qy)) return false;
      return true;
    });
  }, [feed, query, competitor, category, relevantOnly, flag, range]);

  const drillToCategory = (cat: string) => { setCategory(cat); setCompetitor('all'); setRelevantOnly(true); setTab('Feed'); };

  return (
    <div className="flex flex-col gap-5 max-w-7xl mx-auto">
      {/* Tabs */}
      <div className="flex items-center gap-1" style={{ borderBottom: '1px solid var(--border)' }}>
        {TABS.map((t) => {
          const active = t === tab;
          return (
            <button key={t} onClick={() => { setSelected(null); setTab(t); }} style={{ background: 'transparent', border: 'none', borderBottom: active ? '2px solid var(--accent-blue)' : '2px solid transparent', color: active ? 'var(--text)' : 'var(--text-dim)', fontSize: '13px', fontWeight: active ? 600 : 400, padding: '10px 14px', cursor: 'pointer', marginBottom: '-1px' }}>{t}</button>
          );
        })}
      </div>

      {selected ? (
        <CompetitorDetail competitorId={selected.id} name={selected.name} onBack={() => setSelected(null)} />
      ) : (
      <>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2" style={{ color: 'var(--text)', fontSize: '22px', fontWeight: 700, margin: 0 }}>
            <Telescope size={20} color="var(--accent-blue)" /> Competitor Intelligence
          </h1>
          <p style={{ color: 'var(--text-dim)', fontSize: '13px', marginTop: '4px' }}>AI / Voice competitive signal{data?.generatedAt ? ` · updated ${fmtDate(data.generatedAt)}` : ''}</p>
        </div>
        <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
          <button className="flex items-center gap-2 rounded-md" title="Force a full competitor crawl + classify run (the cron job)"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: '13px', fontWeight: 600, padding: '8px 14px', cursor: pipe?.running ? 'default' : 'pointer', opacity: pipe?.running ? 0.7 : 1 }}
            onClick={() => !pipe?.running && runPipe()}>
            <Play size={14} />{pipe?.running ? `Running… ${fmtDur(pipe.elapsedMs)}` : `Run pipeline · last ${fmtDur(pipe?.last?.durationMs)}`}
          </button>
          <button className="flex items-center gap-2 rounded-md" style={{ background: 'var(--accent-blue)', border: 'none', color: '#fff', fontSize: '13px', fontWeight: 600, padding: '8px 14px', cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1 }} onClick={() => !loading && load(true)}>
            <RefreshCw size={14} />{loading ? 'Refreshing…' : 'Refresh data'}
          </button>
        </div>
      </div>

      {!loading && !data && (
        <div className="rounded-lg p-8 text-center" style={{ ...cardStyle, color: 'var(--text-dim)', fontSize: '13px' }}>Competitive Intelligence backend is unreachable. The refresh worker may not have run yet.</div>
      )}

      {data && tab === 'Feed' && (
        <>
          <div className="rounded-lg p-3 flex items-center flex-wrap gap-3" style={cardStyle}>
            <div className="flex items-center gap-2 flex-1 min-w-[220px]" style={{ ...selectStyle, cursor: 'text', padding: '0 10px' }}>
              <Search size={14} color="var(--text-dim)" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title, summary, content…" style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontSize: '12.5px', padding: '8px 0', width: '100%' }} />
            </div>
            <select style={selectStyle} value={competitor} onChange={(e) => setCompetitor(e.target.value)}><option value="all">All competitors</option>{competitorNames.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            <select style={selectStyle} value={category} onChange={(e) => setCategory(e.target.value)}><option value="all">All categories</option>{categoryNames.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            <select style={selectStyle} value={relevantOnly ? 'relevant' : 'all'} onChange={(e) => setRelevantOnly(e.target.value === 'relevant')}><option value="all">All updates</option><option value="relevant">Relevant only</option></select>
            <select style={selectStyle} value={flag} onChange={(e) => setFlag(e.target.value)}><option value="all">Any flag</option><option value="newproduct">Potential new products</option></select>
          </div>
          <div className="flex items-center flex-wrap gap-2">
            <span style={{ color: 'var(--text-dim)', fontSize: '12px' }}>Date range</span>
            <DateRange value={range} onChange={setRange} />
          </div>
          <div style={{ color: 'var(--text-dim)', fontSize: '12px' }}>{filtered.length} update{filtered.length === 1 ? '' : 's'}{filtered.length !== feed.length && <span> · filtered from {feed.length}</span>}</div>
          <div className="flex flex-col gap-3">
            {filtered.length === 0 ? <div className="rounded-lg p-8 text-center" style={{ ...cardStyle, color: 'var(--text-dim)', fontSize: '13px' }}>No updates match your filters.</div> : filtered.map((f) => <FeedCard key={f.id} item={f} onTrackProduct={trackProduct} />)}
          </div>
        </>
      )}

      {data && tab === 'Companies' && (
        <>
          <div className="flex items-center gap-2" style={{ color: 'var(--text-dim)', fontSize: '12px' }}><Building2 size={14} /> {companies.length} competitors tracked · click a card for signals + Telnyx map · reflects all signals currently in the Feed</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {companies.map((c) => (
              <ClickCard key={c.id} onClick={() => setSelected({ id: c.id, name: c.name })}>
                <div className="flex items-center justify-between">
                  <span style={{ color: 'var(--text)', fontSize: '15px', fontWeight: 700 }}>{c.name}</span>
                  <span className="flex items-center gap-1" style={{ color: 'var(--text-dim)', fontSize: '11px' }}>{fmtDate(c.lastActivity)} <ChevronRight size={14} /></span>
                </div>
                <div className="flex items-center gap-6">
                  <Stat label="Relevant" value={c.relevantCount} color="var(--accent-green)" />
                  <Stat label="Launches" value={c.launches} color="var(--accent-blue)" />
                  <Stat label="Tracked" value={c.totalPages} />
                </div>
                {c.categories.length > 0 && <div className="flex items-center flex-wrap gap-1.5">{c.categories.map((cat) => <span key={cat} style={chipStyle}>{cat}</span>)}</div>}
              </ClickCard>
            ))}
          </div>
        </>
      )}

      {data && tab === 'Categories' && (
        <>
          <div className="flex items-center gap-2" style={{ color: 'var(--text-dim)', fontSize: '12px' }}><Layers size={14} /> {categories.length} categories · click to drill into the feed · reflects all signals currently in the Feed</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {categories.map((c) => (
              <ClickCard key={c.category} onClick={() => drillToCategory(c.category)}>
                <div className="flex items-center justify-between">
                  <span style={{ color: 'var(--text)', fontSize: '15px', fontWeight: 700 }}>{c.category}</span>
                  <span className="flex items-center gap-1" style={{ color: 'var(--text-dim)', fontSize: '11px' }}>{c.competitorCount} competitors <ChevronRight size={14} /></span>
                </div>
                <div className="flex items-center gap-6">
                  <Stat label="Relevant" value={c.relevantCount} color="var(--accent-green)" />
                  <Stat label="Total" value={c.total} />
                </div>
                {c.competitors.length > 0 && <div className="flex items-center flex-wrap gap-1.5">{c.competitors.map((n) => <span key={n} style={chipStyle}>{n}</span>)}</div>}
              </ClickCard>
            ))}
          </div>
        </>
      )}

      {data && tab === 'Training' && <TrainingTab />}
      {data && tab === 'Sources' && <SourcesTab />}
      </>
      )}
    </div>
  );
}
