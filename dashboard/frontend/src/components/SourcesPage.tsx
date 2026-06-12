import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { CompetitorHealth } from "../types";

/**
 * Sources management page — competitors and the sitemap/feed "sources" the
 * pipeline crawls for each. Add/remove sources, add new competitors, toggle
 * monitoring, and edit detection/filter settings. Edits become the source of
 * truth for the next dashboard-triggered run.
 */
export function SourcesPage() {
  const competitorsQuery = useQuery({
    queryKey: ["competitors"],
    queryFn: api.competitors,
  });

  const items = competitorsQuery.data?.items ?? [];
  const totalSources = items.reduce((n, c) => n + c.sitemapUrls.length, 0);

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Sources</h1>
          <span className="subtitle">
            {items.length} competitors · {totalSources} sources monitored
          </span>
        </div>
      </header>

      <AddCompetitorForm />

      {competitorsQuery.isLoading && <div className="state">Loading…</div>}
      {competitorsQuery.error && (
        <div className="state">Failed to load competitors. Is the API running?</div>
      )}

      {items.map((c) => (
        <CompetitorCard key={c.id} competitor={c} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

function AddCompetitorForm() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [snapshot, setSnapshot] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      api.createCompetitor({
        name: name.trim(),
        sitemapUrls: url.trim() ? [url.trim()] : [],
        useSnapshotDiff: snapshot,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["competitors"] });
      setName("");
      setUrl("");
      setSnapshot(false);
      setOpen(false);
    },
  });

  if (!open) {
    return (
      <div className="sources-add-bar">
        <button className="primary-button" onClick={() => setOpen(true)}>
          + Add competitor
        </button>
      </div>
    );
  }

  return (
    <form
      className="competitor-card add-competitor"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) mutation.mutate();
      }}
    >
      <h3>New competitor</h3>
      <div className="field-row">
        <label>
          Name
          <input
            autoFocus
            value={name}
            placeholder="e.g. Cartesia"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="grow">
          First source (sitemap URL)
          <input
            value={url}
            placeholder="https://example.com/sitemap.xml"
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>
      </div>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={snapshot}
          onChange={(e) => setSnapshot(e.target.checked)}
        />
        Use snapshot-diff detection (for sites without reliable lastmod dates)
      </label>
      {mutation.error && (
        <div className="form-error">{(mutation.error as Error).message}</div>
      )}
      <div className="field-row">
        <button className="primary-button" type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Adding…" : "Add competitor"}
        </button>
        <button type="button" className="ghost-button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------

