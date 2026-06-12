import { useQuery } from "@tanstack/react-query";
import { api } from "../api";

interface Props {
  pageId: number;
  onClose: () => void;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export function PageDetailDrawer({ pageId, onClose }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["page", pageId],
    queryFn: () => api.page(pageId),
  });

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label="Close">
          ×
        </button>

        {isLoading && <div className="state">Loading…</div>}
        {error && <div className="state">Failed to load item.</div>}

        {data && (
          <>
            <div className="row" style={{ marginBottom: 6 }}>
              {data.classification?.category && (
                <span
                  className="badge"
                  style={{ background: data.classification.categoryColor }}
                >
                  {data.classification.category}
                </span>
              )}
              <span className="competitor-name">{data.competitor.name}</span>
            </div>

            <h2>{data.title}</h2>
            <a href={data.url} target="_blank" rel="noreferrer">
              {data.url} ↗
            </a>

            {data.classification?.summary && (
              <p className="summary" style={{ marginTop: 12 }}>
                {data.classification.summary}
              </p>
            )}

            {data.classification?.reasoning && (
              <p className="reasoning">
                <strong>Why:</strong> {data.classification.reasoning}
              </p>
            )}

            <div style={{ margin: "14px 0" }}>
              <div className="kv">
                <span>Relevance</span>
                {data.classification?.relevanceScore != null
                  ? `${data.classification.relevanceScore}/100`
                  : "—"}
                {data.classification?.signalType
                  ? ` · ${data.classification.signalType}`
                  : ""}
              </div>
              <div className="kv">
                <span>Product</span>
                {data.classification?.product || "—"}
              </div>
              <div className="kv">
                <span>Relevant</span>
                {data.classification?.relevant ? "Yes" : "No"}
              </div>
              <div className="kv">
                <span>Detection</span>
                {data.detectionSource ?? "—"}
              </div>
              <div className="kv">
                <span>Last modified</span>
                {formatDate(data.lastmod)}
              </div>
              <div className="kv">
                <span>Scraped</span>
                {formatDate(data.scrapedAt)}
              </div>
              <div className="kv">
                <span>Content length</span>
                {data.textLength ? `${data.textLength} chars` : "—"}
              </div>
              <div className="kv">
                <span>Detected by run</span>
                {data.detectedByRunId ? `#${data.detectedByRunId}` : "—"}
              </div>
              <div className="kv">
                <span>Model</span>
                {data.classification?.model ?? "—"}
              </div>
            </div>

            {data.description && (
              <>
                <h3 style={{ fontSize: 14 }}>Description</h3>
                <p className="summary">{data.description}</p>
              </>
            )}

            {data.textPreview && (
              <>
                <h3 style={{ fontSize: 14 }}>Scraped preview</h3>
                <div className="preview">{data.textPreview}</div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
