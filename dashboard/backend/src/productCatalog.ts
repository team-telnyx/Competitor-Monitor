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
  Vapi: [{ name: "Vapi", category: "AI Assistants" }],
  "Retell AI": [{ name: "Retell", category: "AI Assistants", aliases: ["Retell AI"] }],
  "Bland AI": [{ name: "Bland", category: "AI Assistants", aliases: ["Bland AI"] }],
  AssemblyAI: [
    { name: "Universal", category: "STT", aliases: ["Universal-2", "Slam-1"] },
  ],
  "Together AI": [
    {
      name: "Serverless Inference",
      category: "Inference",
      aliases: ["Together Inference", "Inference API"],
    },
    {
      name: "Dedicated Inference",
      category: "Inference",
      aliases: ["Dedicated Endpoints"],
    },
    { name: "Fine-tuning", category: "Inference" },
    {
      name: "GPU Clusters",
      category: "Inference",
      aliases: ["Instant GPU Clusters", "Batch Inference"],
    },
  ],
  Baseten: [
    {
      name: "Model APIs",
      category: "Inference",
      aliases: ["Model API", "Frontier Gateway"],
    },
    {
      name: "Dedicated Deployments",
      category: "Inference",
      aliases: ["Dedicated Deployment"],
    },
    { name: "Training", category: "Inference" },
    { name: "Chains", category: "Inference" },
  ],
  "Fireworks AI": [
    {
      name: "Serverless Inference",
      category: "Inference",
      aliases: ["Inference API"],
    },
    {
      name: "Dedicated Deployments",
      category: "Inference",
      aliases: ["On-demand Deployments"],
    },
    {
      name: "Fine-tuning",
      category: "Inference",
      aliases: ["Customization Engine"],
    },
  ],
  RunPod: [
    { name: "Serverless", category: "Inference", aliases: ["Serverless GPU"] },
    { name: "Pods", category: "Inference", aliases: ["GPU Cloud", "GPU Pods"] },
    {
      name: "Instant Clusters",
      category: "Inference",
      aliases: ["Clusters", "Enterprise Clusters"],
    },
  ],
  Modal: [
    { name: "Serverless GPU", category: "Inference", aliases: ["Functions"] },
    { name: "Sandboxes", category: "Inference" },
  ],
  Replicate: [
    {
      name: "Predictions API",
      category: "Inference",
      aliases: ["Run a model", "Models API"],
    },
    { name: "Deployments", category: "Inference" },
    { name: "Fine-tuning", category: "Inference", aliases: ["Training"] },
  ],
};
