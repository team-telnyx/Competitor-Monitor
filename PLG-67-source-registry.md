# PLG-67: AI/Voice Competitor Source Registry

## Telnyx Product Surface (what we're defending)

| Product | Category | Competitors |
|---------|----------|-------------|
| Voice AI | AI Assistants | Vapi, Retell AI, Bland AI |
| Inference / LLM Library | Inference | OpenAI, Google Cloud (Vertex AI) |
| Speech-to-Text API | STT | Deepgram, AssemblyAI, Google Cloud STT |
| Text-to-Speech API | TTS | ElevenLabs, Google Cloud TTS, Deepgram |
| Embeddings API | Inference | OpenAI |
| Voice API / SIP Trunking | Platform | Twilio |

---

## Competitor Source Registry

### 1. Vapi (Voice AI Agents)

| Source | URL | Type | Fetchable | Has Dates | lastmod | Detection | Notes |
|--------|-----|------|:---------:|:---------:|:-------:|-----------|-------|
| Blog | https://vapi.ai/blog | Blog | Yes | Yes | No | Snapshot diff | ~15 posts visible, monthly cadence |
| Changelog | N/A | — | — | — | — | — | No changelog page exists (404) |
| Docs | https://docs.vapi.ai | Docs | No (303 redirect) | — | — | — | Auth-gated, not scrapable |
| Sitemap | https://vapi.ai/sitemap.xml | Sitemap | Yes | — | No | Snapshot diff | 736 URLs, no lastmod dates |
| RSS | N/A | — | — | — | — | — | No RSS feed |

**Product area tags:** AI Assistants, Voice AI
**Scraping constraints:** No lastmod in sitemap, no changelog, docs are auth-gated. Blog is only reliable source. Use snapshot diff on sitemap.

---

### 2. ElevenLabs (TTS / Audio AI)

| Source | URL | Type | Fetchable | Has Dates | lastmod | Detection | Notes |
|--------|-----|------|:---------:|:---------:|:-------:|-----------|-------|
| Blog | https://elevenlabs.io/blog | Blog | Yes | Yes | Yes | Lastmod | Product launches, partnerships, research |
| Changelog | https://elevenlabs.io/docs/changelog | Changelog | No (303) | — | — | — | Auth-gated docs |
| Sitemap | https://elevenlabs.io/sitemap.xml | Sitemap index | Yes | — | Yes | Lastmod | 277 child sitemaps, ~49K URLs |
| RSS | N/A | — | — | — | — | — | No RSS feed |

**Product area tags:** TTS, Voice Cloning, Audio AI, STT (transcription products)
**Scraping constraints:** Docs changelog is auth-gated. Blog and sitemap are reliable. Large sitemap index — use include filters to avoid noise (careers, community, voice-library, languages pages).

---

### 3. Retell AI (Voice AI Agents)

| Source | URL | Type | Fetchable | Has Dates | lastmod | Detection | Notes |
|--------|-----|------|:---------:|:---------:|:-------:|-----------|-------|
| Blog | https://www.retellai.com/blog | Blog | Yes | Partial | Yes | Lastmod | Mix of product updates and thought leadership |
| Changelog | https://www.retellai.com/changelog | Changelog | Yes | Yes | Yes | Lastmod | **Excellent source** — monthly entries with detailed feature lists |
| Docs | https://docs.retellai.com | Docs | Unknown | — | — | — | Needs testing |
| Sitemap | https://www.retellai.com/sitemap.xml | Sitemap | Yes | — | Yes | Lastmod | Sitemap includes lastmod dates |
| RSS | N/A | — | — | — | — | — | No RSS feed |

**Product area tags:** AI Assistants, Voice AI, STT (ASR), TTS
**Scraping constraints:** Sitemap has lastmod dates. Changelog is the highest-signal source — structured monthly entries with specific feature names. Blog has inconsistent dates.

---

### 4. Bland AI (Phone AI Agents)

