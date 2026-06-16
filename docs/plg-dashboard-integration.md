# Integrating Competitor-Monitor into `team-telnyx/plg-dashboard`

Status: **Plan (decisions locked) + build in progress** · Owner: Jake · Last updated: 2026-06-12

End state: **the whole system — pipeline, API, and UI — lives in
`team-telnyx/plg-dashboard` (container `plg-ops`) and is maintainable by that team.**
This doc is the consolidation plan and the running status.

---

## 0. The fact that reframes the task

`plg-dashboard` **already has** `app/src/pages/CompetitiveIntelligence.tsx` — route
`/competitive-intelligence`, internal tabs `Feed / Companies / Categories / Training /
Sources` (exactly our surface) — but it's **100% static mock data**. The team
scaffolded the UI shell for our engine. `PLG-67-source-registry.md` (this repo) is the
integration spec; its 9 AI/Voice competitors == the team's narrowed list. So the job is:
**move our engine into their repo, behind that shell, in their conventions.**

---

## 1. Locked decisions

| Decision | Choice | Consequence |
|---|---|---|
| **Pipeline runtime** | **Keep Python as a decoupled worker** (Node port optional, later) | Pipeline stays Python, lives in the repo as `pipeline/`, runs as a **separate job** (Mac Mini cron now → K8s CronJob later) that **writes to Postgres** — **not** baked into the alpine server image. The **DB schema is the contract**, so the language stays swappable. OAuth inference keeps working on the Mini (no `OPENAI_API_KEY` swap until it goes in-cluster). |
| **Backend style** | **Match their conventions** | Plain-JS ESM in `server/`. Read routes query Postgres → cache → serve (their cron→cache→serve pattern); write routes go direct to Postgres. **No Prisma.** |
| **Persistence** | **`competitor_intel` in `pgbot-main-18`** (permanent) | Provisioned via the infra **database-creation skill** (PR `infra-data-pgbot#95`). Telnyx-managed Postgres (CNPG). **No temp DB, no migrate-later** — the schema applies here directly. Creds via Vault + K8s secret `pg-role-competitor-intel`; consumed as `DATABASE_URL`. |

**Language map:** the **pipeline stays Python** (separate worker); the **new `server/`
routes are plain-JS ESM** (their build-less `node index.js`); `app/` stays TS. The repo
is intentionally polyglot — Python worker + JS server + TS frontend, joined by the DB
schema. *Override point:* port the pipeline to Node later if the team wants one toolchain
in-cluster — the DB contract makes that a no-touch change for the dashboard.

**Portability:** standard **`pg` (node-postgres)** / **`psycopg`** + plain SQL only — no
provider-specific drivers/features. Everything behind `DATABASE_URL`.

---

## 2. Target layout inside `plg-dashboard`

```
plg-dashboard/
├── app/
│   └── src/
│       ├── pages/CompetitiveIntelligence.tsx   # rewire: tabs consume API, not UPDATES[]
│       └── services/competitiveApi.ts          # NEW — their raw-fetch pattern
├── server/                                     # plain-JS ESM (their convention)
│   ├── index.js                                # register /api/competitive + health key
│   ├── scheduler.js                            # add refreshCompetitive(): query DB → cache
│   ├── routes/competitive.js                   # NEW — read route (cached)
│   └── db/competitive.js                       # NEW — `pg` read query layer
├── db/migrations/                              # NEW — plain SQL schema (the contract)
├── pipeline/                                   # NEW — the Python worker (kept as-is)
│   ├── requirements.txt
│   ├── competitor_monitor.py                   # crawl + snapshot diff + Atom/RSS
│   ├── inference.py                            # rubric + structured-output classify
│   └── write_db.py                             # NEW — persist run → Postgres (only new bit)
└── (deploy) k8s CronJob / Mac Mini cron        # runs pipeline/ out-of-band → Postgres
```

The pipeline is **not** in the alpine server image — it runs as a separate job. The DB
schema is the seam: pipeline writes, `server/` reads. `tools/` in *this* repo and
`pipeline/` in plg-dashboard are the same code; eventually `pipeline/` is canonical.

---

## 3. Pipeline: kept in Python (the only new code is the DB writer)

