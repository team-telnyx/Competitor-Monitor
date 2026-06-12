import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

/**
 * Pending removal requests awaiting approval (endpoints and subdomains). Admins are
 * TBD, so anyone can approve/reject for now. Approving adds an endpoint to the
 * competitor's exclude patterns or a subdomain to its ignored list (both visible in
 * Sources), and future runs skip it.
 */
export function ApprovalsPanel() {
  const queryClient = useQueryClient();
  const pendingQuery = useQuery({
    queryKey: ["removal-requests", "pending"],
    queryFn: () => api.removalRequests("pending"),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["removal-requests"] });
    queryClient.invalidateQueries({ queryKey: ["competitors"] });
  };

  const approve = useMutation({
    mutationFn: (id: number) => api.approveRemoval(id),
    onSuccess: invalidate,
  });
  const reject = useMutation({
    mutationFn: (id: number) => api.rejectRemoval(id),
    onSuccess: invalidate,
  });

  const items = pendingQuery.data?.items ?? [];
  if (items.length === 0) return null;

  return (
    <div className="competitor-card approvals">
      <h3 style={{ marginTop: 0 }}>Pending removals ({items.length})</h3>
      <p className="hint">
        Approving removes it from consideration — a subdomain is added to the competitor’s
        ignored list and an endpoint to its exclude patterns (both visible in Sources), and
        future runs skip it.
      </p>
      {items.map((r) => (
        <div key={r.id} className="candidate-row">
          <div>
            <span className={`pill ${r.kind === "endpoint" ? "pill-warn" : "pill-off"}`}>{r.kind}</span>{" "}
            <strong className="mono">{r.value}</strong>
            <span className="muted"> · {r.competitor.name}</span>
            {r.requestedBy && <span className="muted"> · by {r.requestedBy}</span>}
          </div>
          <div className="queue-actions">
            <button className="primary-button" onClick={() => approve.mutate(r.id)} disabled={approve.isPending}>
              Approve
            </button>
            <button className="ghost-button" onClick={() => reject.mutate(r.id)} disabled={reject.isPending}>
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