function CompetitorCard({ competitor }: { competitor: CompetitorHealth }) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["competitors"] });

  const [newSource, setNewSource] = useState("");
  const [newIgnored, setNewIgnored] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      invalidate();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const addSource = useMutation({
    mutationFn: (url: string) => api.addSource(competitor.id, url),
    onSuccess: () => {
      setNewSource("");
      setError(null);
      invalidate();
    },
    onError: (e) => setError((e as Error).message),
  });

  const toggleActive = () =>
    run(() => api.updateCompetitor(competitor.id, { active: !competitor.active }));

  const setDetection = (useSnapshotDiff: boolean) =>
    run(() => api.updateCompetitor(competitor.id, { useSnapshotDiff }));

  const removeSource = (url: string) =>
    run(() => api.removeSource(competitor.id, url));

  const addIgnored = useMutation({
    mutationFn: (host: string) => api.addIgnoredSubdomain(competitor.id, host),
    onSuccess: () => {
      setNewIgnored("");
      setError(null);
      invalidate();
    },
    onError: (e) => setError((e as Error).message),
  });

  const removeIgnored = (hostName: string) =>
    run(() => api.removeIgnoredSubdomain(competitor.id, hostName));

  const remove = async () => {
    if (!window.confirm(`Stop monitoring and delete "${competitor.name}"?`)) return;
    setError(null);
    try {
      await api.deleteCompetitor(competitor.id);
      invalidate();
    } catch (e) {
      const msg = (e as Error).message;
      if (/force=true/.test(msg)) {
        if (window.confirm(`${msg}\n\nPermanently delete it and its archived pages?`)) {
          await run(() => api.deleteCompetitor(competitor.id, true));
        }
      } else {
        setError(msg);
      }
    }
  };

  const health = competitor.health;

  return (
    <div className={`competitor-card ${competitor.active ? "" : "inactive"}`}>
      <div className="competitor-head">
        <div className="competitor-title">
          <h3>{competitor.name}</h3>
          <span className={`pill ${competitor.active ? "pill-on" : "pill-off"}`}>
            {competitor.active ? "Active" : "Inactive"}
          </span>
          {health?.possibleSilentBreak && (
            <span className="pill pill-warn" title="0 new pages for 3+ runs">
              ⚠ possibly stale
            </span>
          )}
        </div>
        <div className="competitor-actions">
          <button className="ghost-button" onClick={toggleActive}>
            {competitor.active ? "Deactivate" : "Activate"}
          </button>
          <button className="danger-button" onClick={remove}>
            Delete
          </button>
        </div>
      </div>

      <div className="competitor-meta">
        <span>{competitor.sitemapUrls.length} sources</span>
        <span>·</span>
        <span>{health?.totalPagesArchived ?? 0} pages archived</span>
        <span>·</span>
        <label className="detection-select">
          Detection:
          <select
            value={competitor.useSnapshotDiff ? "snapshot_diff" : "lastmod"}
            onChange={(e) => setDetection(e.target.value === "snapshot_diff")}
          >
            <option value="lastmod">lastmod</option>
            <option value="snapshot_diff">snapshot_diff</option>
          </select>
        </label>
      </div>

      <ul className="source-list">
        {competitor.sitemapUrls.length === 0 && (
          <li className="source-empty">No sources yet — add one below.</li>
        )}
        {competitor.sitemapUrls.map((url) => (
          <li key={url} className="source-row">
            <a href={url} target="_blank" rel="noreferrer" className="source-url">
              {url}
            </a>
            <button
              className="source-remove"
              title="Remove source"
              onClick={() => removeSource(url)}
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <form
        className="add-source-row"
        onSubmit={(e) => {
          e.preventDefault();
          const u = newSource.trim();
          if (u) addSource.mutate(u);
        }}
      >
        <input
          value={newSource}
          placeholder="https://example.com/sitemap.xml"
          onChange={(e) => setNewSource(e.target.value)}
        />
        <button className="ghost-button" type="submit" disabled={addSource.isPending}>
          {addSource.isPending ? "Adding…" : "Add source"}
        </button>
      </form>

      <div className="ignored-section">
        <div className="ignored-label">
          Ignored subdomains
          <span className="hint-inline">— pages on these hosts are skipped</span>
        </div>
        <div className="chip-row">
          {competitor.ignoredSubdomains.length === 0 && (
            <span className="source-empty">None</span>
          )}
          {competitor.ignoredSubdomains.map((hostName) => (
            <span key={hostName} className="chip">
              {hostName}
              <button
                className="chip-remove"
                title="Stop ignoring"
                onClick={() => removeIgnored(hostName)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <form
          className="add-source-row"
          onSubmit={(e) => {
            e.preventDefault();
            const h = newIgnored.trim();
            if (h) addIgnored.mutate(h);
          }}
        >
          <input
            value={newIgnored}
            placeholder="community.example.com"
            onChange={(e) => setNewIgnored(e.target.value)}
          />
          <button className="ghost-button" type="submit" disabled={addIgnored.isPending}>
            {addIgnored.isPending ? "Adding…" : "Ignore subdomain"}
          </button>
        </form>
      </div>

      <button
        className="link-button"
        onClick={() => setShowAdvanced((v) => !v)}
      >
        {showAdvanced ? "Hide" : "Edit"} include/exclude filters
      </button>
      {showAdvanced && (
        <PatternEditor competitor={competitor} onSaved={invalidate} onError={setError} />
      )}

      {error && <div className="form-error">{error}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------

function PatternEditor({
  competitor,
  onSaved,
  onError,
}: {
  competitor: CompetitorHealth;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const [include, setInclude] = useState(competitor.includePatterns.join("\n"));
  const [exclude, setExclude] = useState(competitor.excludePatterns.join("\n"));

  const toLines = (s: string) =>
    s.split("\n").map((l) => l.trim()).filter(Boolean);

  const save = useMutation({
    mutationFn: () =>
      api.updateCompetitor(competitor.id, {
        includePatterns: toLines(include),
        excludePatterns: toLines(exclude),
      }),
    onSuccess: onSaved,
    onError: (e) => onError((e as Error).message),
  });

  return (
    <div className="pattern-editor">
      <p className="hint">
        One regex per line, matched against each URL. Include = keep only matching
        URLs (empty = keep all); Exclude = drop matching URLs.
      </p>
      <div className="field-row">
        <label className="grow">
          Include patterns
          <textarea
            rows={3}
            value={include}
            onChange={(e) => setInclude(e.target.value)}
            placeholder="/blog/&#10;/changelog"
          />
        </label>
        <label className="grow">
          Exclude patterns
          <textarea
            rows={3}
            value={exclude}
            onChange={(e) => setExclude(e.target.value)}
            placeholder="/careers/&#10;/legal/"
          />
        </label>
      </div>
      <button
        className="ghost-button"
        onClick={() => save.mutate()}
        disabled={save.isPending}
      >
        {save.isPending ? "Saving…" : "Save filters"}
      </button>
    </div>
  );
}