The crawler + classifier ship **as-is**. The single addition is `write_db.py`: where the
runner currently writes the Prisma SQLite DB, it instead `INSERT`s the run's
competitors/pages/classifications into Postgres (plain `psycopg`/SQL against the shared
schema). Nothing about crawl/diff/rubric/scoring changes.

- **Inference auth:** runs on the Mac Mini → **ChatGPT-OAuth keeps working** (reads
  `~/.codex/auth.json`). Switch to `OPENAI_API_KEY` only if/when the worker moves
  in-cluster.
- **DB reachability:** `competitor_intel` lives in `pgbot-main-18`. In-cluster (the
  eventual CronJob, and the plg-ops server) reaches it directly with the `pg-role-*`
  secret. The interim Mac Mini worker needs the connection string (Vault) + network path
  to the pgbot query endpoint (VPN) — or just run the worker in-cluster from the start.
- **Scheduling:** its own cadence (hourly/daily) — slower than the server's refresh,
  hits external sites, costs LLM tokens. Decoupled from `server/` entirely.
- **Node port (optional, later):** `requests`+`bs4`→`fetch`+`cheerio`,
  `lxml`→`fast-xml-parser`, snapshot diff→Set diff, `inference.py`→OpenAI Node SDK w/
  JSON-schema output. The DB schema being the contract means this never touches the dashboard.

---

## 4. Domain alignment (mostly already converged)

- **Competitors:** seed to PLG-67's 9 (Vapi, ElevenLabs, Retell AI, Bland AI, Deepgram,
  AssemblyAI, Twilio, OpenAI, Google Cloud) — per-source fetchability + detection method
  + Atom/RSS extras + blocked sources already encoded in `competitor_monitor.py`.
- **Categories:** map our 13-cat taxonomy → PLG-67's **6 tags**
  (`ai_assistants, inference, stt, tts, voice_ai, platform`) for this surface. (Schema
  leaves `classifications.category` free text until this reconciliation is done.)
- **Relevance:** 0–100 rubric already matches their `RelevanceChip` (highlights ≥70) —
  `relevanceScore` / `signalType` pass straight through.

---

## 5. Phasing

### Phase 0 — the contract (DONE)
`db/migrations/0001_init.sql` (read path + catalog) and `0002_write_features.sql`
(feedback/guidance/removal_requests). Validated against real Postgres — applies clean,
CHECK/FK/triggers enforce.

### Phase 1 — Feed / Companies / Categories live (read path)
1. Provision `competitor_intel` in `pgbot-main-18` (PR `infra-data-pgbot#95`); wire
   `DATABASE_URL` (from the `pg-role-competitor-intel` secret) into the server + worker.
2. Apply migrations to the DB.
3. `pipeline/write_db.py`: Python worker writes each run to Postgres (replaces SQLite).
4. `server/db/competitive.js` (read queries) + `scheduler.refreshCompetitive()` queries
   DB → `writeCache('competitive', …)`; folded into the existing 30-min cycle + `/api/refresh`.
5. `routes/competitive.js` (serve from cache) + register in `index.js` + `/api/health`.
6. `app/`: `services/competitiveApi.ts`; rewrite `CompetitiveIntelligence.tsx` Feed/
   Companies/Categories tabs to consume it — Tailwind v4 + CSS vars + lucide + recharts
   (product↔Telnyx map → recharts). Remove `UPDATES[]`.
7. Training/Sources tabs render **read-only** for now.

### Phase 2 — Write features (feedback / guidance / approvals) → Postgres
1. Apply `0002` (already written).
2. Plain-JS write routes: `POST /api/competitive/feedback`, guidance CRUD,
   removal-request approve/reject — direct to Postgres.
3. Pipeline reads guidance / excludes / ignored-subdomains from the DB on each run.
4. CI page Training/Sources tabs go interactive (confirm / flag / recategorize / ignore
   endpoint·subdomain with approval gate).

---

## 6. Build status (this repo)

Staged + validated against real data (bundled Postgres + the latest pipeline run):

