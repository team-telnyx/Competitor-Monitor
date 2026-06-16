import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ChevronRight, ChevronDown, Ban, CheckCircle2, XCircle, AlertTriangle, ExternalLink, Clock, RotateCcw } from 'lucide-react';
import { getSourceDetail, updateCompetitor, createRemovalRequest, approveRemoval, rejectRemoval, type SourceDetail as Detail } from '../../services/competitiveApi';

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px' };
const btn = (bg: string): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: '4px', background: bg, color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 600, padding: '4px 8px', cursor: 'pointer' });
const n = (x: number | null | undefined) => (x == null ? '—' : x.toLocaleString());

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col" style={{ minWidth: 90 }}>
      <span style={{ color: color ?? 'var(--text)', fontSize: '20px', fontWeight: 700, lineHeight: 1.1 }}>{value}</span>
      <span style={{ color: 'var(--text-dim)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
    </div>
  );
}

export default function SourceDetail({ id, name, onBack, onChanged }: { id: number | string; name: string; onBack: () => void; onChanged?: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showFailures, setShowFailures] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setD(await getSourceDetail(id));
    setLoading(false);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const excluded = new Set(d?.competitor.excludePatterns ?? []);
  const pending = new Set((d?.pendingRemovals ?? []).map((r) => r.value));

  async function act(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    try { await fn(); await load(); onChanged?.(); } finally { setBusy(false); }
  }
  // Request removal (approval-gated) rather than excluding directly.
  const requestCull = (path: string) =>
    act(() => createRemovalRequest({ competitorId: id, kind: 'endpoint', value: path, requestedBy: 'operator' }));
  // Re-add (un-exclude) is immediate — lower risk than removing.
  const readd = (pattern: string) =>
    act(() => updateCompetitor(id, { excludePatterns: (d?.competitor.excludePatterns ?? []).filter((p) => p !== pattern) }));

  const inv = d?.inventory ?? null;
  const sc = d?.scrape;
  const failedTotal = sc ? sc.errored + sc.empty : 0;

  const cullBtn = (path: string) => (
    excluded.has(path)
      ? <span style={{ fontSize: '10.5px', color: 'var(--text-dim)', fontWeight: 700 }}>EXCLUDED</span>
      : pending.has(path)
        ? <span className="inline-flex items-center gap-1" style={{ fontSize: '10.5px', color: 'var(--accent-yellow)', fontWeight: 700 }}><Clock size={11} /> PENDING</span>
        : <button disabled={busy} style={btn('#c0392b')} onClick={() => requestCull(path)}><Ban size={11} /> Remove</button>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="inline-flex items-center gap-1.5" style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-dim)', fontSize: '12.5px', padding: '6px 10px', cursor: 'pointer' }}><ArrowLeft size={14} /> Sources</button>
        <h1 style={{ color: 'var(--text)', fontSize: '20px', fontWeight: 700, margin: 0 }}>{name}</h1>
        <span style={{ color: 'var(--text-dim)', fontSize: '12px' }}>source detail</span>
      </div>

      {loading && <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>}

      {d && (
        <>
          {/* Summary */}
          <div className="p-4 flex items-center flex-wrap gap-8" style={card}>
            <Stat label="Total links" value={n(inv?.totalUrls ?? d.totalSitemapUrls)} />
            <Stat label="In consideration" value={n(inv?.consideredUrls)} color="var(--accent-blue)" />
            <Stat label="Base endpoints" value={n(inv?.totalBases)} />
            <Stat label="Detected pages" value={n(sc?.total)} />
            <Stat label="Scraped" value={n(sc?.scraped)} color="var(--accent-green)" />
            <Stat label="Failed" value={n(failedTotal)} color={failedTotal ? '#c0392b' : undefined} />
          </div>

          {/* Scrape success / failure */}
          {sc && (
            <div className="p-4 flex flex-col gap-3" style={card}>
              <div className="flex items-center flex-wrap gap-5" style={{ fontSize: 13 }}>
                <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--accent-green)' }}><CheckCircle2 size={14} /> {n(sc.scraped)} scraped</span>
                <span className="inline-flex items-center gap-1.5" style={{ color: '#c0392b' }}><XCircle size={14} /> {n(sc.errored)} errored</span>
                <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--text-dim)' }}><AlertTriangle size={14} /> {n(sc.empty)} no content</span>
                {failedTotal > 0 && (
                  <button onClick={() => setShowFailures((s) => !s)} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 12, padding: '4px 8px', cursor: 'pointer' }}>
                    {showFailures ? 'Hide' : 'View'} failures ({failedTotal})
                  </button>
                )}
              </div>
              {showFailures && (
                <div className="flex flex-col gap-1" style={{ maxHeight: 260, overflowY: 'auto' }}>
                  {sc.failures.map((f) => (
                    <div key={f.url} className="flex items-center gap-2" style={{ fontSize: 12, borderBottom: '1px solid var(--border)', padding: '4px 0' }}>
                      <a href={f.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1" style={{ color: 'var(--accent-blue)', textDecoration: 'none', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.url} <ExternalLink size={10} /></a>
                      <span style={{ color: '#c0392b', whiteSpace: 'nowrap' }}>{f.reason}</span>
                    </div>
                  ))}
                  {sc.failures.length === 0 && <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>None.</span>}
                </div>
              )}
              <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>A fallback scraper for failed pages is planned; for now these are surfaced with their reason.</span>
            </div>
          )}

          {/* Pending removals (awaiting approval) */}
          {d.pendingRemovals.length > 0 && (
            <div className="p-4 flex flex-col gap-2" style={card}>
              <span style={{ color: 'var(--text)', fontSize: 13, fontWeight: 700 }}>Pending removals ({d.pendingRemovals.length})</span>
              {d.pendingRemovals.map((r) => (
                <div key={r.id} className="flex items-center gap-2" style={{ fontSize: 12.5 }}>
                  <Clock size={13} color="var(--accent-yellow)" />
                  <code style={{ color: 'var(--text)' }}>{r.value}</code>
                  <div className="flex-1" />
                  <button disabled={busy} style={btn('#1e7e3e')} onClick={() => act(() => approveRemoval(r.id, 'operator'))}>Approve</button>
                  <button disabled={busy} style={btn('#7f8c8d')} onClick={() => act(() => rejectRemoval(r.id, 'operator'))}>Reject</button>
                </div>
              ))}
            </div>
          )}

          {/* Removed endpoints (excluded) with re-add */}
          {d.competitor.excludePatterns.length > 0 && (
            <div className="p-4 flex flex-col gap-2" style={card}>
              <span style={{ color: 'var(--text)', fontSize: 13, fontWeight: 700 }}>Removed endpoints ({d.competitor.excludePatterns.length})</span>
              <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>Excluded from future pulls. Re-add to bring back into consideration.</span>
              {d.competitor.excludePatterns.map((p) => (
                <div key={p} className="flex items-center gap-2" style={{ fontSize: 12.5 }}>
                  <Ban size={13} color="#c0392b" />
                  <code style={{ color: 'var(--text-dim)', textDecoration: 'line-through' }}>{p}</code>
                  <div className="flex-1" />
                  <button disabled={busy} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11, fontWeight: 600, padding: '4px 8px', cursor: 'pointer' }} onClick={() => readd(p)}>
                    <RotateCcw size={11} /> Re-add
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Endpoint inventory */}
          <div className="p-4 flex flex-col gap-2" style={card}>
            <div className="flex items-center justify-between flex-wrap gap-1">
              <span style={{ color: 'var(--text)', fontSize: 13, fontWeight: 700 }}>Sitemap skeleton — endpoints in consideration</span>
              {inv && (
                <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                  {n(inv.consideredUrls)} of {n(inv.totalUrls)} links · {n(inv.totalBases)} base endpoints
                  {inv.savedAt ? ` · snapshot ${new Date(inv.savedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''}
                </span>
              )}
            </div>
            {!inv && (
              <span style={{ color: 'var(--text-dim)', fontSize: 12.5 }}>
                Full URL inventory not captured for this source (lastmod-based detection). Tracking {n(d.totalSitemapUrls)} sitemap links; per-endpoint breakdown appears once a snapshot is taken.
              </span>
            )}
            {inv && inv.bases.map((b) => {
              const open = expanded === b.path;
              return (
                <div key={b.path} style={{ borderTop: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-2" style={{ padding: '7px 0', fontSize: 13 }}>
                    {b.childCount ? (
                      <button onClick={() => setExpanded(open ? null : b.path)} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 0 }}>
                        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    ) : <span style={{ width: 14, display: 'inline-block' }} />}
                    <code style={{ color: excluded.has(b.path) ? 'var(--text-dim)' : 'var(--text)', textDecoration: excluded.has(b.path) ? 'line-through' : 'none' }}>{b.path}</code>
                    <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                      {n(b.considered)}{b.considered !== b.total ? ` / ${n(b.total)}` : ''} links{b.childCount ? ` · ${b.childCount} sub` : ''}
                    </span>
                    <div className="flex-1" />
                    {cullBtn(b.path)}
                  </div>
                  {open && b.children && (
                    <div className="flex flex-col" style={{ paddingLeft: 24 }}>
                      {b.children.map((ch) => (
                        <div key={ch.path} className="flex items-center gap-2" style={{ padding: '5px 0', fontSize: 12.5, borderTop: '1px solid var(--border)' }}>
                          <code style={{ color: excluded.has(ch.path) ? 'var(--text-dim)' : 'var(--text)', textDecoration: excluded.has(ch.path) ? 'line-through' : 'none' }}>{ch.path}</code>
                          <span style={{ color: 'var(--text-dim)' }}>{n(ch.considered)}{ch.considered !== ch.total ? ` / ${n(ch.total)}` : ''} links</span>
                          <div className="flex-1" />
                          {cullBtn(ch.path)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {inv && inv.otherBases > 0 && (
              <span style={{ color: 'var(--text-dim)', fontSize: 12, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                + {n(inv.otherBases)} more base endpoints ({n(inv.otherUrls)} links) not shown
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
