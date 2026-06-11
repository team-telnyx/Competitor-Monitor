import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Repo root is three levels up from src/: dashboard/backend/src -> repo root
export const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

export const config = {
  port: Number(process.env.PORT ?? 4000),
  pythonBin: process.env.PYTHON_BIN ?? "python3",
  pipelineScript: path.resolve(
    REPO_ROOT,
    process.env.PIPELINE_SCRIPT ?? "tools/competitor_monitor.py",
  ),
  pipelineOutputDir: path.resolve(
    REPO_ROOT,
    process.env.PIPELINE_OUTPUT_DIR ?? ".tmp",
  ),
};
