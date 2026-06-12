import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { CATEGORIES, REASON_CATEGORIES } from "../types";
import type { FeedbackInput, Product, QueueItem } from "../types";
import { ScoreBadge } from "./ScoreBadge";
import { RemovalAction } from "./RemovalAction";
import { GuidancePanel } from "./GuidancePanel";
import { ApprovalsPanel } from "./ApprovalsPanel";

/**
 * Training / review page (docs/inference-training.md §6). Mirrors the Feed — the
 * full set of scored, relevant items (newest first, paginated) — so the operator
 * can review everything and establish a baseline, confirming or flagging with a
 * reason (immediate correction + recorded feedback). Items already reviewed are
 * marked.
 */
export function TrainingPage() {
  const [page, setPage] = useState(1);
  const queueQuery = useQuery({
    queryKey: ["queue", page],
    queryFn: () => api.queue({ page }),
  });
  const candidatesQuery = useQuery({
    queryKey: ["products", "candidate"],
    queryFn: () => api.products({ status: "candidate" }),
  });

  const data = queueQuery.data;
  const items = data?.items ?? [];
  const candidates = candidatesQuery.data?.items ?? [];
  const reviewedCount = items.filter((i) => i.reviewed).length;

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Training</h1>
          <span className="subtitle">
            Mirrors the feed · {data?.total ?? 0} relevant items · {candidates.length} candidate products
          </span>
        </div>
      </header>

      <ApprovalsPanel />
      <GuidancePanel />
      {candidates.length > 0 && <CandidateProducts products={candidates} />}

      {queueQuery.isLoading && <div className="state">Loading…</div>}
      {queueQuery.error && (
        <div className="state">Failed to load the review queue. Is the API running?</div>
      )}
      {!queueQuery.isLoading && items.length === 0 && (
        <div className="state">No items to review yet — run a refresh to populate.</div>
      )}

      {items.length > 0 && (
        <div className="result-meta">
          Page {data?.page} of {data?.totalPages} · {reviewedCount}/{items.length} reviewed on this page
        </div>
      )}

      {items.map((item) => (
        <QueueRow key={item.pageId} item={item} />
      ))}

      {data && data.totalPages > 1 && (
        <div className="pagination">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ← Prev
          </button>
          <span className="muted">
            {data.page} / {data.totalPages}
          </span>
          <button disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

type Panel = null | "flag" | "recat" | "product";

function QueueRow({ item }: { item: QueueItem }) {
  const queryClient = useQueryClient();
  const [panel, setPanel] = useState<Panel>(null);
  const [reasonCategory, setReasonCategory] = useState(REASON_CATEGORIES[0]);
  const [reason, setReason] = useState("");
  const [category, setCategory] = useState(item.category ?? CATEGORIES[0]);
  const [product, setProduct] = useState(item.product ?? "");
  const [done, setDone] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (body: FeedbackInput) => api.submitFeedback(item.pageId, body),
    onSuccess: (_res, body) => {
      setDone(body.action);
      setPanel(null);
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      queryClient.invalidateQueries({ queryKey: ["pages"] });
    },
  });

  if (done) {
    return (
      <div className="queue-row resolved">
        <ScoreBadge score={item.relevanceScore} signalType={item.signalType} />
        <span className="resolved-title">{item.title}</span>
        <span className="resolved-tag">{done.replace("_", " ")} ✓</span>
      </div>
    );
  }

  return (
    <div className="queue-row">
      <div className="queue-main">
        <div className="row">
          <ScoreBadge score={item.relevanceScore} signalType={item.signalType} />
          {item.category && (
            <span className="badge" style={{ background: item.categoryColor }}>
              {item.category}
            </span>
          )}
          <span className="competitor-name">{item.competitor.name}</span>
          {item.product && <span className="muted">· {item.product}</span>}
          {!item.relevant && <span className="muted">· not relevant</span>}
          {item.reviewed && <span className="pill pill-on">reviewed ✓</span>}
        </div>
        <h3 className="queue-title">
          <a href={item.url} target="_blank" rel="noreferrer">
            {item.title}
          </a>
        </h3>
        {item.reasoning && <p className="reasoning">{item.reasoning}</p>}
        <div className="queue-removal">
          <RemovalAction competitorId={item.competitor.id} url={item.url} pageId={item.pageId} />
        </div>
      </div>

      <div className="queue-actions">
        <button
          className="ghost-button"
          onClick={() => mutation.mutate({ action: "confirm" })}
          disabled={mutation.isPending}
        >
          Confirm
        </button>
        <button className="ghost-button" onClick={() => setPanel(panel === "flag" ? null : "flag")}>
          Flag irrelevant
        </button>
        <button className="ghost-button" onClick={() => setPanel(panel === "recat" ? null : "recat")}>
          Recategorize
        </button>
        <button className="ghost-button" onClick={() => setPanel(panel === "product" ? null : "product")}>
          Fix product
        </button>
      </div>

      {panel === "flag" && (
        <div className="action-panel">
          <label>
            Reason
            <select value={reasonCategory} onChange={(e) => setReasonCategory(e.target.value as typeof reasonCategory)}>
              {REASON_CATEGORIES.map((r) => (
                <option key={r} value={r}>{r.replace(/_/g, " ")}</option>
              ))}
            </select>
          </label>
          <input
            value={reason}
            placeholder="Optional note (why this is irrelevant)"
            onChange={(e) => setReason(e.target.value)}
          />
          <button
            className="danger-button"
            disabled={mutation.isPending}
            onClick={() =>
              mutation.mutate({ action: "flag_irrelevant", reasonCategory, reason: reason || undefined })
            }
          >
            Flag
          </button>
        </div>
      )}

      {panel === "recat" && (
        <div className="action-panel">
          <label>
            Category
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <button
            className="ghost-button"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({ action: "recategorize", category })}
          >
            Save category
          </button>
        </div>
      )}

      {panel === "product" && (
        <div className="action-panel">
          <input
            value={product}
            placeholder="Correct product name"
            onChange={(e) => setProduct(e.target.value)}
          />
          <button
            className="ghost-button"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({ action: "reassign_product", product })}
          >
            Save product
          </button>
        </div>
      )}

      {mutation.error && <div className="form-error">{(mutation.error as Error).message}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------

function CandidateProducts({ products }: { products: Product[] }) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["products", "candidate"] });
    queryClient.invalidateQueries({ queryKey: ["queue"] });
  };

  const confirm = useMutation({
    mutationFn: (p: Product) =>
      api.updateProduct(p.id, { status: "active", category: p.category ?? undefined }),
    onSuccess: invalidate,
  });
  const reject = useMutation({
    mutationFn: (p: Product) => api.deleteProduct(p.id),
    onSuccess: invalidate,
  });

  return (
    <div className="competitor-card">
      <h3 style={{ marginTop: 0 }}>Candidate products ({products.length})</h3>
      <p className="hint">
        New product names the classifier surfaced. Confirm to add to the registry (locks
        future categorization) or reject.
      </p>
      {products.map((p) => (
        <div key={p.id} className="candidate-row">
          <div>
            <strong>{p.name}</strong>
            <span className="muted"> · {p.competitor.name}</span>
            {p.category && <span className="muted"> · {p.category}</span>}
          </div>
          <div className="queue-actions">
            <button className="ghost-button" onClick={() => confirm.mutate(p)} disabled={confirm.isPending}>
              Confirm
            </button>
            <button className="danger-button" onClick={() => reject.mutate(p)} disabled={reject.isPending}>
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
