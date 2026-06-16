import { useCallback, useEffect, useState } from 'react';
import { Plus, X, Trash2, ShieldCheck, Globe, Ban } from 'lucide-react';
import {
  getCompetitors, addSource, removeSource, removeIgnoredSubdomain, createRemovalRequest,
  createCompetitor, deleteCompetitor, getRemovalRequests, approveRemoval, rejectRemoval,
  type CompetitorHealth, type RemovalRequest,
} from '../../services/competitiveApi';
import SourceDetail from './SourceDetail';

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px' };
const inp: React.CSSProperties = { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', fontSize: '12px', padding: '5px 9px' };
const btn = (bg: string): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: '4px', background: bg, color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11.5px', fontWeight: 600, padding: '5px 9px', cursor: 'pointer' });
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—');

function CompetitorCard({ c, onChanged, onOpen }: { c: CompetitorHealth; onChanged: () => void; onOpen: () => void }) {
  const [src, setSrc] = useState('');
  const [sub, setSub] = useState('');
  return (
    <div className="p-4 flex flex-col gap-3" style={card}>
      <div className="flex items-center justify-between">
        <span style={{ color: 'var(--text)', fontSize: '15px', fontWeight: 700 }}>{c.name}</span>
        <div className="flex items-center gap-3" style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
          <span>{c.detectionMethod}</span><span>{c.totalPagesArchived} pages</span><span>checked {fmt(c.lastChecked)}</span>
          {c.snapshotAt && <span title="Last sitemap snapshot">snapshot {fmt(c.snapshotAt)}{c.snapshotUrls ? ` · ${c.snapshotUrls.toLocaleString()} links` : ''}</span>}
          <button title="View source detail" style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: '11px', cursor: 'pointer', padding: '3px 8px' }} onClick={onOpen}>Details</button>
          <button title="Delete competitor" style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}
            onClick={async () => {
              const r = await deleteCompetitor(c.id).catch(() => ({ conflict: false } as { error?: string; removedPages?: number }));
              if ((r as { error?: string }).error && window.confirm(`${c.name} has archived pages. Force delete?`)) { await deleteCompetitor(c.id, true); }
              onChanged();
            }}><Trash2 size={14} /></button>
        </div>
      </div>

      {/* Scrape success / failure */}
      {c.totalPagesArchived > 0 ? (
        <div className="flex items-center gap-2" style={{ fontSize: '11px' }}>
          <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'var(--border)', overflow: 'hidden', display: 'flex' }}>
            <div style={{ width: `${(c.scrapedOk / c.totalPagesArchived) * 100}%`, background: 'var(--accent-green)' }} />
            <div style={{ width: `${(c.scrapeFailed / c.totalPagesArchived) * 100}%`, background: '#c0392b' }} />
          </div>
          <span style={{ whiteSpace: 'nowrap' }}>
            <span style={{ color: 'var(--accent-green)' }}>{c.scrapedOk} scraped</span>
            <span style={{ color: 'var(--text-dim)' }}> · </span>
            <span style={{ color: c.scrapeFailed ? '#c0392b' : 'var(--text-dim)' }}>{c.scrapeFailed} failed</span>
          </span>
        </div>
      ) : (
        <span style={{ color: 'var(--text-dim)', fontSize: '11px' }}>No pages scraped yet</span>
      )}

      {/* Sources */}
      <div>
        <div className="flex items-center gap-1.5" style={{ color: 'var(--text-dim)', fontSize: '11px', marginBottom: '4px' }}><Globe size={12} /> Sources</div>
        <div className="flex flex-col gap-1">
          {c.sitemapUrls.map((u) => (
            <div key={u} className="flex items-center gap-2" style={{ fontSize: '12px' }}>
              <a href={u} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-blue)', textDecoration: 'none', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u}</a>
              <button style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }} onClick={async () => { await removeSource(c.id, u); onChanged(); }}><X size={13} /></button>
            </div>
          ))}
          {c.sitemapUrls.length === 0 && <span style={{ color: 'var(--text-dim)', fontSize: '12px' }}>No sources.</span>}
        </div>
        <div className="flex items-center gap-2" style={{ marginTop: '6px' }}>
          <input value={src} onChange={(e) => setSrc(e.target.value)} placeholder="https://competitor.com/sitemap.xml" style={{ ...inp, flex: 1 }} />
          <button style={btn('var(--accent-blue)')} disabled={!src.trim()} onClick={async () => { await addSource(c.id, src.trim()); setSrc(''); onChanged(); }}><Plus size={12} /> Add</button>
        </div>
      </div>

      {/* Ignored subdomains */}
      <div>
        <div className="flex items-center gap-1.5" style={{ color: 'var(--text-dim)', fontSize: '11px', marginBottom: '4px' }}><Ban size={12} /> Ignored subdomains</div>
        <div className="flex flex-wrap gap-1.5">
          {c.ignoredSubdomains.map((h) => (
            <span key={h} className="inline-flex items-center gap-1" style={{ fontSize: '11px', color: 'var(--text-dim)', border: '1px solid var(--border)', borderRadius: '999px', padding: '2px 8px' }}>
              {h}<button style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 0 }} onClick={async () => { await removeIgnoredSubdomain(c.id, h); onChanged(); }}><X size={11} /></button>
            </span>
          ))}
          {c.ignoredSubdomains.length === 0 && <span style={{ color: 'var(--text-dim)', fontSize: '12px' }}>None.</span>}
        </div>
        <div className="flex items-center gap-2" style={{ marginTop: '6px' }}>
          <input value={sub} onChange={(e) => setSub(e.target.value)} placeholder="community.competitor.com" style={{ ...inp, flex: 1 }} />
          <button style={btn('var(--accent-yellow)')} disabled={!sub.trim()}
            onClick={async () => { await createRemovalRequest({ competitorId: c.id, kind: 'subdomain', value: sub.trim(), requestedBy: 'operator' }); setSub(''); onChanged(); }}>
            Request ignore
          </button>
        </div>
        {c.excludePatterns.length > 0 && (
          <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-dim)' }}>Excluded endpoints: {c.excludePatterns.join(', ')}</div>
        )}
      </div>
    </div>
  );
}

