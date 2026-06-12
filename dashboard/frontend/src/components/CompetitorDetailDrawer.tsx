import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { CATEGORIES, CATEGORY_COLORS } from "../types";
import { ScoreBadge } from "./ScoreBadge";

interface Props {
  competitorId: number;
  name: string;
  onClose: () => void;
}

/**
 * Competitor detail: a fuller look at the competitor's signals (scored pages)
 * plus a graphical product map comparing their product set to Telnyx's, category
 * by category (PRD §5.2). Composed from /api/pages, /api/products, /api/offerings.
 */
export function CompetitorDetailDrawer({ competitorId, name, onClose }: Props) {
  const signalsQuery = useQuery({
    queryKey: ["competitor-signals", name],
    queryFn: () => api.pages({ competitor: name, relevant: "all", page: 1 }),
  });
  const productsQuery = useQuery({
    queryKey: ["competitor-products", competitorId],
    queryFn: () => api.products({ competitor: String(competitorId), status: "active" }),
  });
  const offeringsQuery = useQuery({ queryKey: ["offerings"], queryFn: () => api.offerings() });

  const signals = signalsQuery.data?.items ?? [];
  const products = productsQuery.data?.items ?? [];
  const offerings = offeringsQuery.data?.items ?? [];

  // Group both sides by category, then build the comparison rows in canonical order.
  const rows = useMemo(() => {
    const compBy = new Map<string, string[]>();
    for (const p of products) {
      const c = p.category ?? "Other";
      compBy.set(c, [...(compBy.get(c) ?? []), p.name]);
    }
    const telBy = new Map<string, string[]>();
    for (const o of offerings) {
      const c = o.category ?? "Other";
      telBy.set(c, [...(telBy.get(c) ?? []), o.name]);
    }
    const present = CATEGORIES.filter((c) => compBy.has(c) || telBy.has(c));
    return present.map((cat) => {
      const comp = compBy.get(cat) ?? [];
      const tel = telBy.get(cat) ?? [];
      const coverage = comp.length && tel.length ? "both" : comp.length ? "competitor" : "telnyx";
      return { cat, comp, tel, coverage };
    });
  }, [products, offerings]);

  const maxSide = Math.max(1, ...rows.map((r) => Math.max(r.comp.length, r.tel.length)));

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer drawer-wide" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label="Close">×</button>

        <h2>{name}</h2>
        <p className="muted">
          {signals.length} signals shown · {products.length} known products
        </p>

        {/* ---- Product map vs Telnyx ---- */}
        <h3 style={{ fontSize: 15, marginTop: 18 }}>Product map vs Telnyx</h3>
        <p className="hint">
          Competitor's product set (left) against Telnyx's offerings (right), by category.
        </p>
        {rows.length === 0 ? (
          <div className="muted">No products mapped yet.</div>
        ) : (
          <div className="map-grid">
            <div className="map-head">
              <span>Category</span>
              <span>{name}</span>
              <span>Telnyx</span>
            </div>
            {rows.map((r) => {
              const color = CATEGORY_COLORS[r.cat] ?? "#7f8c8d";
              return (
                <div key={r.cat} className="map-row">
                  <span className="map-cat" style={{ borderColor: color, color }}>
                    {r.cat}
                  </span>
                  <div className="map-side">
                    <div className="map-bar" style={{ width: `${(r.comp.length / maxSide) * 100}%`, background: color, opacity: r.comp.length ? 1 : 0.12 }} />
                    <div className="map-chips">
                      {r.comp.length ? r.comp.map((p) => <span key={p} className="chip">{p}</span>) : <span className="muted">—</span>}
                    </div>
                  </div>
                  <div className="map-side">
                    <div className="map-bar telnyx" style={{ width: `${(r.tel.length / maxSide) * 100}%`, opacity: r.tel.length ? 1 : 0.12 }} />
                    <div className="map-chips">
                      {r.tel.length ? r.tel.map((p) => <span key={p} className="chip telnyx-chip">{p}</span>) : <span className="muted">—</span>}
                    </div>
                  </div>
                  <span className={`map-cover cover-${r.coverage}`}>
                    {r.coverage === "both" ? "head-to-head" : r.coverage === "competitor" ? "competitor only" : "Telnyx only"}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* ---- Signals ---- */}
        <h3 style={{ fontSize: 15, marginTop: 22 }}>Signals</h3>
        {signalsQuery.isLoading && <div className="muted">Loading…</div>}
        {signals.length === 0 && !signalsQuery.isLoading && (
          <div className="muted">No signals captured yet — run a refresh to populate.</div>
        )}
        <ul className="overview-list">
          {signals.map((s) => (
            <li key={s.id} className="overview-row">
              <ScoreBadge score={s.relevanceScore} signalType={s.signalType} />
              {s.category && (
                <span className="badge" style={{ background: s.categoryColor }}>{s.category}</span>
              )}
              <a href={s.url} target="_blank" rel="noreferrer" className="overview-title">{s.title}</a>
              {s.product && <span className="muted">· {s.product}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
