#!/usr/bin/env python3
"""Bootstrap the DB (the source of truth) with each competitor's sources + detection
method from the pipeline's built-in COMPETITORS config.

The dashboard seeds competitors by name but not their sitemap sources, so a DB-driven
`--config` export would be empty. Run this once after seeding so the DB carries
sitemap_urls / include_patterns / use_snapshot_diff; thereafter operators maintain them
in the Sources tab. Operator-added exclude_patterns / ignored_subdomains are preserved
(unioned with the built-in defaults), never clobbered.

    DATABASE_URL=postgres://… python tools/sync_competitor_config.py
"""
import json
import os
import sys

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from competitor_monitor import COMPETITORS  # noqa: E402


def _union(a, b):
    return list(dict.fromkeys((a or []) + (b or [])))


def main():
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        raise SystemExit("DATABASE_URL not set")
    updated, missing = 0, []
    with psycopg.connect(dsn) as conn, conn.cursor() as cur:
        for c in COMPETITORS:
            name = c["name"]
            cur.execute("SELECT exclude_patterns, ignored_subdomains FROM competitors WHERE name=%s", (name,))
            row = cur.fetchone()
            if not row:
                missing.append(name)
                continue
            excl = _union(c.get("exclude_patterns"), row[0])
            ign = _union(c.get("ignored_subdomains"), row[1])
            cur.execute(
                """UPDATE competitors
                      SET sitemap_urls=%s, include_patterns=%s, exclude_patterns=%s,
                          ignored_subdomains=%s, use_snapshot_diff=%s
                    WHERE name=%s""",
                (json.dumps(c.get("sitemap_urls", [])), json.dumps(c.get("include_patterns", [])),
                 json.dumps(excl), json.dumps(ign), bool(c.get("use_snapshot_diff", False)), name),
            )
            updated += 1
        conn.commit()
    print(f"synced sources/detection for {updated} competitors" + (f"; not in DB: {missing}" if missing else ""))


if __name__ == "__main__":
    main()
