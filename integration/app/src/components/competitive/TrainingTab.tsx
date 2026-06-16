import { useCallback, useEffect, useState } from 'react';
import { Check, Flag, Tag, RefreshCw, Trash2, Plus, ShieldCheck, ChevronDown, ChevronUp } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import {
  getQueue, postFeedback, getGuidance, createGuidance, deleteGuidance,
  getRemovalRequests, approveRemoval, rejectRemoval,
  getRuns, CATEGORY_COLORS, type QueueItem, type GuidanceItem, type RemovalRequest, type Run,
} from '../../services/competitiveApi';

const CATEGORIES = ['AI Assistants', 'Inference', 'STT', 'TTS', 'Voice', 'Messaging', 'Numbers', 'Identity', 'Fax', 'IoT', 'Networking', 'Storage', 'Other'];
const REASONS = ['marketing', 'customer_story', 'careers_or_legal', 'wrong_subdomain', 'duplicate', 'wrong_product', 'wrong_category', 'not_a_release', 'other'];
const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px' };
const sel: React.CSSProperties = { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', fontSize: '12px', padding: '4px 8px' };
const btn = (bg: string): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: '4px', background: bg, color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11.5px', fontWeight: 600, padding: '5px 9px', cursor: 'pointer' });
const colorFor = (c: string | null) => (c && CATEGORY_COLORS[c]) || '#7f8c8d';

function QueueRow({ item, onChanged }: { item: QueueItem; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);
  const [cat, setCat] = useState(item.category || CATEGORIES[0]);
  const act = async (body: Record<string, unknown>) => {
    setBusy(true);
    try { await postFeedback(item.pageId, body); onChanged(); } finally { setBusy(false); }
  };
  return (
    <div className="p-3" style={{ ...card, opacity: busy ? 0.6 : 1, borderLeft: item.reviewed ? '3px solid var(--accent-green)' : `3px solid ${colorFor(item.category)}` }}>
      <div className="flex items-center flex-wrap gap-2" style={{ marginBottom: '6px' }}>
        <span style={{ color: 'var(--text)', fontSize: '12px', fontWeight: 600 }}>{item.competitor}</span>
        {item.category && <span style={{ fontSize: '11px', color: colorFor(item.category) }}>{item.category}</span>}
        {item.signalType && <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>· {item.signalType.replace('_', ' ')}</span>}
        <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>· {item.relevanceScore ?? 0}%</span>
        <div className="flex-1" />
        {item.reviewed && <span style={{ fontSize: '10.5px', color: 'var(--accent-green)', fontWeight: 700 }}>REVIEWED</span>}
      </div>
      <a href={item.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-blue)', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}>{item.title || item.url}</a>
      {item.summary && <p style={{ color: 'var(--text-dim)', fontSize: '12px', lineHeight: 1.5, margin: '4px 0 8px' }}>{item.summary}</p>}
      <div className="flex items-center flex-wrap gap-2" style={{ marginTop: '6px' }}>
        <button disabled={busy} style={btn('#1e7e3e')} onClick={() => act({ action: 'confirm', operator: 'operator' })}><Check size={12} /> Confirm</button>
        <span className="inline-flex items-center gap-1">
          <select value={reason} onChange={(e) => setReason(e.target.value)} style={sel}>{REASONS.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}</select>
          <button disabled={busy} style={btn('#c0392b')} onClick={() => act({ action: 'flag_irrelevant', reasonCategory: reason, operator: 'operator' })}><Flag size={12} /> Flag</button>
        </span>
        <span className="inline-flex items-center gap-1">
          <select value={cat} onChange={(e) => setCat(e.target.value)} style={sel}>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
          <button disabled={busy} style={btn('#2980b9')} onClick={() => act({ action: 'recategorize', category: cat, operator: 'operator' })}><Tag size={12} /> Recategorize</button>
        </span>
      </div>
    </div>
  );
}

export default function TrainingTab() {
  const [q, setQ] = useState<{ items: QueueItem[]; total: number; totalPages: number; threshold: number }>({ items: [], total: 0, totalPages: 1, threshold: 40 });
  const [page, setPage] = useState(1);
  const [relevant, setRelevant] = useState('all');
  const [guidance, setGuidance] = useState<GuidanceItem[]>([]);
  const [approvals, setApprovals] = useState<RemovalRequest[]>([]);
  const [newGuidance, setNewGuidance] = useState('');
  const [runs, setRuns] = useState<Run[]>([]);
  const [graphOpen, setGraphOpen] = useState(true);
  const [timeGraphOpen, setTimeGraphOpen] = useState(true);

  const loadAll = useCallback(async () => {
    const [qr, g, a, r] = await Promise.all([
      getQueue({ relevant, page, pageSize: 25 }), getGuidance(), getRemovalRequests('pending'), getRuns(),
    ]);
    setQ(qr); setGuidance(g); setApprovals(a); setRuns(r);
  }, [relevant, page]);
  useEffect(() => { loadAll(); }, [loadAll]);

  const chartData = runs.map((r) => ({
    label: new Date(r.startedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric' }),
    pages: r.pages, relevant: r.relevant,
  }));
  const timeData = runs.map((r) => ({
    label: new Date(r.startedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric' }),
    seconds: r.durationMs != null ? +(r.durationMs / 1000).toFixed(1) : null,
  }));
  const haveDurations = runs.some((r) => r.durationMs != null);

  return (
    <div className="flex flex-col gap-4">
      {/* Pulls over time (collapsible) */}
      <div className="p-3" style={card}>
        <button onClick={() => setGraphOpen((o) => !o)} className="flex items-center gap-2"
          style={{ background: 'transparent', border: 'none', color: 'var(--text)', cursor: 'pointer', fontSize: '13px', fontWeight: 700, padding: 0 }}>
          {graphOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />} Pulls over time
          <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>({runs.length} runs)</span>
        </button>
        {graphOpen && (chartData.length ? (
          <div style={{ height: 220, marginTop: 10 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 6, right: 12, left: -12, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fill: 'var(--text-dim)', fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fill: 'var(--text-dim)', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="pages" name="New pages" fill="#58a6ff" radius={[3, 3, 0, 0]} />
                <Bar dataKey="relevant" name="Relevant" fill="#3fb950" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : <div style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 8 }}>No runs yet.</div>)}
      </div>

      {/* Pipeline run time (collapsible) */}
      <div className="p-3" style={card}>
        <button onClick={() => setTimeGraphOpen((o) => !o)} className="flex items-center gap-2"
          style={{ background: 'transparent', border: 'none', color: 'var(--text)', cursor: 'pointer', fontSize: '13px', fontWeight: 700, padding: 0 }}>
          {timeGraphOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />} Pipeline run time
          <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(seconds per run)</span>
        </button>
        {timeGraphOpen && (haveDurations ? (
          <div style={{ height: 200, marginTop: 10 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timeData} margin={{ top: 6, right: 12, left: -12, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fill: 'var(--text-dim)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'var(--text-dim)', fontSize: 11 }} unit="s" />
                <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                <Line type="monotone" dataKey="seconds" name="Run time (s)" stroke="#d29922" strokeWidth={2} dot={{ r: 4, fill: '#d29922' }} activeDot={{ r: 6 }} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : <div style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 8 }}>No timed runs yet — trigger a run to record its duration.</div>)}
      </div>

      {/* Approvals */}
      <div className="p-3" style={card}>
        <div className="flex items-center gap-2" style={{ marginBottom: '8px' }}><ShieldCheck size={14} color="var(--accent-yellow)" /><span style={{ color: 'var(--text)', fontSize: '13px', fontWeight: 700 }}>Pending approvals ({approvals.length})</span></div>
        {approvals.length === 0 ? <span style={{ color: 'var(--text-dim)', fontSize: '12px' }}>No pending removal requests.</span> : (
          <div className="flex flex-col gap-1.5">
            {approvals.map((r) => (
              <div key={r.id} className="flex items-center gap-2" style={{ fontSize: '12px' }}>
                <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase' }}>{r.kind}</span>
                <code style={{ color: 'var(--text)', fontSize: '12px' }}>{r.value}</code>
                <span style={{ color: 'var(--text-dim)' }}>· {r.competitor}</span>
                <div className="flex-1" />
                <button style={btn('#1e7e3e')} onClick={async () => { await approveRemoval(r.id, 'operator'); loadAll(); }}>Approve</button>
                <button style={btn('#c0392b')} onClick={async () => { await rejectRemoval(r.id, 'operator'); loadAll(); }}>Reject</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Guidance */}
      <div className="p-3" style={card}>
        <span style={{ color: 'var(--text)', fontSize: '13px', fontWeight: 700 }}>Operator guidance</span>
        <div className="flex items-center gap-2" style={{ margin: '8px 0' }}>
          <input value={newGuidance} onChange={(e) => setNewGuidance(e.target.value)} placeholder="Add global guidance for the classifier…" style={{ ...sel, flex: 1 }} />
          <button style={btn('var(--accent-blue)')} disabled={!newGuidance.trim()} onClick={async () => { await createGuidance({ text: newGuidance.trim(), operator: 'operator' }); setNewGuidance(''); loadAll(); }}><Plus size={12} /> Add</button>
        </div>
        <div className="flex flex-col gap-1">
          {guidance.map((g) => (
            <div key={g.id} className="flex items-center gap-2" style={{ fontSize: '12px' }}>
              <span style={{ fontSize: '10.5px', color: 'var(--text-dim)', fontWeight: 700 }}>{g.scope}</span>
              <span style={{ color: 'var(--text)' }}>{g.text}</span>
              <div className="flex-1" />
              <button style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }} onClick={async () => { await deleteGuidance(g.id); loadAll(); }}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      </div>

      {/* Queue */}
      <div className="flex items-center gap-3">
        <span style={{ color: 'var(--text)', fontSize: '13px', fontWeight: 700 }}>Review queue</span>
        <select value={relevant} onChange={(e) => { setPage(1); setRelevant(e.target.value); }} style={sel}>
          <option value="all">All</option><option value="true">Relevant</option><option value="false">Not relevant</option>
        </select>
        <span style={{ color: 'var(--text-dim)', fontSize: '12px' }}>{q.total} items · threshold {q.threshold} · reflects all signals currently in the Feed</span>
        <div className="flex-1" />
        <button style={{ ...sel, cursor: 'pointer' }} onClick={loadAll}><RefreshCw size={12} /></button>
      </div>
      <div className="flex flex-col gap-2">
        {q.items.map((it) => <QueueRow key={it.pageId} item={it} onChanged={loadAll} />)}
      </div>
      {q.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3" style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
          <button disabled={page <= 1} style={{ ...sel, cursor: 'pointer' }} onClick={() => setPage((p) => p - 1)}>Prev</button>
          <span>Page {page} / {q.totalPages}</span>
          <button disabled={page >= q.totalPages} style={{ ...sel, cursor: 'pointer' }} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
