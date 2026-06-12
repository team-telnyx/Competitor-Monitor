#!/usr/bin/env python3
"""
Competitor Monitor Tool — AI/Voice Product Intelligence

Monitors competitor sitemaps, changelogs, blogs, docs, and release notes
for new content related to AI assistants, inference, STT/TTS.

Detects new pages via lastmod dates or snapshot diffs, scrapes content,
then uses LLM-based classification to filter for AI/voice relevance
and generate categorized summaries.
"""

import argparse
import json
import os
import re
import sys
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

from inference import (
    RUBRIC_VERSION,
    canonicalize_product,
    describe_active_client,
    get_inference_client,
    score_to_relevant,
)

REPO_ROOT = Path(__file__).resolve().parent.parent


def load_environment(repo_root=REPO_ROOT, include_cwd=True):
    """Load local, non-committed environment variables for the pipeline."""
    load_dotenv(repo_root / "local" / ".env")
    load_dotenv(repo_root / ".env")
    if include_cwd:
        load_dotenv()  # also check cwd


load_environment()


# =============================================================================
# Focus areas for AI/voice product intelligence
# =============================================================================

FOCUS_AREAS = [
    "AI Assistants — voice agents, conversational AI, virtual assistants, agent frameworks",
    "Inference — LLM hosting, model serving, embeddings, real-time inference, API endpoints, latency",
    "STT (Speech-to-Text) — transcription, ASR, real-time speech recognition, diarization",
    "TTS (Text-to-Speech) — voice synthesis, voice cloning, audio generation, voice models",
    "Voice — SIP trunking, voice APIs, TeXML, WebRTC, call control, telephony infrastructure",
    "Messaging — SMS/MMS, RCS, WhatsApp, short codes, 10DLC, A2P messaging",
    "Numbers — phone number provisioning, global/toll-free numbers, porting",
    "Identity — number lookup, caller ID, verification/2FA",
    "Fax — fax APIs and services",
    "IoT — SIM/eSIM, cellular connectivity, mobile data",
    "Networking — programmable networking, VPN, edge routing, private connectivity",
    "Storage — object/cloud storage",
]

# =============================================================================
# Competitor configurations
# =============================================================================

