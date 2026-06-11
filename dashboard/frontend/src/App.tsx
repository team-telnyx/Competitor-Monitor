import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { Filters } from "./types";
import { FiltersBar } from "./components/Filters";
import { PageCard } from "./components/PageCard";
import { PageDetailDrawer } from "./components/PageDetailDrawer";

export function App() {
  const [filters, setFilters] = useState<Filters>({ relevant: "true", page: 1 });
  const [openId, setOpenId] = useState<number | null>(null);
  const [refreshJobId, setRefreshJobId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const competitorsQuery = useQuery({
    queryKey: ["competitors"],
    queryFn: api.competitors,
  });

  const pagesQuery = useQuery({
    queryKey: ["pages", filters],
    queryFn: () => api.pages(filters),
  });

  const refreshMutation = useMutation({
    mutationFn: () =>
      api.startRun({
        hours: 24,
        competitor: filters.competitor,
        noSlack: true,
        requireInference: true,
      }),
    onSuccess: (job) => setRefreshJobId(job.jobId),
  });

  const refreshJobQuery = useQuery({
    queryKey: ["refresh-job", refreshJobId],
    queryFn: () => api.runJob(refreshJobId!),
    enabled: Boolean(refreshJobId),
    refetchInterval: (query) =>
      query.state.data?.status === "running" ? 2000 : false,
  });

  useEffect(() => {
    if (refreshJobQuery.data?.status === "succeeded") {
      queryClient.invalidateQueries({ queryKey: ["pages"] });
      queryClient.invalidateQueries({ queryKey: ["competitors"] });
    }
  }, [queryClient, refreshJobQuery.data?.status]);

  const page = filters.page ?? 1;
  const data = pagesQuery.data;

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Competitor Intelligence</h1>
          <span className="subtitle">AI / Voice product archive</span>
        </div>
        <button
          className="refresh-button"
          disabled={
            refreshMutation.isPending ||
            refreshJobQuery.data?.status === "running"
          }
          onClick={() => refreshMutation.mutate()}
          title="Scrape recent updates, classify with inference, and ingest without sending Slack"
        >
          {refreshMutation.isPending || refreshJobQuery.data?.status === "running"
            ? "Refreshing…"
            : `Refresh ${filters.competitor ?? "all"}`}
        </button>
      </header>

      {(refreshMutation.error || refreshJobQuery.data) && (
        <div
          className={`refresh-status ${
            refreshJobQuery.data?.status === "failed" ? "error" : ""
          }`}
        >
          {refreshMutation.error &&
            `Could not start refresh: ${(refreshMutation.error as Error).message}`}
          {refreshJobQuery.data?.status === "running" &&
            "Refresh running with inference…"}
          {refreshJobQuery.data?.status === "succeeded" &&
            `Refresh complete: ${refreshJobQuery.data.pagesIngested ?? 0} pages, ${
              refreshJobQuery.data.relevant ?? 0
            } relevant.`}
          {refreshJobQuery.data?.status === "failed" &&
            `Refresh failed: ${refreshJobQuery.data.error ?? "unknown error"}`}
        </div>
      )}

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
