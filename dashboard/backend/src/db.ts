import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

// Canonical category taxonomy — Telnyx's product surface, keeping AI/voice
// granularity (docs/dashboard_prd.md §5.2/§5.3). Mirrored in tools/inference.py.
// Used for classification, the Categories tab, the offering map, and products.
export const CATEGORIES = [
  "AI Assistants",
  "Inference",
  "STT",
  "TTS",
  "Voice",
  "Messaging",
  "Numbers",
  "Identity",
  "Fax",
  "IoT",
  "Networking",
  "Storage",
  "Other",
] as const;

export const CATEGORY_COLORS: Record<string, string> = {
  "AI Assistants": "#8e44ad",
  Inference: "#e67e22",
  STT: "#27ae60",
  TTS: "#2980b9",
  Voice: "#16a085",
  Messaging: "#d35400",
  Numbers: "#2c3e50",
  Identity: "#c0392b",
  Fax: "#7f8c8d",
  IoT: "#f39c12",
  Networking: "#34495e",
  Storage: "#95a5a6",
  Other: "#7f8c8d",
  // Legacy label retained so older rows still render until re-classified.
  "Other AI/Voice": "#16a085",
};

export const FOCUS_AREAS = [...CATEGORIES] as readonly string[];

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
