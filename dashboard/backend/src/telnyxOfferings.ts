// Telnyx product catalog for the Competitors-tab offering map (PRD §5.2),
// scraped from https://telnyx.com/products and mapped to the canonical taxonomy.
// Operators maintain it from the Competitors tab; this is the seed.
export interface TelnyxOfferingSeed {
  name: string;
  category: string;
}

export const TELNYX_OFFERINGS: TelnyxOfferingSeed[] = [
  // AI / Voice
  { name: "Voice AI", category: "AI Assistants" },
  { name: "Speech-to-Text", category: "STT" },
  { name: "Text-to-Speech", category: "TTS" },
  { name: "Inference", category: "Inference" },
  { name: "Embeddings API", category: "Inference" },
  { name: "LLM Library", category: "Inference" },
  // Voice infrastructure
  { name: "Voice API", category: "Voice" },
  { name: "SIP Trunking", category: "Voice" },
  { name: "TeXML", category: "Voice" },
  { name: "WebRTC", category: "Voice" },
  // Messaging
  { name: "SMS API", category: "Messaging" },
  { name: "MMS API", category: "Messaging" },
  { name: "Short Code", category: "Messaging" },
  { name: "10DLC", category: "Messaging" },
  { name: "Alphanumeric Sender ID", category: "Messaging" },
  { name: "RCS", category: "Messaging" },
  { name: "WhatsApp Business Messaging", category: "Messaging" },
  // Numbers
  { name: "Global Numbers", category: "Numbers" },
  { name: "Toll-free Numbers", category: "Numbers" },
  // Identity
  { name: "Number Lookup API", category: "Identity" },
  { name: "Verify API", category: "Identity" },
  // Fax
  { name: "Fax API", category: "Fax" },
  // IoT
  { name: "Mobile Voice", category: "IoT" },
  { name: "IoT SIM Card", category: "IoT" },
  { name: "eSIM", category: "IoT" },
  // Networking
  { name: "Programmable Networking", category: "Networking" },
  { name: "Cloud VPN", category: "Networking" },
  { name: "Global Edge Router", category: "Networking" },
  // Storage
  { name: "Storage", category: "Storage" },
  // Enterprise integrations
  { name: "Microsoft Teams", category: "Other" },
  { name: "Zoom Phone", category: "Other" },
];