| Source | URL | Type | Fetchable | Has Dates | lastmod | Detection | Notes |
|--------|-----|------|:---------:|:---------:|:-------:|-----------|-------|
| Blog | https://www.bland.ai/blog | Blog | No (CSS only) | — | — | — | JS-rendered, not scrapable via requests |
| Changelog | https://www.bland.ai/changelog | Changelog | No (CSS only) | — | — | — | JS-rendered, not scrapable via requests |
| Sitemap | https://www.bland.ai/sitemap.xml | Sitemap index | Yes | — | Yes | Lastmod | 12 child sitemaps, has lastmod |
| RSS | N/A | — | — | — | — | — | No RSS feed |

**Product area tags:** AI Assistants, Voice AI
**Scraping constraints:** Blog and changelog are JS-rendered (Next.js) — return only CSS when fetched server-side. **Sitemap with lastmod is the only reliable detection method.** Content scraping of individual pages may also fail. Consider headless browser if deeper content needed.

---

### 5. Deepgram (STT / Audio Intelligence)

| Source | URL | Type | Fetchable | Has Dates | lastmod | Detection | Notes |
|--------|-----|------|:---------:|:---------:|:-------:|-----------|-------|
| Blog | https://deepgram.com/blog | Blog | Yes | Partial | No | Snapshot diff | Categories: AI Agents, Announcements, Tutorials |
| Changelog | https://developers.deepgram.com/changelog | Changelog | No (303) | — | — | — | Auth-gated developer docs |
| Docs | https://developers.deepgram.com | Docs | No (303) | — | — | — | Auth-gated |
| Sitemap | https://deepgram.com/sitemap.xml | Sitemap | Yes | — | No | Snapshot diff | 1,384 URLs, no lastmod |
| RSS | N/A | — | — | — | — | — | Newsletter signup only ("AIMinds") |

**Product area tags:** STT, Audio Intelligence, Voice AI
**Additional source:** GitHub SDK releases at `https://github.com/deepgram/deepgram-python-sdk/releases.atom` — Atom feed, has dates, contains product signals (e.g. "diarization v2 batch GA"). Active — latest release June 3, 2026.
**Scraping constraints:** Developer docs and changelog are auth-gated. Blog + GitHub releases are reliable sources. No lastmod in sitemap — use snapshot diff.

---

### 6. AssemblyAI (STT / Audio Intelligence)

| Source | URL | Type | Fetchable | Has Dates | lastmod | Detection | Notes |
|--------|-----|------|:---------:|:---------:|:-------:|-----------|-------|
| Blog | https://www.assemblyai.com/blog | Blog | Yes | Yes | No | Snapshot diff | Active — multiple posts per week, mix of tutorials and product |
| Changelog | https://www.assemblyai.com/changelog | Changelog | Partial | No entries visible | No | — | Index page only, no actual entries rendered |
| Docs | https://www.assemblyai.com/docs | Docs | Unknown | — | — | — | Needs testing |
| Sitemap | https://www.assemblyai.com/sitemap.xml | Sitemap | Yes | — | No | Snapshot diff | 1,268 URLs, no lastmod |
| RSS | N/A | — | — | — | — | — | No RSS feed |

**Product area tags:** STT, Audio Intelligence, Speaker Diarization
**Additional source:** GitHub SDK releases at `https://github.com/AssemblyAI/assemblyai-python-sdk/releases.atom` — Atom feed, has dates, contains product signals (e.g. new `u3-rt-pro-beta-1` streaming speech model). Very active — multiple releases per week.
**Scraping constraints:** Changelog page exists but renders as a stub with no entries. Blog + GitHub releases are reliable sources. No lastmod — use snapshot diff.

---

### 7. Twilio (Communications Platform)