COMPETITORS = [
    # --- Direct voice AI competitors ---
    {
        "name": "Vapi",
        "sitemap_urls": ["https://vapi.ai/sitemap.xml"],
        "include_patterns": [],
        "exclude_patterns": [r"/legal/", r"/terms", r"/privacy", r"/careers"],
        "use_snapshot_diff": True,
    },
    {
        "name": "ElevenLabs",
        "sitemap_urls": ["https://elevenlabs.io/sitemap.xml"],
        "include_patterns": [
            r"elevenlabs\.io/blog",
            r"elevenlabs\.io/docs/changelog",
            r"elevenlabs\.io/docs/api-reference",
            r"elevenlabs\.io/[^/]+$",  # top-level product pages
        ],
        "exclude_patterns": [
            r"/careers/", r"/legal/", r"/terms", r"/privacy",
            r"/languages/", r"/community/", r"/voice-library/",
        ],
    },
    {
        "name": "Retell AI",
        "sitemap_urls": ["https://www.retellai.com/sitemap.xml"],
        "include_patterns": [
            r"/blog/", r"/changelog", r"/docs/",
            r"retellai\.com/[^/]+$",
        ],
        "exclude_patterns": [r"/legal/", r"/terms", r"/privacy", r"/careers"],
        "use_snapshot_diff": True,
    },
    {
        "name": "Bland AI",
        # Has lastmod
        "sitemap_urls": ["https://www.bland.ai/sitemap.xml"],
        "include_patterns": [],
        "exclude_patterns": [r"/legal/", r"/terms", r"/privacy", r"/careers"],
    },
    # --- Transcription / audio AI ---
    {
        "name": "AssemblyAI",
        # No lastmod
        "sitemap_urls": ["https://www.assemblyai.com/sitemap.xml"],
        "include_patterns": [
            r"/blog/", r"/changelog", r"/docs/",
            r"assemblyai\.com/[^/]+$",
        ],
        "exclude_patterns": [
            r"/careers/", r"/legal/", r"/terms", r"/privacy",
        ],
        "use_snapshot_diff": True,
    },
    # --- Platform competitors (filtered to AI/voice) ---
    {
        "name": "Twilio",
        # Has lastmod
        "sitemap_urls": ["https://www.twilio.com/sitemap.xml"],
        "include_patterns": [
            r"twilio\.com/en-us/blog/",
            r"twilio\.com/en-us/changelog",
            r"twilio\.com/en-us/press/",
        ],
        "exclude_patterns": [],
    },
    # --- AI inference / compute platforms ---
    {
        "name": "Together AI",
        "sitemap_urls": ["https://www.together.ai/sitemap.xml"],
        "include_patterns": [
            r"together\.ai/blog/",
            r"together\.ai/(serverless-inference|dedicated-inference|fine-tuning|batch-inference|gpu-clusters|models|pricing)",
        ],
        "exclude_patterns": [r"/careers", r"/legal", r"/terms", r"/privacy"],
        "use_snapshot_diff": True,
    },
    {
        "name": "Baseten",
        "sitemap_urls": ["https://www.baseten.co/sitemap.xml"],
        "include_patterns": [
            r"baseten\.co/blog/",
            r"baseten\.co/resources/changelog/",
            r"baseten\.co/(products|platform|solutions)/",
        ],
        "exclude_patterns": [
            r"/blog/category/", r"/author/",
            r"/careers", r"/legal", r"/terms", r"/privacy",
        ],
        "use_snapshot_diff": True,
    },
    {
        "name": "Fireworks AI",
        "sitemap_urls": ["https://fireworks.ai/sitemap.xml"],
        "include_patterns": [
            r"fireworks\.ai/blog/",
            r"fireworks\.ai/(platform|usecases)/",
        ],
        "exclude_patterns": [
            r"/careers", r"/team", r"/events/",
            r"/legal", r"/terms", r"/privacy",
        ],
        "use_snapshot_diff": True,
    },
    {
        "name": "RunPod",
        "sitemap_urls": ["https://www.runpod.io/sitemap.xml"],
        "include_patterns": [
            r"runpod\.io/blog/",
            r"runpod\.io/articles/",
        ],
        "exclude_patterns": [
            r"/blog-post-author/", r"/articles/author/",
            r"/careers", r"/legal", r"/terms", r"/privacy",
        ],
        "use_snapshot_diff": True,
    },
    {
        "name": "Modal",
        # Modal publishes no sitemap.xml, but its blog exposes a dated Atom feed.
        # parse_atom_feed() normalizes entries to {url, lastmod}, so Modal uses
        # standard lastmod time-window detection like the other feed/sitemap sites.
        "sitemap_urls": ["https://modal.com/blog/atom.xml"],
        "include_patterns": [],
        "exclude_patterns": [r"/careers", r"/legal", r"/terms", r"/privacy"],
    },
    {
        "name": "Replicate",
        # sitemap.xml is a sitemap index (content/static/models child sitemaps);
        # fetch_sitemap recurses into children automatically.
        "sitemap_urls": ["https://replicate.com/sitemap.xml"],
        "include_patterns": [
            r"replicate\.com/blog",
            r"replicate\.com/changelog",
            r"replicate\.com/docs",
        ],
        "exclude_patterns": [r"/careers", r"/legal", r"/terms", r"/privacy"],
        "use_snapshot_diff": True,
    },
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}

# XML namespace for sitemaps
SM_NS = "http://www.sitemaps.org/schemas/sitemap/0.9"


# =============================================================================
# Sitemap parsing
# =============================================================================

def _find(parent, local_name):
    """Find child element with or without namespace."""
    el = parent.find(f"{{{SM_NS}}}{local_name}")
    if el is None:
        el = parent.find(local_name)
    return el


def _findall(parent, local_name):
    """Find all child elements with or without namespace."""
    els = parent.findall(f"{{{SM_NS}}}{local_name}")
    if not els:
        els = parent.findall(local_name)
    return els


def _local(el):
    """Local tag name with any XML namespace stripped."""
    return el.tag.split("}")[-1] if "}" in el.tag else el.tag


def parse_atom_feed(root):
    """Parse an Atom feed (<feed><entry>) into {url, lastmod} entries.

    Used for competitors that publish a blog/news feed but no sitemap (e.g. Modal).
    The <updated>/<published> timestamp acts as the page's lastmod, so feed-backed
    competitors can use the normal lastmod time-window filtering.
    """
    entries = []
    for entry in (e for e in root if _local(e) == "entry"):
        href = None
        for child in entry:
            if _local(child) != "link":
                continue
            rel = child.get("rel", "alternate")
            if child.get("href") and rel in ("alternate", ""):
                href = child.get("href")
                break
        updated = None
        for key in ("updated", "published"):
            el = next((c for c in entry if _local(c) == key and c.text), None)
            if el is not None:
                updated = el.text.strip()
                break
        if href:
            entries.append({"url": href.strip(), "lastmod": updated})
    return entries


