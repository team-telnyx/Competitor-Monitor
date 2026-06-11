import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

// Shared constants mirrored from the pipeline (competitor_monitor.py).
export const CATEGORY_COLORS: Record<string, string> = {
  "AI Assistants": "#8e44ad",
  Inference: "#e67e22",
  STT: "#27ae60",
  TTS: "#2980b9",
  "Other AI/Voice": "#7f8c8d",
  Other: "#7f8c8d",
};

export const FOCUS_AREAS = ["AI Assistants", "Inference", "STT", "TTS"] as const;

// SQLite has no native JSON, so string[] columns are stored JSON-encoded.
export function encodeJson(value: unknown): string {
  return JSON.stringify(value ?? []);
}

export function decodeStringArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