export default function SourcesTab() {
  const [items, setItems] = useState<CompetitorHealth[]>([]);
  const [approvals, setApprovals] = useState<RemovalRequest[]>([]);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [selected, setSelected] = useState<{ id: number | string; name: string } | null>(null);

  const load = useCallback(async () => {
    const [c, a] = await Promise.all([getCompetitors(), getRemovalRequests('pending')]);
    setItems(c); setApprovals(a);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (selected) {
    return <SourceDetail id={selected.id} name={selected.name} onBack={() => { setSelected(null); load(); }} onChanged={load} />;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* How sources are monitored */}
      <div className="p-3" style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>How sources are monitored</div>
        <div className="flex flex-col gap-1.5" style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>
          <div><strong style={{ color: 'var(--accent-blue)' }}>lastmod</strong> — the sitemap timestamps each page, so we pull anything changed within the look-back window. Best for sites that publish <code>&lt;lastmod&gt;</code> dates (ElevenLabs, Twilio, Bland AI, Modal).</div>
          <div><strong style={{ color: 'var(--accent-green)' }}>snapshot diff</strong> — the sitemap has no dates, so we save a baseline of all URLs and flag only <em>newly-added</em> ones on the next run. Surfaces new pages going forward; it does not backfill the existing inventory.</div>
        </div>
      </div>

      {/* Approvals (removal requests land here) */}
      {approvals.length > 0 && (
        <div className="p-3" style={card}>
          <div className="flex items-center gap-2" style={{ marginBottom: '8px' }}><ShieldCheck size={14} color="var(--accent-yellow)" /><span style={{ color: 'var(--text)', fontSize: '13px', fontWeight: 700 }}>Pending approvals ({approvals.length})</span></div>
          <div className="flex flex-col gap-1.5">
            {approvals.map((r) => (
              <div key={r.id} className="flex items-center gap-2" style={{ fontSize: '12px' }}>
                <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase' }}>{r.kind}</span>
                <code style={{ color: 'var(--text)' }}>{r.value}</code><span style={{ color: 'var(--text-dim)' }}>· {r.competitor}</span>
                <div className="flex-1" />
                <button style={btn('#1e7e3e')} onClick={async () => { await approveRemoval(r.id, 'operator'); load(); }}>Approve</button>
                <button style={btn('#c0392b')} onClick={async () => { await rejectRemoval(r.id, 'operator'); load(); }}>Reject</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add competitor */}
      <div className="p-3 flex items-center flex-wrap gap-2" style={card}>
        <span style={{ color: 'var(--text)', fontSize: '13px', fontWeight: 700, marginRight: '4px' }}>Add competitor</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" style={{ ...inp, width: 160 }} />
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/sitemap.xml" style={{ ...inp, flex: 1, minWidth: 220 }} />
        <button style={btn('var(--accent-blue)')} disabled={!name.trim()}
          onClick={async () => { await createCompetitor({ name: name.trim(), sitemapUrls: url.trim() ? [url.trim()] : [] }); setName(''); setUrl(''); load(); }}>
          <Plus size={12} /> Add
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {items.map((c) => <CompetitorCard key={c.id} c={c} onChanged={load} onOpen={() => setSelected({ id: c.id, name: c.name })} />)}
      </div>
    </div>
  );
}
