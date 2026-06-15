#!/usr/bin/env python3
"""Persist a competitor_monitor.py run into Postgres.

This is the producer's only new code. It is a faithful port of the TypeScript
ingest (dashboard/backend/src/ingest.ts) that wrote SQLite via Prisma — same
mapping, same dedupe semantics, same candidate-product rule — but writes to the
shared Postgres schema (db/migrations/0001_init.sql) so the plg-dashboard server
can read it. The pipeline itself is unchanged; this just replaces the sink.

Target DB: the `competitor_intel` database in the `pgbot-main-18` cluster
(provisioned via the infra database-creation skill). Credentials arrive as the
K8s secret `pg-role-competitor-intel` / Vault path
`solutions-eng-squad/provided-creds/pgbot/pgbot-main-18/competitor_intel`; pass
the connection string as DATABASE_URL.

Usage:
    DATABASE_URL=postgres://... python tools/write_db.py <pipeline_output.json> [--trigger manual]

Requires: psycopg[binary]  (pip install 'psycopg[binary]')
The DB schema is the contract; keep this in sync with ingest.ts if it changes.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone

import psycopg

VALID_DETECTION = {"snapshot_diff", "lastmod"}


# ── helpers ──────────────────────────────────────────────────────────────────

def _parse_dt(value):
    """Parse an ISO-8601 string (handling a trailing 'Z') to an aware datetime."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def _nz(value):
    """Empty string / falsy → None (so CHECK-constrained cols don't get '')."""
    if value is None:
        return None
    s = str(value).strip()
    return s or None


def _detection_source(page):
    """Mirror ingest.ts detectionSourceFor(): explicit source, else infer lastmod."""
    src = page.get("source")
    if src:
        return src if src in VALID_DETECTION else None
    if page.get("lastmod") or page.get("lastmod_parsed"):
        return "lastmod"
    return None


# ── core ─────────────────────────────────────────────────────────────────────