| Source | URL | Type | Fetchable | Has Dates | lastmod | Detection | Notes |
|--------|-----|------|:---------:|:---------:|:-------:|-----------|-------|
| Blog | https://www.twilio.com/en-us/blog/ | Blog | Yes | Yes | Yes | Lastmod | Filter to AI/voice content only |
| Changelog | https://www.twilio.com/en-us/changelog | Changelog | Yes | Yes | Yes | Lastmod | Product-level changelog |
| Press | https://www.twilio.com/en-us/press/ | Press releases | Yes | Yes | Yes | Lastmod | Major announcements |
| Sitemap | https://www.twilio.com/sitemap.xml | Sitemap index | Yes | — | Yes | Lastmod | 7 child sitemaps, ~22K URLs |
| RSS | N/A | — | — | — | — | — | No RSS feed |

**Product area tags:** AI Assistants (Twilio AI), Voice AI, Platform
**Scraping constraints:** Massive sitemap — MUST filter to `/en-us/` to avoid locale duplicates. Blog needs LLM classification to separate AI/voice posts from general content.

---

### 8. OpenAI (Inference / Models / Realtime API)

| Source | URL | Type | Fetchable | Has Dates | lastmod | Detection | Notes |
|--------|-----|------|:---------:|:---------:|:-------:|-----------|-------|
| Blog | https://openai.com/index/ | Blog | No (403) | — | — | — | Blocked by Cloudflare |
| API Changelog | https://developers.openai.com/api/docs/changelog | Changelog | Yes | Yes | Yes | Lastmod | **Excellent source** — daily entries, very detailed |
| Sitemap | https://openai.com/sitemap.xml | Sitemap index | Yes | — | Yes | Lastmod | 33 child sitemaps, has lastmod |
| RSS | N/A | — | — | — | — | — | No RSS feed |

**Product area tags:** Inference, LLM Models, Realtime API, TTS, STT
**Scraping constraints:** Blog (openai.com/index/) returns 403 — Cloudflare blocks scrapers. API changelog at developers.openai.com is the best source — very active with daily entries. Sitemap with lastmod works for detection.

---

### 9. Google Cloud (STT / TTS / Vertex AI)

| Source | URL | Type | Fetchable | Has Dates | lastmod | Detection | Notes |
|--------|-----|------|:---------:|:---------:|:-------:|-----------|-------|
| STT Release Notes | https://docs.cloud.google.com/speech-to-text/docs/release-notes | Release notes | Yes | Yes | Yes | Lastmod | Chirp model updates, language support |
| TTS Release Notes | https://docs.cloud.google.com/text-to-speech/docs/release-notes | Release notes | Yes | Yes | Yes | Lastmod | Chirp HD voices, Gemini TTS |
| Vertex AI Release Notes | https://docs.cloud.google.com/vertex-ai/docs/release-notes | Release notes | Yes | Yes | Yes | Lastmod | Model serving, inference updates |
| Blog | https://cloud.google.com/blog/products/ai-machine-learning | Blog | Yes | Yes | Yes | Lastmod | AI/ML product announcements |
| Sitemap | https://cloud.google.com/sitemap.xml | Sitemap index | Yes | — | Yes | Lastmod | 180 child sitemaps — MUST use include filters |

**Product area tags:** STT, TTS, Inference, Model Serving
**Scraping constraints:** Massive sitemap (180 children). Must filter to speech-to-text, text-to-speech, vertex-ai, and blog/ai-machine-learning paths. Individual release notes pages are the highest-signal sources.

---

## Relevant-Update Rules

### What counts as a relevant product update

| Category | Relevant (monitor) | Irrelevant (ignore) |
|----------|-------------------|---------------------|
| **AI Assistants** | New agent features, orchestration tools, multi-agent support, tool-use improvements, new integrations | Generic "what is AI" content, customer testimonials without product detail |
| **Inference** | New models available, pricing changes, latency improvements, new regions, API changes, batch/streaming updates | AI thought leadership, opinion pieces, unrelated API changes |
| **STT** | New ASR models, language support, accuracy improvements, diarization updates, real-time streaming changes, pricing | Tutorials rehashing existing features, SEO landing pages |
| **TTS** | New voices, voice cloning updates, model quality improvements, language/accent support, latency changes, pricing | Voice library additions (individual voices), community content |
| **Platform** | MCP integrations, SDK releases, deprecations, breaking changes | Blog posts about general industry trends |

