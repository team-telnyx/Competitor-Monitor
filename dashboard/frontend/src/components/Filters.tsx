import { useEffect, useState } from "react";
import { CATEGORIES, type CompetitorHealth, type Filters } from "../types";

interface Props {
  filters: Filters;
  competitors: CompetitorHealth[];
  onChange: (next: Filters) => void;
}

export function FiltersBar({ filters, competitors, onChange }: Props) {
  // Debounce the search box so we don't refetch on every keystroke.
  const [q, setQ] = useState(filters.q ?? "");
  useEffect(() => setQ(filters.q ?? ""), [filters.q]);
  useEffect(() => {
    const t = setTimeout(() => {
      if ((filters.q ?? "") !== q) onChange({ ...filters, q, page: 1 });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const set = (patch: Partial<Filters>) =>
    onChange({ ...filters, ...patch, page: 1 });

  const hasFilters =
    filters.competitor ||
    filters.category ||
    filters.q ||
    filters.from ||
    filters.to ||
    (filters.relevant && filters.relevant !== "true");

  return (
    <div className="filters">
      <input
        type="search"
        placeholder="Search titles, summaries, content…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <select
        value={filters.competitor ?? ""}
        onChange={(e) => set({ competitor: e.target.value || undefined })}
      >
        <option value="">All competitors</option>
        {competitors.map((c) => (
          <option key={c.id} value={c.name}>
            {c.name}
          </option>
        ))}
      </select>

      <select
        value={filters.category ?? ""}
        onChange={(e) => set({ category: e.target.value || undefined })}
      >
        <option value="">All categories</option>
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      <select
        value={filters.relevant ?? "true"}
        onChange={(e) =>
          set({ relevant: e.target.value as Filters["relevant"] })
        }
      >
        <option value="true">Relevant only</option>
        <option value="all">All</option>
        <option value="false">Not relevant</option>
      </select>

      <input
        type="date"
        value={filters.from ?? ""}
        onChange={(e) => set({ from: e.target.value || undefined })}
        title="From date"
      />
      <input
        type="date"
        value={filters.to ?? ""}
        onChange={(e) => set({ to: e.target.value || undefined })}
        title="To date"
      />

      {hasFilters && (
        <button
          className="clear"
          onClick={() => onChange({ relevant: "true", page: 1 })}
        >
          Clear
        </button>
      )}
    </div>
  );
}
