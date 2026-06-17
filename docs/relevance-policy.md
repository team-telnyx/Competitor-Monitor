# Relevance Policy (generated)

> Auto-generated from the dashboard DB. Do not edit by hand — regenerate via
> `POST /api/policy/regenerate`. Design: [inference-training.md](./inference-training.md).

Rubric version: **v2** · relevance threshold: **40** (a page is "relevant" at/above this score).

## Rubric

| Score | signal_type | Meaning |
|---|---|---|
| 90–100 | `new_product` | New product launch / flagship capability |
| 70–89 | `new_feature` | New feature on an existing product |
| 40–69 | `update` | Incremental update (perf, pricing, latency) |
| 15–39 | `tangential` | Customer story, webinar, partnership |
| 1–14 | `irrelevant` | Careers, legal, brand, events, marketing |

## Tracked products & exclusion rules by competitor

### AssemblyAI

- **Products (1):** Universal (STT)
- **Excluded endpoints:** `/careers/`, `/legal/`, `/terms`, `/privacy`

### Bandwidth

- **Products (0):** _none_
- **Excluded endpoints:** `/careers`, `/jobs`, `/legal`, `/terms`, `/privacy`, `/cookie`, `/gdpr`

### Bird

- **Products (0):** _none_
- **Excluded endpoints:** `/careers`, `/jobs`, `/legal`, `/terms`, `/privacy`, `/cookie`, `/gdpr`

### Bland AI

- **Products (1):** Bland (AI Assistants)
- **Excluded endpoints:** `/legal/`, `/terms`, `/privacy`, `/careers`

### Deepgram

- **Products (2):** Aura (TTS), Nova (STT)
- **Excluded endpoints:** `/careers/`, `/legal/`, `/terms`, `/privacy`, `/partners/`, `/events/`

### Dialpad

- **Products (0):** _none_
- **Excluded endpoints:** `/careers`, `/jobs`, `/legal`, `/terms`, `/privacy`, `/cookie`, `/gdpr`

### ElevenLabs

- **Products (10):** Avatars (Voice), Conversational AI (AI Assistants), Dubbing (Voice), ElevenCreative (Voice), ElevenReader (TTS), Music (Voice), Scribe (STT), Studio (Voice), Text to Speech (TTS), Voice Library (TTS)
- **Excluded endpoints:** `/careers/`, `/legal/`, `/terms`, `/privacy`, `/languages/`, `/community/`, `/voice-library/`

### Google Cloud Speech

- **Products (3):** Chirp (STT), Cloud Speech-to-Text (STT), Cloud Text-to-Speech (TTS)
- **Excluded endpoints:** _none_

### Hologram

- **Products (0):** _none_
- **Excluded endpoints:** `/careers`, `/jobs`, `/legal`, `/terms`, `/privacy`, `/cookie`, `/gdpr`

### Infobip

- **Products (0):** _none_
- **Excluded endpoints:** `/careers`, `/jobs`, `/legal`, `/terms`, `/privacy`, `/cookie`, `/gdpr`

### OpenAI

- **Products (3):** GPT (Inference), Realtime API (AI Assistants), Whisper (STT)
- **Excluded endpoints:** `/careers/`, `/legal/`, `/terms`, `/privacy`

### Plivo

- **Products (0):** _none_
- **Excluded endpoints:** `/careers`, `/jobs`, `/legal`, `/terms`, `/privacy`, `/cookie`, `/gdpr`

### Retell AI

- **Products (1):** Retell (AI Assistants)
- **Excluded endpoints:** `/legal/`, `/terms`, `/privacy`, `/careers`

### RingCentral

- **Products (0):** _none_
- **Excluded endpoints:** `/careers`, `/jobs`, `/legal`, `/terms`, `/privacy`, `/cookie`, `/gdpr`

### Sinch

- **Products (0):** _none_
- **Excluded endpoints:** `/careers`, `/jobs`, `/legal`, `/terms`, `/privacy`, `/cookie`, `/gdpr`

### Soracom

- **Products (0):** _none_
- **Excluded endpoints:** `/careers`, `/jobs`, `/legal`, `/terms`, `/privacy`, `/cookie`, `/gdpr`

### Telesign

- **Products (0):** _none_
- **Excluded endpoints:** `/careers`, `/jobs`, `/legal`, `/terms`, `/privacy`, `/cookie`, `/gdpr`

### Twilio

- **Products (6):** Programmable Messaging API (Messaging), Programmable Voice (Voice), SendGrid (Other), TwiML (Voice), Twilio Agent Connect (AI Assistants), WhatsApp API (Messaging)
- **Excluded endpoints:** _none_

### Vapi

- **Products (1):** Vapi (AI Assistants)
- **Excluded endpoints:** `/legal/`, `/terms`, `/privacy`, `/careers`

### Vonage

- **Products (0):** _none_
- **Excluded endpoints:** `/careers`, `/jobs`, `/legal`, `/terms`, `/privacy`, `/cookie`, `/gdpr`

## Operator guidance (injected into classification)

_No active guidance._

## Approved removals (recent)

_None._

## Feedback summary

| Reason category | Count |
|---|---|
| not_a_release | 1 |
