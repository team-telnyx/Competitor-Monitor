import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { CATEGORIES, CATEGORY_COLORS } from "../types";
import { PageCard } from "./PageCard";
import { PageDetailDrawer } from "./PageDetailDrawer";

/**
 * Categories tab (PRD §5.3): pick a category and see its feed across all
 * competitors plus a volume trend over time. Reuses /api/pages and
 * /api/analytics/activity.
 */
export function CategoriesPage() {
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [openId, setOpenId] = useState<number | null>(null);

  const activityQuery = useQuery({ queryKey: ["activity"], queryFn: () => api.activity({}) });
  const pagesQuery = useQuery({
    queryKey: ["pages", { category, relevant: "true" }],
    queryFn: () => api.pages({ category, relevant: "true", page: 1 }),
  });

  const color = CATEGORY_COLORS[category] ?? "#7f8c8d";

  // Per-category trend extracted from the activity series.
  const trend = useMemo(() => {
    const series = activityQuery.data?.series ?? [];
    return series.map((b) => ({ date: b.date, count: b.byCategory[category] ?? 0 }));
  }, [activityQuery.data, category]);
  const maxCount = Math.max(1, ...trend.map((t) => t.count));
  const totalForCategory = trend.reduce((n, t) => n + t.count, 0);

  const data = pagesQuery.data;

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Categories</h1>
          <span className="subtitle">Browse and trend updates by focus area</span>
        </div>
      </header>

      <div className="category-tabs">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            className={`category-tab ${c === category ? "active" : ""}`}
            style={c === category ? { background: CATEGORY_COLORS[c], borderColor: CATEGORY_COLORS[c] } : undefined}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="competitor-card">
        <div className="trend-head">
          <strong>{category}</strong>
          <span className="muted">{totalForCategory} relevant updates over time</span>
        </div>
        {trend.length === 0 ? (
          <div className="muted">No trend data yet.</div>
        ) : (
          <div className="trend-bars">
            {trend.map((t) => (
              <div key={t.date} className="trend-col" title={`${t.date}: ${t.count}`}>
                <div
                  className="trend-bar"
                  style={{ height: `${(t.count / maxCount) * 100}%`, background: color }}
                />
                <span className="trend-label">{t.date.slice(5)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {pagesQuery.isLoading && <div className="state">Loading…</div>}
      {data && (
        <>
          <div className="result-meta">
            {data.total} {data.total === 1 ? "update" : "updates"} in {category}
          </div>
          {data.items.length === 0 && <div className="state">No updates in this category yet.</div>}
          {data.items.map((item) => (
            <PageCard key={item.id} item={item} onOpen={setOpenId} />
          ))}
        </>
      )}

      {openId !== null && <PageDetailDrawer pageId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