def ingest_run_data(cur, data: dict, *, trigger: str = "scheduled",
                    slack_status=None, email_status=None, error_summary=None) -> dict:
    """Ingest a parsed pipeline payload using an open cursor. Returns run summary.

    The caller owns the transaction (commit/rollback). Mirrors ingestRunData().
    """
    scan_time = _parse_dt(data.get("scan_time")) or datetime.now(timezone.utc)
    results = data.get("results") or []
    inf = data.get("inference") or {}
    model = ":".join(p for p in (inf.get("provider"), inf.get("model")) if p) or "unknown"

    total_pages = 0
    total_relevant = 0
    any_error = False

    cur.execute(
        """INSERT INTO runs (started_at, finished_at, hours_window, status, "trigger",
                             digest_text, slack_status, email_status, error_summary)
           VALUES (%s, %s, %s, 'running', %s, %s, %s, %s, %s) RETURNING id""",
        (scan_time, scan_time, data.get("hours") or 24, trigger,
         data.get("digest"), slack_status, email_status, error_summary),
    )
    run_id = cur.fetchone()[0]

    for result in results:
        pages = result.get("new_pages") or []
        relevant_count = sum(1 for p in pages
                             if (p.get("classification") or {}).get("relevant") is True)
        total_pages += len(pages)
        total_relevant += relevant_count

        # Competitors are normally seeded; upsert by name so ingest never fails on a
        # newly-reported one. DO UPDATE (no-op) so RETURNING always yields the id.
        cur.execute(
            """INSERT INTO competitors (name) VALUES (%s)
               ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id""",
            (result["competitor"],),
        )
        competitor_id = cur.fetchone()[0]

        comp_had_error = any((p.get("scraped") or {}).get("error") for p in pages)
        if comp_had_error:
            any_error = True

        cur.execute(
            """INSERT INTO run_competitors (run_id, competitor_id, total_sitemap_urls,
                                            new_page_count, relevant_count, checked_at, status)
               VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id""",
            (run_id, competitor_id, result.get("total_sitemap_urls") or 0, len(pages),
             relevant_count, _parse_dt(result.get("checked_at")),
             "partial" if comp_had_error else "success"),
        )
        run_competitor_id = cur.fetchone()[0]

        for page in pages:
            scraped = page.get("scraped") or {}
            cls = page.get("classification") or {}
            lastmod = _parse_dt(page.get("lastmod_parsed") or page.get("lastmod"))

            # Dedupe by (competitor, url): a re-detected URL refreshes content but keeps
            # its original first-seen run/run_competitor so the archive shows one item.
            cur.execute(
                """INSERT INTO pages (run_competitor_id, competitor_id, url, lastmod,
                        detection_source, title, description, text_preview, text_length,
                        first_seen_run_id, scraped_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                   ON CONFLICT (competitor_id, url) DO UPDATE SET
                        title        = COALESCE(EXCLUDED.title,        pages.title),
                        description  = COALESCE(EXCLUDED.description,  pages.description),
                        text_preview = COALESCE(EXCLUDED.text_preview, pages.text_preview),
                        text_length  = COALESCE(EXCLUDED.text_length,  pages.text_length),
                        lastmod      = COALESCE(EXCLUDED.lastmod,      pages.lastmod),
                        scraped_at   = EXCLUDED.scraped_at
                   RETURNING id""",
                (run_competitor_id, competitor_id, page["url"], lastmod,
                 _detection_source(page), _nz(scraped.get("title")),
                 _nz(scraped.get("description")), _nz(scraped.get("text_preview")),
                 scraped.get("text_length"), run_id, scan_time),
            )
            page_id = cur.fetchone()[0]

            cur.execute(
                """INSERT INTO classifications (page_id, relevant, relevance_score, signal_type,
                        product, category, summary, reasoning, rubric_version, model)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                   ON CONFLICT (page_id) DO UPDATE SET
                        relevant=EXCLUDED.relevant, relevance_score=EXCLUDED.relevance_score,
                        signal_type=EXCLUDED.signal_type, product=EXCLUDED.product,
                        category=EXCLUDED.category, summary=EXCLUDED.summary,
                        reasoning=EXCLUDED.reasoning, rubric_version=EXCLUDED.rubric_version,
                        model=EXCLUDED.model""",
                (page_id, cls.get("relevant") is True, cls.get("relevance_score"),
                 _nz(cls.get("signal_type")), _nz(cls.get("product")), _nz(cls.get("category")),
                 _nz(cls.get("summary")), _nz(cls.get("reasoning")),
                 _nz(cls.get("rubric_version")), model),
            )

            # Unknown product the model named → a candidate for operator review
            # (docs/inference-training.md §3). Never overwrites a confirmed product.
            if cls.get("product") and cls.get("product_known") is False:
                cur.execute(
                    """INSERT INTO products (competitor_id, name, category, status, first_seen_page_id)
                       VALUES (%s, %s, %s, 'candidate', %s)
                       ON CONFLICT (competitor_id, name) DO NOTHING""",
                    (competitor_id, cls["product"], _nz(cls.get("category")), page_id),
                )

    cur.execute("UPDATE runs SET status=%s WHERE id=%s",
                ("partial" if any_error else "success", run_id))

    return {"run_id": run_id, "pages": total_pages, "relevant": total_relevant}


def ingest_run_file(path: str, dsn: str | None = None, **opts) -> dict:
    """Read a pipeline JSON artifact and ingest it in one transaction."""
    dsn = dsn or os.environ.get("DATABASE_URL")
    if not dsn:
        raise SystemExit("DATABASE_URL not set (and no dsn passed)")
    with open(path, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    with psycopg.connect(dsn) as conn:
        with conn.cursor() as cur:
            summary = ingest_run_data(cur, data, **opts)
        conn.commit()
    return summary


def main(argv=None):
    ap = argparse.ArgumentParser(description="Ingest a pipeline run into Postgres/Neon.")
    ap.add_argument("path", help="path to competitor_monitor.py output JSON")
    ap.add_argument("--trigger", choices=["scheduled", "manual"], default="scheduled")
    ap.add_argument("--dsn", default=None, help="override DATABASE_URL")
    args = ap.parse_args(argv)

    summary = ingest_run_file(args.path, dsn=args.dsn, trigger=args.trigger)
    print(f"run {summary['run_id']}: {summary['pages']} pages, "
          f"{summary['relevant']} relevant")
    return 0


if __name__ == "__main__":
    sys.exit(main())