def parse_rss_feed(root):
    """Parse an RSS feed (<rss><channel><item>) into {url, lastmod} entries."""
    entries = []
    for channel in (c for c in root if _local(c) == "channel"):
        for item in (i for i in channel if _local(i) == "item"):
            link = next((c.text.strip() for c in item if _local(c) == "link" and c.text), None)
            pub = next((c.text.strip() for c in item if _local(c) == "pubDate" and c.text), None)
            if link:
                entries.append({"url": link, "lastmod": pub})
    return entries


def fetch_sitemap(url, timeout=30):
    """Fetch and parse a sitemap XML file. Returns list of URL entries."""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=timeout)
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f"  Warning: Could not fetch sitemap {url}: {e}", file=sys.stderr)
        return []

    try:
        root = ET.fromstring(resp.content)
    except ET.ParseError as e:
        print(f"  Warning: Could not parse sitemap {url}: {e}", file=sys.stderr)
        return []

    tag = root.tag.split("}")[-1] if "}" in root.tag else root.tag

    # Handle sitemap index (contains links to other sitemaps)
    if tag == "sitemapindex":
        child_sitemaps = []
        for sitemap_el in _findall(root, "sitemap"):
            loc = _find(sitemap_el, "loc")
            if loc is not None and loc.text:
                child_sitemaps.append(loc.text.strip())

        print(f"  Found sitemap index with {len(child_sitemaps)} child sitemaps")
        all_entries = []
        for child_url in child_sitemaps:
            all_entries.extend(fetch_sitemap(child_url, timeout))
        return all_entries

    # Handle Atom / RSS feeds (for competitors with a blog feed but no sitemap)
    if tag == "feed":
        return parse_atom_feed(root)
    if tag == "rss":
        return parse_rss_feed(root)

    # Handle regular sitemap (contains URL entries)
    entries = []
    for url_el in _findall(root, "url"):
        loc = _find(url_el, "loc")
        lastmod = _find(url_el, "lastmod")

        entry = {
            "url": loc.text.strip() if loc is not None and loc.text else None,
            "lastmod": lastmod.text.strip() if lastmod is not None and lastmod.text else None,
        }
        if entry["url"]:
            entries.append(entry)

    return entries


