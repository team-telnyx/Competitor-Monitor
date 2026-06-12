import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../api";

interface Props {
  competitorId: number;
  url: string;
  pageId: number;
}

interface Parsed {
  host: string;
  hasSubdomain: boolean;
  path: string;
  prefixes: string[]; // candidate endpoint prefixes, broad → specific
}

function parseUrl(url: string): Parsed | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname;
  // Heuristic: more than 2 labels ⇒ there's a subdomain (good enough for .io/.ai/.com).
  const hasSubdomain = host.split(".").length > 2;
  const segments = u.pathname.split("/").filter(Boolean);
  const prefixes: string[] = [];
  for (let i = 1; i <= Math.min(segments.length, 2); i++) {
    prefixes.push("/" + segments.slice(0, i).join("/"));
  }
  return { host, hasSubdomain, path: u.pathname, prefixes };
}

/**
 * "Remove from consideration" control. For a page on a real subdomain it offers to
 * drop that subdomain; otherwise it offers to exclude an endpoint (path) section.
 * Either way it files an approval request (docs/inference-training.md §5).
 */
export function RemovalAction({ competitorId, url, pageId }: Props) {
  const parsed = useMemo(() => parseUrl(url), [url]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefix, setPrefix] = useState(parsed?.prefixes[0] ?? "");

  const mutation = useMutation({
    mutationFn: (vars: { kind: "subdomain" | "endpoint"; value: string }) =>
      api.requestRemoval(competitorId, vars.kind, vars.value, pageId),
    onSuccess: () => {
      setPending(true);
      setError(null);
    },
    onError: (e) => setError((e as Error).message),
  });

  if (!parsed) return null;

  if (pending) {
    return <span className="consider-action"><span className="consider-pending">removal pending</span></span>;
  }

  // True subdomain → offer subdomain removal.
  if (parsed.hasSubdomain) {
    return (
      <span className="consider-action" title={error ?? parsed.host}>
        <span className="consider-target">{parsed.host}</span>
        <button
          className="consider-remove"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate({ kind: "subdomain", value: parsed.host })}
          title="Request removing this subdomain from consideration"
        >
          remove subdomain
        </button>
        {error && <span className="consider-err">⚠</span>}
      </span>
    );
  }

  // Apex host → offer endpoint (path) exclusion. No path to act on at the root.
  if (parsed.prefixes.length === 0) return null;

  return (
    <span className="consider-action" title={error ?? parsed.path}>
      <span className="consider-target">{parsed.path}</span>
      <span className="consider-label">exclude</span>
      <select value={prefix} onChange={(e) => setPrefix(e.target.value)} className="consider-select">
        {parsed.prefixes.map((p) => (
          <option key={p} value={p}>{p}/…</option>
        ))}
      </select>
      <button
        className="consider-remove"
        disabled={mutation.isPending || !prefix}
        onClick={() => mutation.mutate({ kind: "endpoint", value: prefix })}
        title="Request excluding this endpoint section from consideration"
      >
        remove
      </button>
      {error && <span className="consider-err">⚠</span>}
    </span>
  );
}