### Signals that indicate product movement (even in "thought leadership")
- Mentions of specific model names or versions
- Benchmarks or performance comparisons
- Pricing changes or new tier announcements
- "Now available" / "launching" / "generally available" language
- Deprecation notices

---

## Blocked / Unreliable Sources

| Competitor | Source | Issue | Workaround |
|-----------|--------|-------|------------|
| Vapi | Docs (docs.vapi.ai) | 303 redirect, auth-gated | Monitor sitemap + blog only |
| Bland AI | Blog, Changelog | JS-rendered, returns CSS only | Use sitemap lastmod for detection; individual page scraping may also fail |
| Deepgram | Changelog (developers.deepgram.com) | 303 redirect, auth-gated | Monitor sitemap + blog only |
| AssemblyAI | Changelog | Stub page, no entries rendered | Monitor blog only |
| OpenAI | Blog (openai.com/index/) | 403 Cloudflare block | Use API changelog + sitemap lastmod |
| ElevenLabs | Docs changelog | 303 redirect, auth-gated | Monitor blog + sitemap lastmod |

---

## Detection Method Summary

| Competitor | Primary Detection | Backup | lastmod Available |
|-----------|------------------|--------|:-----------------:|
| Vapi | Snapshot diff (sitemap) | — | No |
| ElevenLabs | Lastmod (sitemap) | — | Yes |
| Retell AI | Lastmod (sitemap) | Changelog scrape | Yes |
| Bland AI | Lastmod (sitemap) | — | Yes |
| Deepgram | Snapshot diff (sitemap) | — | No |
| AssemblyAI | Snapshot diff (sitemap) | — | No |
| Twilio | Lastmod (sitemap) | — | Yes |
| OpenAI | Lastmod (sitemap) + API changelog | — | Yes |
| Google Cloud | Lastmod (sitemap) + release notes | — | Yes |

---

## Domain-Specific Categorization Tags

Every detected page should be classified into one or more of:

```
ai_assistants     — Voice agents, agent platforms, orchestration, tool use
inference         — LLM hosting, model serving, API endpoints, batch/streaming
stt               — Speech-to-text, ASR, transcription, diarization
tts               — Text-to-speech, voice synthesis, voice cloning, audio generation
voice_ai          — Conversational AI, real-time voice, telephony AI
platform          — SDKs, API changes, pricing, deprecations, integrations
```

---

## Example: Relevant vs. Irrelevant Updates

### Relevant
| Update | Competitor | Tags | Why |
|--------|-----------|------|-----|
| "Introducing Vapi Monitoring" | Vapi | ai_assistants, platform | New product feature for voice agent observability |
| "Chirp 3 GA — speaker ID + auto language detection" | Google Cloud | stt | New model release with new capabilities |
| "Introducing Dubbing v2" | ElevenLabs | tts | Major product version update |
| "Agent Versioning 2.0, Granular Multilingual" | Retell AI | ai_assistants, stt | Multi-feature product release |
| "Container session billing changed to per-minute" | OpenAI | inference | Pricing change affecting cost calculations |
| "GPT-5 family models available" | Retell AI | inference, ai_assistants | New model availability on competing platform |

### Irrelevant
| Update | Competitor | Why Skip |
|--------|-----------|----------|
| "12 Best Conversational AI Platforms for 2026" | Retell AI | SEO listicle, no product news |
| "How does context influence speaker labeling?" | AssemblyAI | Educational tutorial, no new feature |
| "Voice AI for Greece" | ElevenLabs | Market expansion PR, not product |
| "AGI is here. Why am I still on hold?" | Vapi | Thought leadership, no product detail |
| Career page additions | Any | Noise |
