import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { CATEGORIES } from "../types";
import type { CompetitorOverview } from "../types";
import { ScoreBadge } from "./ScoreBadge";
import { CompetitorDetailDrawer } from "./CompetitorDetailDrawer";

/**
 * Competitors tab (PRD §5.2): per-competitor recent high-relevance activity, plus
 * the Telnyx offering map (inference-generated + editable; catalog seeded later).
 */
export function CompetitorsPage() {
  const overviewQuery = useQuery({
    queryKey: ["competitors-overview"],
    queryFn: () => api.competitorsOverview(70),
  });
  const [open, setOpen] = useState<{ id: number; name: string } | null>(null);

  const items = overviewQuery.data?.items ?? [];

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Competitors</h1>
          <span className="subtitle">Recent high-relevance activity · Telnyx offering map</span>
        </div>
      </header>

      {overviewQuery.isLoading && <div className="state">Loading…</div>}
      {overviewQuery.error && <div className="state">Failed to load. Is the API running?</div>}

      {items.map((c) => (
        <CompetitorOverviewCard
          key={c.id}
          competitor={c}
          onOpen={() => setOpen({ id: c.id, name: c.name })}
        />
      ))}

      <OfferingMap />

      {open && (
        <CompetitorDetailDrawer
          competitorId={open.id}
          name={open.name}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

function CompetitorOverviewCard({
  competitor: c,
  onOpen,
}: {
  competitor: CompetitorOverview;
  onOpen: () => void;
}) {
  return (
    <div className="competitor-card competitor-clickable">
      <button className="competitor-head competitor-open" onClick={onOpen}>
        <div className="competitor-title">
          <h3>{c.name}</h3>
          <span className="pill pill-on">{c.highRelevanceCount} high-signal</span>
          <span className="pill pill-off">{c.productCount} products</span>
        </div>
        <span className="competitor-open-hint">signals &amp; product map →</span>
      </button>

      {c.recent.length === 0 ? (
        <p className="muted">No high-relevance (score ≥ 70) updates yet.</p>
      ) : (
        <ul className="overview-list">
          {c.recent.map((r) => (
            <li key={r.id} className="overview-row">
              <ScoreBadge score={r.relevanceScore} signalType={r.signalType} />
              <a href={r.url} target="_blank" rel="noreferrer" className="overview-title">
                {r.title}
              </a>
              {r.product && <span className="muted">· {r.product}</span>}
            </li>
          ))}
        </ul>
      )}

      {c.products.length > 0 && (
        <div className="chip-row" style={{ marginTop: 10 }}>
          {c.products.map((p) => (
            <span key={p.name} className="chip">
              {p.name}
              {p.category ? <span className="muted"> · {p.category}</span> : null}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function OfferingMap() {
  const queryClient = useQueryClient();
  const offeringsQuery = useQuery({ queryKey: ["offerings"], queryFn: () => api.offerings() });
  const comparisonsQuery = useQuery({ queryKey: ["comparisons"], queryFn: () => api.comparisons() });

  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>(CATEGORIES[0]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["offerings"] });
  const add = useMutation({
    mutationFn: () => api.addOffering({ name: name.trim(), category }),
    onSuccess: () => {
      setName("");
      invalidate();
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.deleteOffering(id),
    onSuccess: invalidate,
  });

  const offerings = offeringsQuery.data?.items ?? [];
  const comparisons = comparisonsQuery.data?.items ?? [];

  return (
    <div className="competitor-card offering-map">
      <h3 style={{ marginTop: 0 }}>Telnyx offering map</h3>
      <p className="hint">
        Compares each competitor's products against Telnyx's offerings. Seed the Telnyx
        catalog below; inference-generated parity verdicts and the editable matrix land
        once the list is in place.
      </p>

      <form
        className="field-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) add.mutate();
        }}
      >
        <label className="grow">
          Telnyx offering
          <input value={name} placeholder="e.g. Voice API" onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <button className="primary-button" type="submit" disabled={add.isPending}>
          {add.isPending ? "Adding…" : "Add offering"}
        </button>
      </form>
      {add.error && <div className="form-error">{(add.error as Error).message}</div>}

      {offerings.length === 0 ? (
        <div className="state" style={{ padding: 20 }}>
          No Telnyx offerings yet — add the list above to enable the comparison map.
        </div>
      ) : (
        <ul className="guidance-list">
          {offerings.map((o) => (
            <li key={o.id} className="guidance-row">
              <span className="pill pill-off">{o.category ?? "—"}</span>
              <span className="guidance-text">{o.name}</span>
              <button className="source-remove" title="Remove" onClick={() => remove.mutate(o.id)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {comparisons.length > 0 && (
        <p className="muted" style={{ marginTop: 10 }}>
          {comparisons.length} comparison row(s) recorded.
        </p>
      )}
    </div>
  );
}
