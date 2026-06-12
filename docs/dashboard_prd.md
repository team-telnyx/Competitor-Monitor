# PRD: Competitor Intelligence Dashboard

**Status:** Living (Phase 1 + Training Phases A–C shipped; see §9)
**Author:** Jake Johnson (jakej@telnyx.com)
**Created:** 2026-06-10 · **Updated:** 2026-06-12
**Related:** [Competitor Monitor tool](../tools/competitor_monitor.py) · [Pipeline reference](./pipeline-reference.md) · [Inference Training & Relevance Policy](./inference-training.md) · [Generated relevance policy](./relevance-policy.md)

---

## 1. Summary

The Competitor Monitor scrapes competitor sitemaps, detects new pages, classifies them for AI/voice relevance, generates an executive digest, and pushes it to Slack/email. The dashboard gives that data a persistent, queryable home and adds the surfaces the daily push can't: history, search, analytics, **operator-driven classification refinement**, and a **competitor↔Telnyx product comparison**.

It serves four jobs in one product:

1. **Browsable intel feed** — every detected update, scored, searchable, filterable across all history.
2. **Monitoring ops console** — pipeline health, errors, manual run triggers, source/competitor management.
3. **Competitive analysis** — per-category trends and a per-competitor offering map vs Telnyx.
4. **Classification refinement ("training")** — operators correct, score, and tune what the inference layer considers relevant; that feedback measurably changes future runs.

The Slack digest remains the daily *push*; the dashboard is the durable *pull* + *control* surface behind it.

> **Inference note:** classification/digests run through the project's pluggable inference layer ([inference.py](../tools/inference.py)). It currently uses **OpenAI's models** — either an OpenAI API key, or a ChatGPT subscription via the Codex "Sign in with ChatGPT" OAuth path (default model `gpt-5.4-mini`). (Earlier drafts referenced Claude; that is no longer accurate.)

## 2. Background & problem

The pipeline ([`run_monitor`](../tools/competitor_monitor.py)) produces rich structured output per run, historically written to `.tmp/competitor_monitor_<timestamp>.json` and Slack, then effectively lost. The original gaps — no history, no search, no observability, no trends, no control surface — are addressed by Phase 1 (now shipped).

A second class of problem emerged once the dashboard was live: **classification quality and trust.**

- The boolean `relevant` flag over-surfaced noise — customer stories, webinars, and careers pages were counted as "relevant."
- There was no notion of **how strongly** a page signals a new product/feature, so nothing downstream (alerts, automations) could gate on confidence.
- Operators had **no way to correct** a misclassification, mute a noisy site section, or steer the model — and no mechanism to make a correction *stick* across future runs.
- Product/category recognition was free-form and drifted run to run.

The **training/refinement** capability (§5.4) exists to close that gap deterministically; see [inference-training.md](./inference-training.md) for the full design.

## 3. Goals & non-goals

### Goals
- Persist all monitor runs and detected pages in a queryable datastore (the DB, not `.tmp` JSON, is the source of truth). *(Shipped)*
- Browsable, searchable, filterable **feed** of every classified update, showing a 0–100 relevance score, signal type, product, and category. *(Shipped)*
- **Relevance scoring** with a fixed, versioned rubric so downstream automations can gate on confidence. *(Shipped)*
- **Operator refinement loop:** flag/correct classifications with reasons, confirm candidate products, add plain-text guidance, and remove noisy endpoints/subdomains — all feeding the next run. *(Shipped, Phases A–C)*
- **Source/competitor management** without editing Python: competitors, sources, include/exclude rules, detection method, ignored subdomains. *(Shipped)*
- **Competitor↔Telnyx offering map:** inference-generated, operator-editable comparison of each competitor's products against Telnyx's. *(Planned)*
- **Category browse + trends.** *(Planned)*
- Ops console: run history, per-competitor health, error surfacing, manual trigger. *(Partial)*
- Role-gated **admin** actions (approvals, editing the Telnyx map, eventually classification overrides). *(Planned)*

### Non-goals (v1)
- Replacing the scraping/classification pipeline — the dashboard is the source of truth for *config* (competitors/sources/products/rules) and the pipeline reads it; detection/scraping logic is unchanged.
- Real-time streaming — daily/on-demand cadence is sufficient.
- **Multi-tenant / external customers** — internal Telnyx tool; no tenant isolation in the data model.
- ~~Editing or annotating classifications by hand~~ → **now in scope** (the training capability; see §5.4).

