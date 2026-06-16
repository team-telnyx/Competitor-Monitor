#!/usr/bin/env bash
# Local helper to force a pipeline run. In prod, COMPETITIVE_PIPELINE_CMD points at the
# K8s Job trigger instead (the worker runs out-of-cluster from the Python-free web image).
#
# Runs the in-repo Python worker against $DATABASE_URL, first exporting the DB config
# (sources + rules + products + guidance + few-shot examples) so operator input recorded
# in the dashboard is applied on the run — i.e. this closes the training loop.
#
# Requires the Python deps in pipeline/requirements.txt (point $PYTHON at a venv if the
# system python lacks them) and the server's node deps (for the config export).
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"          # repo root
PY="${PYTHON:-python3}"
OUT="${PIPELINE_OUT_DIR:-/tmp/plg-competitive}"
mkdir -p "$OUT/snapshots"

# Export the active competitor config from the DB → pipeline --config.
CONF="$OUT/config.json"
if node "$HERE/server/db/export-config.js" "$CONF" 2>>"$OUT/run.log"; then
  CONFIG_ARG="--config $CONF"
else
  CONFIG_ARG=""   # fall back to the built-in config if the export fails
fi

"$PY" "$HERE/pipeline/competitor_monitor.py" --hours "${PIPELINE_HOURS:-48}" --no-slack --output-dir "$OUT" $CONFIG_ARG
JSON="$(ls -t "$OUT"/competitor_monitor_*.json | head -1)"
"$PY" "$HERE/pipeline/write_db.py" "$JSON" --trigger manual --snapshots "$OUT/snapshots"
echo "ingested $JSON"
