import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

/**
 * Plain-text guidance the operator feeds to the inference layer "for additional
 * consideration". Global (no competitor) or scoped to one; injected into the next
 * run's classify prompt (docs/inference-training.md §5).
 */
export function GuidancePanel() {
  const queryClient = useQueryClient();
  const guidanceQuery = useQuery({ queryKey: ["guidance"], queryFn: () => api.guidance() });
  const competitorsQuery = useQuery({ queryKey: ["competitors"], queryFn: api.competitors });

  const [text, setText] = useState("");
  const [competitorId, setCompetitorId] = useState<string>(""); // "" = global

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["guidance"] });

  const add = useMutation({
    mutationFn: () =>
      api.addGuidance({
        text: text.trim(),
        competitorId: competitorId ? Number(competitorId) : null,
      }),
    onSuccess: () => {
      setText("");
      invalidate();
    },
  });
  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) => api.toggleGuidance(id, active),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.deleteGuidance(id),
    onSuccess: invalidate,
  });

  const items = guidanceQuery.data?.items ?? [];
  const competitors = competitorsQuery.data?.items ?? [];

  return (
    <div className="competitor-card">
      <h3 style={{ marginTop: 0 }}>Inference guidance</h3>
      <p className="hint">
        Free-text notes the classifier considers on the next run. Leave the scope as Global
        to apply to every competitor.
      </p>

      <form
        className="field-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) add.mutate();
        }}
      >
        <label className="grow">
          Guidance
          <input
            value={text}
            placeholder="e.g. Treat education customer stories as tangential, not new products"
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <label>
          Scope
          <select value={competitorId} onChange={(e) => setCompetitorId(e.target.value)}>
            <option value="">Global</option>
            {competitors.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <button className="primary-button" type="submit" disabled={add.isPending}>
          {add.isPending ? "Adding…" : "Add"}
        </button>
      </form>
      {add.error && <div className="form-error">{(add.error as Error).message}</div>}

      <ul className="guidance-list">
        {items.length === 0 && <li className="source-empty">No guidance yet.</li>}
        {items.map((g) => (
          <li key={g.id} className={`guidance-row ${g.active ? "" : "muted-row"}`}>
            <span className="pill pill-off">{g.scope}</span>
            <span className="guidance-text">{g.text}</span>
            <button className="link-button" onClick={() => toggle.mutate({ id: g.id, active: !g.active })}>
              {g.active ? "Disable" : "Enable"}
            </button>
            <button className="source-remove" title="Delete" onClick={() => remove.mutate(g.id)}>
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