def parse_lastmod(lastmod_str):
    """Parse a sitemap lastmod string into a timezone-aware datetime."""
    if not lastmod_str:
        return None

    formats = [
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%S.%f%z",
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%dT%H:%M:%S.%fZ",
        "%Y-%m-%d",
    ]

    for fmt in formats:
        try:
            dt = datetime.strptime(lastmod_str, fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except ValueError:
            continue

    try:
        from dateutil.parser import parse as dateutil_parse
        dt = dateutil_parse(lastmod_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        pass

    return None


# =============================================================================
# Snapshot-based change detection
# =============================================================================

def load_snapshot(name, snapshot_dir=".tmp/snapshots"):
    """Load the previous sitemap snapshot for a competitor."""
    path = Path(snapshot_dir) / f"{name.lower().replace(' ', '_')}_sitemap.json"
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text())
        return set(data.get("urls", []))
    except (json.JSONDecodeError, KeyError):
        return None


def save_snapshot(name, urls, snapshot_dir=".tmp/snapshots"):
    """Save the current sitemap URLs as a snapshot for next comparison."""
    path = Path(snapshot_dir)
    path.mkdir(parents=True, exist_ok=True)
    safe_name = name.lower().replace(" ", "_")
    snapshot_file = path / f"{safe_name}_sitemap.json"
    snapshot_file.write_text(json.dumps({
        "urls": sorted(urls),
        "saved_at": datetime.now(timezone.utc).isoformat(),
        "count": len(urls),
    }, indent=2))
    print(f"  Snapshot saved: {len(urls)} URLs -> {snapshot_file}")


def diff_snapshot(name, current_entries, include_patterns=None, exclude_patterns=None, snapshot_dir=".tmp/snapshots", ignored_subdomains=None):
    """Compare current sitemap URLs against the previous snapshot."""
    current_urls = {e["url"] for e in current_entries}
    previous_urls = load_snapshot(name, snapshot_dir)

    if previous_urls is None:
        print(f"  No previous snapshot found for {name}. Saving baseline.")
        save_snapshot(name, current_urls, snapshot_dir)
        return []

    new_urls = current_urls - previous_urls
    removed_urls = previous_urls - current_urls

    if removed_urls:
        print(f"  {len(removed_urls)} URLs removed since last run")

    save_snapshot(name, current_urls, snapshot_dir)

    if not new_urls:
        return []

    new_entries = []
    for entry in current_entries:
        if entry["url"] not in new_urls:
            continue

        url = entry["url"]
        if host_is_ignored(url, ignored_subdomains):
            continue
        if include_patterns and not any(re.search(p, url) for p in include_patterns):
            continue
        if exclude_patterns and any(re.search(p, url) for p in exclude_patterns):
            continue

        entry["source"] = "snapshot_diff"
        new_entries.append(entry)

    return new_entries


def host_is_ignored(url, ignored_subdomains):
    """True if the URL's host equals or is a subdomain of any ignored entry.

    Entries are hostnames (e.g. "community.elevenlabs.io"). Ignoring an entry
    drops that host and anything under it, but not sibling subdomains.
    """
    if not ignored_subdomains:
        return False
    host = (urlparse(url).hostname or "").lower()
    if not host:
        return False
    for entry in ignored_subdomains:
        e = (entry or "").strip().lower().strip(".")
        if e and (host == e or host.endswith("." + e)):
            return True
    return False


def filter_new_pages(entries, hours=24, include_patterns=None, exclude_patterns=None,
                     ignored_subdomains=None):
    """Filter sitemap entries to only those modified within the time window."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    new_pages = []

    for entry in entries:
        url = entry["url"]

        if host_is_ignored(url, ignored_subdomains):
            continue

        if include_patterns:
            if not any(re.search(p, url) for p in include_patterns):
                continue

        if exclude_patterns:
            if any(re.search(p, url) for p in exclude_patterns):
                continue

        lastmod = parse_lastmod(entry.get("lastmod"))
        if lastmod and lastmod >= cutoff:
            entry["lastmod_parsed"] = lastmod.isoformat()
            new_pages.append(entry)

    return new_pages


# =============================================================================
# Page scraping
# =============================================================================

def scrape_page(url, timeout=30):
    """Scrape a single page and extract key content."""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=timeout)
        resp.raise_for_status()
    except requests.RequestException as e:
        return {"url": url, "error": str(e)}

    soup = BeautifulSoup(resp.text, "html.parser")

    title = soup.find("title")
    title_text = title.get_text(strip=True) if title else ""

    meta_desc = soup.find("meta", attrs={"name": "description"})
    description = meta_desc.get("content", "") if meta_desc else ""

    if not description:
        og_desc = soup.find("meta", attrs={"property": "og:description"})
        description = og_desc.get("content", "") if og_desc else ""

    for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
        tag.decompose()

    main = soup.find("main") or soup.find("article") or soup.find("body")
    if main:
        text = main.get_text(separator="\n", strip=True)
    else:
        text = soup.get_text(separator="\n", strip=True)

    lines = [line.strip() for line in text.split("\n") if line.strip()]
    text_clean = "\n".join(lines)

    return {
        "url": url,
        "title": title_text,
        "description": description,
        "text_preview": text_clean[:2000],
        "text_length": len(text_clean),
    }


# =============================================================================
# LLM-based classification and summarization
# =============================================================================

def _unclassified(page):
    """Fallback classification used when inference is unavailable or errors."""
    return {
        "relevant": True,
        "relevance_score": None,
        "signal_type": "unclassified",
        "product": "",
        "product_known": False,
        "category": "unclassified",
        "summary": page.get("scraped", {}).get("description", ""),
        "reasoning": "",
        "rubric_version": RUBRIC_VERSION,
    }


def classify_pages(pages, competitor_name, known_products=None, guidance=None, examples=None):
    """
    Score pages with the configured inference provider, then deterministically
    post-process: canonicalize the product against the registry (locking category
    when known) and derive `relevant` from the rubric threshold.
    Returns pages with an added 'classification' field.
    """
    inference_client = get_inference_client()
    if not inference_client:
        print("  Warning: inference not configured. Skipping LLM classification.", file=sys.stderr)
        for p in pages:
            p["classification"] = _unclassified(p)
        return pages

    # Build page summaries for the prompt
    page_entries = []
    for i, page in enumerate(pages):
        scraped = page.get("scraped", {})
        page_entries.append({
            "index": i,
            "url": page["url"],
            "title": scraped.get("title", ""),
            "description": scraped.get("description", ""),
            "text_preview": scraped.get("text_preview", "")[:800],
        })

    try:
        classifications = inference_client.classify_pages(
            competitor_name=competitor_name,
            focus_areas=FOCUS_AREAS,
            page_entries=page_entries,
            known_products=known_products,
            guidance=guidance,
            examples=examples,
        )

        for c in classifications:
            idx = c.get("index")
            if not isinstance(idx, int) or not (0 <= idx < len(pages)):
                continue
            canonical, registry_category, is_known = canonicalize_product(
                c.get("product", ""), known_products
            )
            raw_score = c.get("relevance_score")
            score = int(raw_score) if isinstance(raw_score, (int, float)) else None
            # Lock category to the registry when the product is known (deterministic).
            category = registry_category or c.get("category") or "Other AI/Voice"
            pages[idx]["classification"] = {
                "relevant": score_to_relevant(score),
                "relevance_score": score,
                "signal_type": c.get("signal_type", "irrelevant"),
                "product": canonical,
                "product_known": is_known,
                "category": category,
                "summary": c.get("summary", ""),
                "reasoning": c.get("reasoning", ""),
                "rubric_version": RUBRIC_VERSION,
            }

        # Tag any pages the model didn't return
        for p in pages:
            if "classification" not in p:
                p["classification"] = _unclassified(p)

        return pages

    except Exception as e:
        print(f"  Warning: LLM classification failed: {e}", file=sys.stderr)
        for p in pages:
            p["classification"] = _unclassified(p)
        return pages


def generate_digest(all_results):
    """
    Use the configured inference provider to generate a categorized executive digest
    from the classified pages.
    """
    inference_client = get_inference_client()
    if not inference_client:
        return None

    # Collect only relevant pages
    relevant = []
    for r in all_results:
        for page in r.get("new_pages", []):
            c = page.get("classification", {})
            if c.get("relevant", False):
                relevant.append({
                    "competitor": r["competitor"],
                    "url": page["url"],
                    "title": page.get("scraped", {}).get("title", ""),
                    "category": c.get("category", ""),
                    "summary": c.get("summary", ""),
                })

    if not relevant:
        return "No relevant AI/voice product updates detected in the last scan."

    try:
        return inference_client.generate_digest(
            focus_areas=FOCUS_AREAS,
            relevant_pages=relevant,
        )

    except Exception as e:
        print(f"  Warning: Digest generation failed: {e}", file=sys.stderr)
        return None


def load_competitors_from_config(path):
    """Load competitor configs from a JSON file (the dashboard DB export).

    The dashboard is the source of truth for which competitors/sources are
    monitored; the runner exports the active rows to JSON and passes --config.
    Each entry mirrors the COMPETITORS dict shape. Falls back gracefully on a
    missing/malformed file by raising, so callers can decide to use defaults.
    """
    data = json.loads(Path(path).read_text())
    if not isinstance(data, list):
        raise ValueError(f"Config at {path} must be a JSON array of competitors")

    competitors = []
    for entry in data:
        name = (entry.get("name") or "").strip()
        sitemap_urls = entry.get("sitemap_urls") or []
        if not name or not sitemap_urls:
            continue  # skip incomplete rows (e.g. a competitor with no sources)
        competitors.append(
            {
                "name": name,
                "sitemap_urls": list(sitemap_urls),
                "include_patterns": list(entry.get("include_patterns") or []),
                "exclude_patterns": list(entry.get("exclude_patterns") or []),
                "ignored_subdomains": list(entry.get("ignored_subdomains") or []),
                "products": list(entry.get("products") or []),
                "guidance": list(entry.get("guidance") or []),
                "examples": list(entry.get("examples") or []),
                "use_snapshot_diff": bool(entry.get("use_snapshot_diff", False)),
            }
        )
    return competitors


def select_competitors(competitors, names=None):
    """Return competitor configs matching one or more case-insensitive names."""
    if not names:
        return competitors

    requested = {name.strip().lower() for name in names if name and name.strip()}
    selected = [c for c in competitors if c["name"].lower() in requested]
    found = {c["name"].lower() for c in selected}
    missing = sorted(requested - found)
    if missing:
        available = ", ".join(c["name"] for c in competitors)
        raise ValueError(
            f"Unknown competitor(s): {', '.join(missing)}. Available: {available}"
        )
    return selected


# =============================================================================
# Output formatting
# =============================================================================

def format_email_html(results, digest=None, hours=24):
    """Format results as an HTML email with optional LLM digest."""
    total_new = sum(len(r["new_pages"]) for r in results)
    relevant_count = sum(
        1 for r in results for p in r.get("new_pages", [])
        if p.get("classification", {}).get("relevant", True)
    )
    date_str = datetime.now().strftime("%B %d, %Y")

    html = f"""
    <html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a1a; max-width: 700px; margin: 0 auto; padding: 20px;">
    <h1 style="font-size: 22px; border-bottom: 2px solid #e0e0e0; padding-bottom: 10px;">
        AI/Voice Competitor Digest — {date_str}
    </h1>
    <p style="color: #666; font-size: 14px;">{relevant_count} relevant updates from {total_new} new pages in the last {hours} hours</p>
    """

    # Add LLM digest at the top if available
    if digest:
        # Convert markdown-style formatting to basic HTML
        digest_html = digest.replace("\n\n", "</p><p>").replace("\n- ", "<br>• ").replace("\n", "<br>")
        html += f"""
        <div style="background: #f0f7ff; border: 1px solid #c8ddf0; border-radius: 8px; padding: 16px; margin: 16px 0;">
            <h2 style="font-size: 16px; margin-top: 0; color: #1a5276;">Executive Summary</h2>
            <p style="font-size: 14px; line-height: 1.6; color: #2c3e50;">{digest_html}</p>
        </div>
        """

    # Category color mapping
    cat_colors = {
        "AI Assistants": "#8e44ad",
        "Inference": "#e67e22",
        "STT": "#27ae60",
        "TTS": "#2980b9",
        "Other AI/Voice": "#7f8c8d",
    }

    for r in results:
        competitor = r["competitor"]
        pages = r.get("new_pages", [])
        relevant_pages = [p for p in pages if p.get("classification", {}).get("relevant", True)]

        if not relevant_pages:
            continue

        html += f'<h2 style="font-size: 18px; margin-top: 24px;">{competitor} — {len(relevant_pages)} relevant update{"s" if len(relevant_pages) != 1 else ""}</h2>'

        for page in relevant_pages[:20]:
            scraped = page.get("scraped", {})
            classification = page.get("classification", {})
            title = scraped.get("title", page["url"])
            url = page["url"]
            category = classification.get("category", "")
            summary = classification.get("summary", scraped.get("description", ""))
            cat_color = cat_colors.get(category, "#95a5a6")

            html += f"""
            <div style="margin: 12px 0; padding: 12px; background: #f8f9fa; border-radius: 6px; border-left: 3px solid {cat_color};">
                <span style="display: inline-block; background: {cat_color}; color: white; font-size: 11px; padding: 2px 8px; border-radius: 3px; margin-bottom: 6px;">{category}</span>
                <br><a href="{url}" style="font-weight: 600; color: #1a73e8; text-decoration: none; font-size: 15px;">{title}</a>
                <br><span style="font-size: 12px; color: #888;">{url}</span>
            """
            if summary:
                html += f'<p style="margin: 6px 0 0; font-size: 13px; color: #444;">{summary[:300]}</p>'
            html += "</div>"

    html += """
    <hr style="border: none; border-top: 1px solid #e0e0e0; margin-top: 30px;">
    <p style="font-size: 12px; color: #999;">Sent by Competitor Monitor — AI/Voice Product Intelligence</p>
    </body></html>
    """

    return html


def send_email(results, to_email, digest=None, hours=24):
    """Send results via SendGrid email."""
    api_key = os.getenv("SENDGRID_API_KEY")
    sender = os.getenv("SENDGRID_SENDER_EMAIL")

    if not api_key:
        return {"status": "error", "error": "SENDGRID_API_KEY not set in .env"}
    if not sender:
        return {"status": "error", "error": "SENDGRID_SENDER_EMAIL not set in .env"}

    try:
        from sendgrid import SendGridAPIClient
        from sendgrid.helpers.mail import Mail
    except ImportError:
        return {"status": "error", "error": "sendgrid not installed. Run: pip install sendgrid"}

    relevant_count = sum(
        1 for r in results for p in r.get("new_pages", [])
        if p.get("classification", {}).get("relevant", True)
    )
    subject = f"AI/Voice Competitor Digest: {relevant_count} updates — {datetime.now().strftime('%b %d')}"
    html_content = format_email_html(results, digest=digest, hours=hours)

    message = Mail(
        from_email=sender,
        to_emails=to_email,
        subject=subject,
        html_content=html_content,
    )

    try:
        sg = SendGridAPIClient(api_key)
        response = sg.send(message)
        return {"status": "success", "status_code": response.status_code}
    except Exception as e:
        return {"status": "error", "error": str(e)}


def send_to_slack(blocks, channel=None):
    """Send results to Slack using existing Slack infrastructure."""
    try:
        sys.path.insert(0, str(Path(__file__).parent))
        from question_monitor.alerts.slack_alerts import send_slack_message
    except ImportError:
        print("Warning: Could not import Slack alerts module", file=sys.stderr)
        return {"status": "error", "error": "Slack module not available"}

    return send_slack_message(
        blocks=blocks,
        text="Competitor Monitor: new AI/voice updates detected",
        channel=channel or os.getenv("SLACK_COMPETITOR_CHANNEL", "#product-intel"),
    )


# =============================================================================
# Main monitor
# =============================================================================

def run_monitor(competitors=None, hours=24, scrape=True, classify=True,
                slack=True, email_to=None, output_dir=".tmp", require_inference=False):
    """
    Main monitoring function.

    Args:
        competitors: List of competitor configs (uses defaults if None)
        hours: Look-back window in hours
        scrape: Whether to scrape discovered pages for content
        classify: Whether to use LLM to classify and summarize pages
        slack: Whether to send Slack notification
        email_to: Email address to send results to (None = skip)
        output_dir: Directory for JSON output
        require_inference: Fail instead of falling back when no inference client is configured

    Returns:
        List of results per competitor
    """
    if competitors is None:
        competitors = COMPETITORS

    if classify and require_inference and not get_inference_client():
        raise RuntimeError(
            "OPENAI_API_KEY is required when --require-inference is used. "
            "Set it in the environment or repo-root .env."
        )

    all_results = []

    for comp in competitors:
        name = comp["name"]
        print(f"\n{'='*60}")
        print(f"Checking {name}...")
        print(f"{'='*60}")

        # Fetch all sitemaps for this competitor
        all_entries = []
        for sitemap_url in comp["sitemap_urls"]:
            print(f"  Fetching {sitemap_url}")
            entries = fetch_sitemap(sitemap_url)
            all_entries.extend(entries)
            print(f"  Found {len(entries)} URLs in sitemap")

        # Detect new pages
        if comp.get("use_snapshot_diff"):
            print(f"  Using snapshot diff (no lastmod available)")
            new_pages = diff_snapshot(
                name,
                all_entries,
                include_patterns=comp.get("include_patterns") or None,
                exclude_patterns=comp.get("exclude_patterns") or None,
                snapshot_dir=output_dir + "/snapshots",
                ignored_subdomains=comp.get("ignored_subdomains") or None,
            )
            print(f"  {len(new_pages)} new pages since last run")
        else:
            new_pages = filter_new_pages(
                all_entries,
                hours=hours,
                include_patterns=comp.get("include_patterns") or None,
                exclude_patterns=comp.get("exclude_patterns") or None,
                ignored_subdomains=comp.get("ignored_subdomains") or None,
            )
            print(f"  {len(new_pages)} pages modified in last {hours} hours")

        # Scrape new pages for content
        if scrape and new_pages:
            print(f"  Scraping {len(new_pages)} pages...")
            for i, page in enumerate(new_pages):
                print(f"    [{i+1}/{len(new_pages)}] {page['url']}")
                page["scraped"] = scrape_page(page["url"])

        # LLM classification
        if classify and scrape and new_pages:
            print(f"  Classifying {len(new_pages)} pages with LLM...")
            new_pages = classify_pages(
                new_pages, name,
                known_products=comp.get("products") or [],
                guidance=comp.get("guidance") or [],
                examples=comp.get("examples") or [],
            )
            relevant = [p for p in new_pages if p.get("classification", {}).get("relevant")]
            filtered = len(new_pages) - len(relevant)
            if filtered:
                print(f"  Filtered out {filtered} non-relevant pages")
            for p in relevant:
                c = p["classification"]
                print(f"    [{c['category']}] {p.get('scraped', {}).get('title', p['url'])}")

        all_results.append(
            {
                "competitor": name,
                "total_sitemap_urls": len(all_entries),
                "new_pages": new_pages,
                "checked_at": datetime.now(timezone.utc).isoformat(),
            }
        )

    # Generate LLM digest
    digest = None
    if classify:
        print("\nGenerating executive digest...")
        digest = generate_digest(all_results)
        if digest:
            print("\n" + "=" * 60)
            print("EXECUTIVE DIGEST")
            print("=" * 60)
            print(digest)

    # Save results to JSON
    output_path = Path(output_dir)
    output_path.mkdir(exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_data = {
        "results": all_results,
        "digest": digest,
        "inference": describe_active_client(get_inference_client()) if classify else None,
        "scan_time": datetime.now(timezone.utc).isoformat(),
        "hours": hours,
    }
    json_file = output_path / f"competitor_monitor_{timestamp}.json"
    json_file.write_text(json.dumps(output_data, indent=2, default=str))
    print(f"\nResults saved to {json_file}")

    # Send Slack notification
    total_relevant = sum(
        1 for r in all_results for p in r.get("new_pages", [])
        if p.get("classification", {}).get("relevant", True)
    )
    if slack and total_relevant > 0:
        print("\nSending Slack notification...")
        # For Slack, just send the digest text as a simple message
        blocks = [
            {"type": "header", "text": {"type": "plain_text", "text": f"AI/Voice Competitor Digest", "emoji": True}},
            {"type": "context", "elements": [{"type": "mrkdwn", "text": f"{total_relevant} relevant updates | {datetime.now().strftime('%Y-%m-%d')}"}]},
            {"type": "divider"},
        ]
        if digest:
            blocks.append({"type": "section", "text": {"type": "mrkdwn", "text": digest[:3000]}})
        result = send_to_slack(blocks)
        print(f"  Slack: {result.get('status', 'unknown')}")
        if result.get("error"):
            print(f"  Error: {result['error']}")
    elif slack and total_relevant == 0:
        print("\nNo relevant AI/voice updates found. Skipping Slack notification.")

    # Send email
    if email_to:
        print(f"\nSending email to {email_to}...")
        result = send_email(all_results, email_to, digest=digest, hours=hours)
        print(f"  Email: {result.get('status', 'unknown')}")
        if result.get("error"):
            print(f"  Error: {result['error']}")

    # Print summary
    print(f"\n{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}")
    for r in all_results:
        pages = r.get("new_pages", [])
        relevant = [p for p in pages if p.get("classification", {}).get("relevant", True)]
        total = len(pages)
        rel = len(relevant)
        print(f"  {r['competitor']}: {rel} relevant / {total} total new pages")
        for page in relevant[:5]:
            c = page.get("classification", {})
            title = page.get("scraped", {}).get("title", page["url"])
            cat = c.get("category", "")
            print(f"    [{cat}] {title}")
            print(f"      {page['url']}")
        if rel > 5:
            print(f"    ... and {rel - 5} more")
    print(f"\nTotal: {total_relevant} relevant updates across {len(all_results)} competitors")

    return all_results


def main():
    parser = argparse.ArgumentParser(
        description="Monitor competitor websites for AI/voice product updates",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python tools/competitor_monitor.py
  python tools/competitor_monitor.py --hours 48
  python tools/competitor_monitor.py --competitor ElevenLabs --require-inference --no-slack
  python tools/competitor_monitor.py --no-slack --no-classify
        """,
    )

    parser.add_argument("--config", default=None, help="Path to a JSON competitor config (dashboard DB export); defaults to the built-in list")
    parser.add_argument("--competitor", action="append", help="Run only the named competitor (repeatable)")
    parser.add_argument("--hours", type=int, default=24, help="Look-back window in hours (default: 24)")
    parser.add_argument("--no-scrape", action="store_true", help="Skip scraping page content")
    parser.add_argument("--no-classify", action="store_true", help="Skip LLM classification and summarization")
    parser.add_argument("--require-inference", action="store_true", help="Fail if LLM inference is not configured")
    parser.add_argument("--no-slack", action="store_true", help="Skip sending Slack notification")
    parser.add_argument("--email", type=str, default=None, help="Email address to send results to")
    parser.add_argument("--output-dir", default=".tmp", help="Directory for JSON output (default: .tmp)")
    parser.add_argument("--json-only", action="store_true", help="Output only JSON to stdout")

    args = parser.parse_args()

    try:
        if args.config:
            available = load_competitors_from_config(args.config)
            print(f"Loaded {len(available)} competitors from {args.config}", file=sys.stderr)
        else:
            available = COMPETITORS
        selected_competitors = select_competitors(available, args.competitor)
        results = run_monitor(
            competitors=selected_competitors,
            hours=args.hours,
            scrape=not args.no_scrape,
            classify=not args.no_classify,
            slack=not args.no_slack,
            email_to=args.email,
            output_dir=args.output_dir,
            require_inference=args.require_inference,
        )
    except (RuntimeError, ValueError) as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    if args.json_only:
        print(json.dumps(results, indent=2, default=str))


if __name__ == "__main__":
    main()
