interface Props {
  score: number | null;
  signalType: string | null;
}

/** Color by relevance band (mirrors the rubric in docs/inference-training.md §2). */
function bandColor(score: number): string {
  if (score >= 90) return "#1e7e3e"; // new_product
  if (score >= 70) return "#2980b9"; // new_feature
  if (score >= 40) return "#e67e22"; // update
  if (score >= 15) return "#95a5a6"; // tangential
  return "#c0392b"; // irrelevant
}

const SIGNAL_LABELS: Record<string, string> = {
  new_product: "new product",
  new_feature: "new feature",
  update: "update",
  tangential: "tangential",
  irrelevant: "irrelevant",
  unclassified: "unclassified",
};

/** Compact "score · signal" pill used on archive cards and the training queue. */
export function ScoreBadge({ score, signalType }: Props) {
  if (score === null || score === undefined) {
    return <span className="score-badge score-na">—</span>;
  }
  const label = signalType ? SIGNAL_LABELS[signalType] ?? signalType : "";
  return (
    <span
      className="score-badge"
      style={{ background: bandColor(score) }}
      title={signalType ?? undefined}
    >
      {score}
      {label && <span className="score-signal">{label}</span>}
    </span>
  );
}