## 4. Audiences & personas

| Persona | Role | Primary surface | Needs |
|---|---|---|---|
| **Product leadership** | Consume intelligence | Feed · Competitors · Categories | Skimmable, trustworthy, fast to "what changed and why it matters" |
| **Analyst / operator** | Refine & operate | Training · Sources · Ops | Correct misclassifications, tune relevance, manage sources, trigger runs |
| **Admin** (subset of operators; *group TBD*) | Approve & govern | Approvals · Telnyx map | Approve removals, edit the competitor↔Telnyx map, (later) override classifications |

The **admin** boundary is not yet enforced — today every user can perform admin actions (e.g. approving removals). The role gate is a planned addition; the workflows are already shaped around it (e.g. `requestedBy`/`resolvedBy` on removal requests).

## 5. Scope, navigation & key flows

The app is organized as a top-nav with five surfaces (plus a gated Ops area):

```
Feed · Competitors · Categories · Training · Sources
```

### 5.1 Feed  *(Shipped — was "Archive")*
- Reverse-chronological feed of updates across all competitors.
- Each card shows: **relevance score (0–100) + signal type** (new_product / new_feature / update / tangential / irrelevant), category badge (color map below), competitor, **product**, Claude/LLM one-line summary, the page **endpoint**, detected date.
- An inline **"remove from consideration"** control per card: drops a noisy **endpoint** (path) or **subdomain** via the approval workflow (§5.4).
- Filters: competitor, category, date range, detection source, relevance (≥ threshold). Full-text search across title/description/summary/preview.
- Item detail drawer: full scraped preview, classification + **reasoning**, score/signal/product, which run detected it.
- **Category taxonomy** (unified, covers Telnyx's full product surface; canonical list in [db.ts](../dashboard/backend/src/db.ts) + [inference.py](../tools/inference.py)): **AI Assistants, Inference, STT, TTS, Voice, Messaging, Numbers, Identity, Fax, IoT, Networking, Storage, Other** (+ Not Relevant). Each has a color in the shared map. This taxonomy drives classification, the Categories tab, the offering map, and the product registry — so competitors in any of these areas slot in.

### 5.2 Competitors  *(Planned)*
A per-competitor intelligence view with two halves:

1. **Recent high-relevance activity** — each competitor's newest `new_product`/`new_feature` items (score ≥ 70), shipping cadence, and a momentum indicator. Read-oriented; links into the Feed.
2. **Offering map vs Telnyx** — a comparison matrix of the competitor's product offerings against Telnyx's, by focus area (AI Assistants / Inference / STT / TTS / Other):
   - **Inference-generated** initial mapping (the model proposes each competitor product's Telnyx counterpart and a parity verdict — e.g. *parity / gap / Telnyx ahead / competitor ahead / no equivalent* — with a one-line rationale).
   - **Operator-editable** — verdicts, counterparts, and notes can be corrected; edits are sticky and override the generated values.
   - **Admin-gated (eventually)** — editing the map becomes an admin action once roles exist; until then anyone can edit.
   - Sourced from the existing per-competitor **product registry** (§5.4) on one axis and the **Telnyx offerings catalog** on the other (§6) — seeded (31 offerings) from [telnyx.com/products](https://telnyx.com/products), maintained from this tab.

### 5.3 Categories  *(Planned)*
- Pick a category (AI Assistants / Inference / STT / TTS / Other) and see its **feed across all competitors** plus **trend over time** (volume + momentum).
- Surfaces "which area is heating up across the field" and who's driving it.
- Effectively the category slice of the analytics hub, fronted as a browse view.

### 5.4 Training  *(Shipped — Phases A–C; see [inference-training.md](./inference-training.md))*
The operator's refinement console. Determinism comes from scaffolding the LLM, not the model.

- **Review queue** — **mirrors the Feed** (scored, relevant items, newest first, paginated; reviewed items flagged) so operators can review the whole set and establish a baseline. Per item: **Confirm**, **Flag irrelevant** (+ reason category + note), **Recategorize**, **Fix product**. Actions apply an **immediate correction** to the page and record durable `feedback`. (A borderline/"needs attention" filter can layer on later.)
- **Candidate products** — unknown product names the classifier surfaced; confirm (adds to the registry, locks future categorization) or reject.
- **Inference guidance** — free-text notes injected into the next run's classify prompt. **Scope = Global** (every competitor) or a specific competitor. *(Global is the default in the Scope dropdown; it is simply guidance with no competitor attached.)*
- **Pending removals (approvals)** — endpoint/subdomain removal requests from cards; **approve** adds an endpoint to the competitor's `excludePatterns` or a subdomain to its `ignoredSubdomains` (both visible in Sources); **reject** discards. Approval is open today; admin-gated later.
- **How feedback reaches the model:** per-competitor **few-shot examples** (recent corrections) + **guidance** + deterministic **rules** (ignored subdomains, exclude patterns, product/category locks) are exported by the runner into the pipeline config and injected/applied on the next run. Examples and per-competitor guidance are **scoped to that competitor**; only Global guidance crosses competitors.

### 5.5 Sources  *(Shipped)*
- Per-competitor management of **sources** (sitemap/feed URLs), **include/exclude patterns**, **ignored subdomains**, **detection method** (lastmod vs snapshot-diff), and active toggle. Add/remove sources; add new competitors; guarded delete.
- The dashboard is the source of truth: active competitors/sources/rules/products are exported to the pipeline on each run.

### 5.6 Ops console  *(Partial)*
- Run history (timestamp, look-back, competitors checked, new/relevant counts, status). Per-competitor **health** (last check, last new page, consecutive-zero "possible silent breakage" flag). Error surfacing. **Manual trigger** (async job + status polling; mirrors CLI flags). Auth + role gating *(planned)*.

### 5.7 Slack ↔ dashboard  *(Planned)*
- Slack digest blocks gain "View in dashboard" deep links (run + per-item). Dashboard surfaces digest delivery status. Existing Slack push behavior preserved.

## 6. Data model

Relational store. Built on **SQLite via Prisma** for zero-setup local dev; portable to **Postgres** (flip the datasource provider; JSON-encoded `string[]` columns become `jsonb`). Shipped tables unless marked.

- **`competitors`** — `id, name, sitemap_urls, include_patterns, exclude_patterns, ignored_subdomains, use_snapshot_diff, active, timestamps`
- **`runs`** — `id, started_at, finished_at, hours_window, status, trigger, digest_text, slack_status, email_status, error_summary`
- **`run_competitors`** — per-competitor result within a run (`total_sitemap_urls, new_page_count, relevant_count, checked_at, status, error`)
- **`pages`** — `id, run_competitor_id, competitor_id, url, lastmod, detection_source, title, description, text_preview, text_length, first_seen_run_id, scraped_at` (deduped by `(competitor_id, url)`)
- **`classifications`** — `id, page_id, relevant, relevance_score, signal_type, product, category, summary, reasoning, model, rubric_version, classified_at`
- **`products`** — per-competitor registry: `id, competitor_id, name, category, aliases, status (active|candidate|deprecated), first_seen_page_id, timestamps`
- **`feedback`** — operator actions: `id, page_id, competitor_id, action, reason_category, reason, operator, created_at`
- **`guidance`** — `id, competitor_id (nullable = global), text, active, operator, created_at`
- **`removal_requests`** — approval workflow: `id, competitor_id, kind (endpoint|subdomain), value, host, status (pending|approved|rejected), requested_by, resolved_by, page_id, timestamps`
- **`snapshots`** — sitemap baselines for snapshot-diff competitors
- **`telnyx_offerings`** *(Planned)* — `id, name, category, description` — the Telnyx side of the §5.2 comparison.
- **`offering_comparisons`** *(Planned)* — `id, competitor_id, focus_area, competitor_product_id?, telnyx_offering_id?, verdict (parity|gap|telnyx_ahead|competitor_ahead|none), rationale, source (inference|manual), edited_by, timestamps`.

## 7. Architecture

Decoupled **React frontend + JSON API**, as built:

- **Backend API:** **Express + TypeScript + Prisma** ([dashboard/backend](../dashboard/backend)). Owns the DB; triggers pipeline runs by spawning the Python scraper and ingesting its JSON artifact. *(PRD originally proposed FastAPI; the implementation is Express/Node.)*
- **Pipeline integration:** the runner **exports active DB config** (competitors, sources, rules, products, guidance, few-shot examples) to a JSON file the pipeline reads via `--config`; the CLI still works standalone with its built-in list as a fallback. The pipeline writes a JSON artifact that the backend ingests.
- **Inference:** pluggable layer ([inference.py](../tools/inference.py)) — OpenAI API key **or** ChatGPT-OAuth (Codex) provider; rubric-driven structured scoring + product canonicalization + threshold-based relevance.
- **Frontend:** **React (Vite + TS)** with React Router + React Query ([dashboard/frontend](../dashboard/frontend)). Charting lib (e.g. Recharts) for Categories/Competitors analytics *(planned)*.
- **Python interpreter:** backend resolves `PYTHON_BIN` → repo `.venv` → `python3` so the spawned pipeline has its deps.
- **Auth:** SSO/Google or a gateway; role gate for admin actions *(planned)*.

### Representative API surface (shipped unless noted)
```
GET  /api/pages | /api/pages/:id                         # feed + detail (score/signal/product/reasoning)
POST /api/pages/:id/feedback                             # flag/recategorize/reassign/confirm (+ immediate correction)
GET  /api/feedback/queue                                 # training review queue (mirrors the feed; paginated)
GET/POST/PATCH/DELETE /api/competitors (+ /sources,      # source & competitor management
     /ignored-subdomains)
GET/POST/PATCH/DELETE /api/products                      # product registry + candidate confirm
GET/POST/PATCH/DELETE /api/guidance                      # inference guidance (global/per-competitor)
GET  /api/removal-requests ; POST :id/approve | :id/reject   # endpoint/subdomain removal approvals
POST /api/policy/regenerate                              # rewrite docs/relevance-policy.md from DB
POST /api/runs ; GET /api/runs/jobs/:id                  # manual run trigger + poll
GET  /api/analytics/activity | /api/analytics/heatmap    # (partial) time-series + heatmap
GET  /api/telnyx-offerings ; GET/PATCH /api/offering-comparisons   # (planned) §5.2 map
```

## 8. Success metrics
- "What did competitor X ship in period Y" drops from grep to a filtered query. *(met)*
- 100% of runs/pages persisted and retrievable. *(met)*
- **Precision:** share of feed items at score ≥ threshold that an operator confirms as genuinely relevant trends up as feedback accrues.
- **Refinement throughput:** the feed gets reviewed (share of items with operator feedback rises); corrections measurably shift the next run (fewer repeat flags for the same pattern).
- Silent-breakage detection: operators alerted to a competitor returning 0 for N consecutive runs.
- Operators add/edit competitors, sources, rules, and the Telnyx map without touching Python.

## 9. Phasing

**Shipped**
- **Phase 1 — Persistence + Feed.** DB + API; pipeline reads DB config; feed with filters/search + detail.
- **Training A — Scoring.** Rubric (v1, threshold 40), 0–100 score + signal types, product registry + canonicalization, schema.
- **Training B — Feedback capture.** Training review queue, feedback endpoints + immediate correction, candidate products, scores surfaced on the feed.
- **Training C — Feedback → runs.** Plain-text guidance (global/per-competitor) + few-shot injection + endpoint/subdomain removal approval workflow + generated `relevance-policy.md`.
- **Unified taxonomy + tabs.** Category taxonomy expanded to Telnyx's full product surface; **Categories tab** (browse + trends), **Competitors tab** (recent high-relevance activity), and the **Telnyx offerings catalog** (`telnyx_offerings`/`offering_comparisons`, seeded with 31 offerings).

**Planned**
- **Competitors offering map** — the editable comparison matrix + inference-generated parity verdicts (foundation shipped; needs the matrix UI + generation step).
- **Categories tab** — richer momentum/leaderboard analytics on top of the current browse + trend.
- **Ops console** completion + **auth/role gating** (the admin boundary for approvals, Telnyx-map editing, and eventual classification overrides).
- **Automations (Training D)** — downstream actions that consume `relevance_score` (e.g. alerts/tickets on high-confidence new products), confidence-gated to route uncertain items to the queue.
- **Slack deep links** + delivery status.

## 10. Open questions
- **Telnyx offerings source** — curate a seed catalog for the §5.2 map, or pull from an existing internal source of truth? Who owns keeping it current?
- **Offering-map generation** — generate the comparison on demand, per run, or on a schedule? How much page context does the model need to judge parity reliably?
- **Admin/role model** — who is an admin (approvals, Telnyx-map edits, classification overrides)? Auth provider (Telnyx Google SSO vs gateway)?
- **Hosting/deploy** — internal infra vs managed host; Postgres migration timing.
- **Backfill & retention** — replay historical `.tmp/*.json`? Age out raw `text_preview` after N months?
- **Rubric governance** — who can change the threshold / rubric version, and how is a re-score of historical items handled?
