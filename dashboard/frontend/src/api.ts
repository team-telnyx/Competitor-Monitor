import type {
  CompetitorHealth,
  Filters,
  PageDetail,
  PageList,
} from "./types";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export function buildPagesQuery(filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.competitor) params.set("competitor", filters.competitor);
  if (filters.category) params.set("category", filters.category);
  if (filters.q) params.set("q", filters.q);
  if (filters.relevant) params.set("relevant", filters.relevant);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.page) params.set("page", String(filters.page));
  const qs = params.toString();
  return `/api/pages${qs ? `?${qs}` : ""}`;
}

export const api = {
  pages: (filters: Filters) => getJson<PageList>(buildPagesQuery(filters)),
  page: (id: number) => getJson<PageDetail>(`/api/pages/${id}`),
  competitors: () =>
    getJson<{ items: CompetitorHealth[] }>("/api/competitors"),
};
