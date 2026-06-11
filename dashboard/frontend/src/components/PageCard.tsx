import type { PageListItem } from "../types";

interface Props {
  item: PageListItem;
  onOpen: (id: number) => void;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function PageCard({ item, onOpen }: Props) {
  return (
    <div className="card" style={{ borderLeftColor: item.categoryColor }}>
      <div className="row">
        {item.category && (
          <span className="badge" style={{ background: item.categoryColor }}>
            {item.category}
          </span>
        )}
        <span className="competitor-name">{item.competitor.name}</span>
        <span className="muted">· {formatDate(item.scrapedAt)}</span>
        {item.detectionSource && (
          <span className="muted">· {item.detectionSource}</span>
        )}
        {!item.relevant && <span className="muted">· not relevant</span>}
      </div>

      <h3>
        <a href={item.url} target="_blank" rel="noreferrer">
          {item.title}
        </a>
      </h3>

      {item.summary && <p className="summary">{item.summary}</p>}

      <div className="actions">
        <button className="link" onClick={() => onOpen(item.id)}>
          View detail
        </button>
        <a href={item.url} target="_blank" rel="noreferrer">
          Open source ↗
        </a>
      </div>
    </div>
  );
}