| Piece | Where | Status |
|---|---|---|
| SQL schema (the contract) | `db/migrations/{0001–0004}.sql` | ✅ applies clean; constraints enforce |
| Producer DB writer | `tools/write_db.py` | ✅ ingests real run (72 pages/31 relevant); idempotent |
| Read query layer | `integration/server/db/competitive.js` | ✅ correct feed/companies/categories via Node+`pg` |
| Read route | `integration/server/routes/competitive.js` | ✅ (copy of `inference.js` shape) |
| Refresh function | `integration/server/refreshCompetitive.js` | ✅ |
| DB provisioning | `infra-data-pgbot#95` | ⏳ PR open / CI |
| Frontend rewire | `app/services + CompetitiveIntelligence.tsx` + `components/competitive/*` | ✅ staged in `integration/app/` |
| Training loop | `integration/server/db/export-config.js` → pipeline `--config` | ✅ exports DB config (guidance/few-shot/products) |

## 7. Change checklist

**plg-dashboard PR (consumer):**
- [ ] Copy `db/migrations/`, `server/db/competitive.js`, `server/routes/competitive.js`,
      `refreshCompetitive()` into `scheduler.js`.
- [ ] `server/index.js`: register router + `competitive` health key. `server/package.json`: add `pg`.
- [ ] `services/competitiveApi.ts`; rewrite CI page Feed/Companies/Categories; remove `UPDATES[]`.
- [ ] `pipeline/` = the Python worker + `write_db.py`; `DATABASE_URL` wired.

**Coordinate with the team:**
- Polyglot tolerance: a Python worker in an otherwise JS/TS repo.
- Worker scheduling: **decided** — an in-cluster **K8s CronJob** writes the DB; the GH
  Actions `competitor-monitor.yml` (#13) stays a Telegram notifier (see §9). The
  in-cluster move swaps inference auth OAuth → `OPENAI_API_KEY`.

---

## 8. Reusable as-is
The whole Python pipeline (crawl/diff/classify, rubric, PLG-67 registry) ships **as-is**
as the worker — only `write_db.py` is new. The CI page's nav placement, theme, and tab
taxonomy already match ours. The real new code is: the SQL schema, `server/` read/write
routes + cache wiring, and the `CompetitiveIntelligence.tsx` rewire.

---

## 9. Scheduling (decided)
Two independent schedulers by design — they don't overlap:

| Job | Runs on | Purpose | Writes DB? |
|---|---|---|---|
| **K8s CronJob** (in `deploy-plg-app`) | in-cluster | runs the pipeline **and `write_db.py`** → populates the dashboard | ✅ yes (in-cluster → `pgbot-main-18`) |
| **GH Actions** `competitor-monitor.yml` (#13) | GitHub-hosted | runs the monitor → Telegram summary + JSON artifact | ❌ no — kept as a lightweight notifier |

The GitHub-hosted runner can't reach `pgbot-main-18` (in-cluster only) and doesn't run
`write_db.py`, so it stays a notifier; **DB population is the CronJob's job.** The CronJob
command mirrors `pipeline/run-local.sh` — export the DB config (which closes the training
loop), run the worker, ingest:

```bash
node server/db/export-config.js /tmp/config.json
python pipeline/competitor_monitor.py --hours 6 --no-slack --output-dir /tmp/ci --config /tmp/config.json
python pipeline/write_db.py "$(ls -t /tmp/ci/competitor_monitor_*.json | head -1)" --trigger cron --snapshots /tmp/ci/snapshots
```

Manifest sketch (lives in `deploy-plg-app`, not this repo):
```yaml
apiVersion: batch/v1
kind: CronJob
metadata: { name: competitor-monitor }
spec:
  schedule: "0 */6 * * *"          # align with the GH Actions cadence
  concurrencyPolicy: Forbid
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: Never
          containers:
            - name: worker
              image: <pipeline image: Python 3.11 + pg client + node for export-config>
              envFrom: [{ secretRef: { name: pg-role-competitor-intel } }]   # DATABASE_URL
              env:
                - { name: OPENAI_API_KEY, valueFrom: { secretKeyRef: { name: competitor-intel-openai, key: api-key } } }
              command: ["/bin/sh", "-c", "<the three steps above>"]
```
The in-cluster move swaps inference auth from OAuth → `OPENAI_API_KEY` (per §1). The
dashboard's in-app "Run pipeline" button triggers the same command via
`COMPETITIVE_PIPELINE_CMD` (a manual one-off alongside the cron).
