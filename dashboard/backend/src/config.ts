import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Repo root is three levels up from src/: dashboard/backend/src -> repo root
export const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
export const LOCAL_ENV_PATH = path.resolve(REPO_ROOT, "local", ".env");

function parseEnvValue(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function readEnvFile(filePath: string): NodeJS.ProcessEnv {
  if (!fs.existsSync(filePath)) return {};

  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .reduce<NodeJS.ProcessEnv>((env, rawLine) => {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) return env;

      const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
      const separator = normalized.indexOf("=");
      if (separator === -1) return env;

      const key = normalized.slice(0, separator).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return env;

      env[key] = parseEnvValue(normalized.slice(separator + 1));
      return env;
    }, {});
}

export function envWithLocalVariables(): NodeJS.ProcessEnv {
  return {
    ...readEnvFile(LOCAL_ENV_PATH),
    ...process.env,
  };
}

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
