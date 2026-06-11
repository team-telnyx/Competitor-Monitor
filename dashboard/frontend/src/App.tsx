import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type { Filters } from "./types";
import { FiltersBar } from "./components/Filters";
import { PageCard } from "./components/PageCard";
import { PageDetailDrawer } from "./components/PageDetailDrawer";

export function App() {
  const [filters, setFilters] = useState<Filters>({ relevant: "true", page: 1 });
  const [openId, setOpenId] = useState<number | null>(null);

  const competitorsQuery = useQuery({
    queryKey: ["competitors"],
    queryFn: api.competitors,
  });

  const pagesQuery = useQuery({
    queryKey: ["pages", filters],
    queryFn: () => api.pages(filters),
  });

  const page = filters.page ?? 1;
  const data = pagesQuery.data;

  return (
    <div className="app">
      <header className="app-header">
        <h1>Competitor Intelligence</h1>
        <span className="subtitle">AI / Voice product archive</span>
      </header>

      <FiltersBar
        filters={filters}
        competitors={competitorsQuery.data?.items ?? []}
        onChange={setFilters}
      />

      {pagesQuery.isLoading && <div className="state">Loading…</div>}
      {pagesQuery.error && (
        <div className="state">Failed to load archive. Is the API running?</div>
      )}

      {data && (
        <>
          <div className="result-meta">
            {data.total} {data.total === 1 ? "update" : "updates"}
            {data.total > 0 && ` · page ${data.page} of ${data.totalPages}`}
          </div>

          {data.items.length === 0 && (
            <div className="state">No updates match these filters.</div>
          )}

          {data.items.map((item) => (
            <PageCard key={item.id} item={item} onOpen={setOpenId} />
          ))}

          {data.totalPages > 1 && (
            <div className="pagination">
              <button
                disabled={page <= 1}
                onClick={() => setFilters({ ...filters, page: page - 1 })}
              >
                ← Prev
              </button>
              <span className="muted">
                {page} / {data.totalPages}
              </span>
              <button
                disabled={page >= data.totalPages}
                onClick={() => setFilters({ ...filters, page: page + 1 })}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}

      {openId !== null && (
        <PageDetailDrawer pageId={openId} onClose={() => setOpenId(null)} />
      )}
    </div>
  );
}
