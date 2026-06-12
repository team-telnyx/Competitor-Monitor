# Dashboard Process Log

A running log of how the competitor-intelligence dashboard works operationally,
plus decisions and gotchas discovered while building/running it. Append-only;
newest notes at the bottom of each section.

---

## How the inference layer works

The "inference layer" is the LLM step that turns raw scraped pages into
*classified intelligence*. It lives in [tools/inference.py](../tools/inference.py)
and is called by the pipeline in [tools/competitor_monitor.py](../tools/competitor_monitor.py).

### What it does (two LLM jobs)

1. **Classification** (`classify_pages`) — for each competitor, sends *all* of
   that competitor's newly-detected pages to the LLM in **one** chat call, and
   asks for, per page:
   - `relevant` (true/false) — is this about our focus areas?
   - `category` — one of AI Assistants / Inference / STT / TTS / Other AI-Voice / Not Relevant
   - `summary` — one-line competitive-intelligence takeaway

   This is what filters out noise (localized landing pages, bios, legal) and
   assigns the colored category badges in the dashboard.

2. **Digest** (`generate_digest`) — one more chat call across all relevant pages
   to produce the executive summary (the Slack/email digest text).

### Provider design

- Provider-agnostic interface (`InferenceClient` Protocol). Current impl is
  `OpenAIInferenceClient`, hitting OpenAI's `/v1/chat/completions` via plain
  `requests` (no SDK dependency).
- Config via env (read from `local/.env`, see below):
  - `OPENAI_API_KEY` (required)
  - `OPENAI_MODEL` (default `gpt-4o-mini`)
  - `OPENAI_BASE_URL` (default OpenAI; can point at an OpenAI-compatible gateway)
- `get_inference_client()` returns `None` when no key is set. With
  `--require-inference`, a missing key is a hard error (the dashboard Refresh
  button sends `--require-inference`).

### How secrets reach the pipeline

The dashboard backend reads `local/.env` (gitignored) via
`envWithLocalVariables()` in [config.ts](../dashboard/backend/src/config.ts) and
injects those vars into the spawned Python process
([runner.ts](../dashboard/backend/src/runner.ts), `spawn(..., { env })`). So you
do **not** need to restart the API after editing `local/.env` — each run re-reads
it.

---

## End-to-end run flow (Refresh button → dashboard)

```
Refresh button (frontend)
  └─ POST /api/runs { hours, competitor?, requireInference:true, noSlack:true }
       └─ runner.ts spawns: python3 tools/competitor_monitor.py --require-inference ...
            ├─ fetch sitemap(s)         ← network, can be large (sitemap indexes)
            ├─ detect new pages         ← lastmod window OR snapshot diff
            ├─ scrape each new page     ← SEQUENTIAL HTTP GETs (the slow part)
            ├─ classify_pages()         ← 1 LLM call per competitor
            └─ generate_digest()        ← 1 LLM call total, writes JSON artifact
       └─ runner ingests the JSON artifact into SQLite
  └─ frontend polls GET /api/runs/jobs/:id every 2s, refreshes feed on success
```

### Why a run can take a long time

It is mostly **network-bound scraping**, not the LLM:

- **Sitemap size.** Some competitors expose sitemap *indexes* that fan out to
  many child sitemaps (e.g. Google Cloud, ElevenLabs) → thousands of URLs to
  parse before filtering.
- **Sequential page scraping.** Each newly-detected page is fetched one at a
  time with up to a 30s timeout. ElevenLabs alone produced ~140 pages in a
  7-day window; "all competitors" multiplies that. This dominates wall-clock.
- **Look-back window.** Larger `--hours` → more pages qualify → more scraping.
- The LLM step itself is cheap by comparison (1 call per competitor + 1 digest).

**Speed levers:** scope to a single competitor (`competitor` filter), use a
small look-back, or (future work) parallelize page scraping and cap pages per
competitor.

---

## Operational gotchas / incidents

- **2026-06-11 — `insufficient_quota` (429).** After adding a valid
  `sk-proj-...` key, Refresh runs spun for minutes and the log filled with
  `429 Too Many Requests` on every classification call. A direct test call
  returned `error.type = insufficient_quota`. Root cause: the OpenAI account/
  project behind the key has **no usable credits** — the key authenticates
  (not a 401) but cannot spend. Fix is on the OpenAI side: add a payment
  method / credits (or use a project/org key that has budget). No code change
  needed. Until then, runs complete only as *unclassified* data.
- **Stale dev servers.** Backgrounded `npm run dev` processes from earlier
  sessions kept ports 4000/5173 bound, causing `EADDRINUSE` and Vite falling
  back to 5174. Kill old listeners before starting a fresh pair.

---

## Local dev quick reference

```bash
# secrets (gitignored)
local/.env            # OPENAI_API_KEY, OPENAI_MODEL, OPENAI_BASE_URL

# backend (terminal 1)
cd dashboard/backend && npm run dev     # :4000

# frontend (terminal 2)
cd dashboard/frontend && npm run dev    # :5173

# ingest an existing pipeline artifact
cd dashboard/backend && npm run ingest -- <path-to>.json
```
