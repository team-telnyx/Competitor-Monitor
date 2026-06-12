// Draft per-competitor product catalog (docs/inference-training.md §3), curated
// from the products that actually appear in the archived competitor pages. This
// seeds the Product registry so classification can match to a known product
// (deterministic) and flag unknown ones as candidates. Operators refine it via
// the Training page / product endpoints; this is just the starting draft.
export interface ProductSeed {
  name: string;
  category: string; // AI Assistants | Inference | STT | TTS | Other AI/Voice
  aliases?: string[];
}

export const PRODUCT_CATALOG: Record<string, ProductSeed[]> = {
  ElevenLabs: [
    {
      name: "Conversational AI",
      category: "AI Assistants",
      aliases: [
        "Agents",
        "ElevenLabs Agents",
        "ElevenAgents",
        "Conversational AI 2.0",
        "Studio Agents",
        "Flows Agent",
        "Agent Templates",
      ],
    },
    { name: "Scribe", category: "STT", aliases: ["Scribe v2", "Scribe v2 Realtime"] },
    {
      name: "Text to Speech",
      category: "TTS",
      aliases: ["TTS", "Text to Speech API", "Streaming", "Turbo", "Flash"],
    },
    { name: "Dubbing", category: "Other AI/Voice", aliases: ["Dubbing v2"] },
    { name: "Studio", category: "Other AI/Voice" },
    { name: "Voice Library", category: "TTS" },
    { name: "Music", category: "Other AI/Voice", aliases: ["Music v2"] },
    { name: "Avatars", category: "Other AI/Voice" },
    { name: "ElevenReader", category: "TTS", aliases: ["Reader"] },
    {
      name: "ElevenCreative",
      category: "Other AI/Voice",
      aliases: ["Flows", "ElevenProductions", "Creative"],
    },
  ],
  Deepgram: [
    { name: "Nova", category: "STT", aliases: ["Nova-3", "Nova-2", "Nova-3 Medical"] },
    { name: "Aura", category: "TTS", aliases: ["Aura-2"] },
  ],
  Vapi: [{ name: "Vapi", category: "AI Assistants" }],
  "Retell AI": [{ name: "Retell", category: "AI Assistants", aliases: ["Retell AI"] }],
  "Bland AI": [{ name: "Bland", category: "AI Assistants", aliases: ["Bland AI"] }],
  AssemblyAI: [
    { name: "Universal", category: "STT", aliases: ["Universal-2", "Slam-1"] },
  ],
  OpenAI: [
    { name: "Realtime API", category: "AI Assistants", aliases: ["Realtime"] },
    { name: "Whisper", category: "STT" },
    { name: "GPT", category: "Inference", aliases: ["GPT-4o", "GPT-5"] },
  ],
  "Google Cloud Speech": [
    { name: "Chirp", category: "STT", aliases: ["Chirp 3"] },
    { name: "Cloud Text-to-Speech", category: "TTS" },
    { name: "Cloud Speech-to-Text", category: "STT" },
  ],
};
