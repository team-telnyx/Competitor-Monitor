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

from inference import get_inference_client

# Load .env from project root (parent of tools/)
load_dotenv(Path(__file__).parent.parent / ".env")
load_dotenv()  # also check cwd


# =============================================================================
# Focus areas for AI/voice product intelligence
# =============================================================================

FOCUS_AREAS = [
    "AI Assistants — voice agents, conversational AI, virtual assistants, agent frameworks",
    "Inference — LLM hosting, model serving, real-time inference, API endpoints, latency improvements",
    "STT (Speech-to-Text) — transcription, ASR, real-time speech recognition, diarization",
    "TTS (Text-to-Speech) — voice synthesis, voice cloning, audio generation, voice models",
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
        "name": "Deepgram",
        # No lastmod
        "sitemap_urls": ["https://deepgram.com/sitemap.xml"],
        "include_patterns": [
            r"/blog/", r"/changelog", r"/learn/",
            r"deepgram\.com/[^/]+$",
        ],
        "exclude_patterns": [
            r"/careers/", r"/legal/", r"/terms", r"/privacy",
            r"/partners/", r"/events/",
        ],
        "use_snapshot_diff": True,
    },
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
    {
        "name": "OpenAI",
        # Has lastmod
        "sitemap_urls": ["https://openai.com/sitemap.xml"],
        "include_patterns": [
            r"openai\.com/index/",  # blog posts
            r"openai\.com/api/",
        ],
        "exclude_patterns": [
            r"/careers/", r"/legal/", r"/terms", r"/privacy",
        ],
    },
    {
        "name": "Google Cloud Speech",
        "sitemap_urls": ["https://cloud.google.com/sitemap.xml"],
        "include_patterns": [
            r"/speech-to-text/", r"/text-to-speech/",
            r"/vertex-ai/.*release", r"/vertex-ai/.*changelog",
            r"/blog/products/ai-machine-learning",
        ],
        "exclude_patterns": [],
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


def diff_snapshot(name, current_entries, include_patterns=None, exclude_patterns=None, snapshot_dir=".tmp/snapshots"):
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
        if include_patterns and not any(re.search(p, url) for p in include_patterns):
            continue
        if exclude_patterns and any(re.search(p, url) for p in exclude_patterns):
            continue

        entry["source"] = "snapshot_diff"
        new_entries.append(entry)

    return new_entries


def filter_new_pages(entries, hours=24, include_patterns=None, exclude_patterns=None):
    """Filter sitemap entries to only those modified within the time window."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    new_pages = []

    for entry in entries:
        url = entry["url"]

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

def classify_pages(pages, competitor_name):
    """
    Use the configured inference provider to classify pages by AI/voice relevance.
    Returns pages with added 'classification' field.
    """
    inference_client = get_inference_client()
    if not inference_client:
        print("  Warning: OPENAI_API_KEY not set. Skipping LLM classification.", file=sys.stderr)
        # Return all pages unclassified
        for p in pages:
            p["classification"] = {
                "relevant": True,
                "category": "unclassified",
                "summary": p.get("scraped", {}).get("description", ""),
            }
        return pages

    # Build page summaries for the prompt
    page_entries = []
    for i, page in enumerate(pages):
        scraped = page.get("scraped", {})
        entry = {
            "index": i,
            "url": page["url"],
            "title": scraped.get("title", ""),
            "description": scraped.get("description", ""),
            "text_preview": scraped.get("text_preview", "")[:800],
        }
        page_entries.append(entry)

    try:
        classifications = inference_client.classify_pages(
            competitor_name=competitor_name,
            focus_areas=FOCUS_AREAS,
            page_entries=page_entries,
        )

        for c in classifications:
            idx = c["index"]
            if 0 <= idx < len(pages):
                pages[idx]["classification"] = {
                    "relevant": c.get("relevant", False),
                    "category": c.get("category", "Not Relevant"),
                    "summary": c.get("summary", ""),
                }

        # Tag any unclassified pages
        for p in pages:
            if "classification" not in p:
                p["classification"] = {
                    "relevant": True,
                    "category": "unclassified",
                    "summary": p.get("scraped", {}).get("description", ""),
                }

        return pages

    except Exception as e:
        print(f"  Warning: LLM classification failed: {e}", file=sys.stderr)
        for p in pages:
            p["classification"] = {
                "relevant": True,
                "category": "unclassified",
                "summary": p.get("scraped", {}).get("description", ""),
            }
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
                slack=True, email_to=None, output_dir=".tmp"):
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

    Returns:
        List of results per competitor
    """
    if competitors is None:
        competitors = COMPETITORS

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
            )
            print(f"  {len(new_pages)} new pages since last run")
        else:
            new_pages = filter_new_pages(
                all_entries,
                hours=hours,
                include_patterns=comp.get("include_patterns") or None,
                exclude_patterns=comp.get("exclude_patterns") or None,
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
            new_pages = classify_pages(new_pages, name)
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
        "inference": {
            "provider": "openai",
            "model": os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        } if classify and os.getenv("OPENAI_API_KEY") else None,
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
  python tools/competitor_monitor.py --no-slack --no-classify
        """,
    )

    parser.add_argument("--hours", type=int, default=24, help="Look-back window in hours (default: 24)")
    parser.add_argument("--no-scrape", action="store_true", help="Skip scraping page content")
    parser.add_argument("--no-classify", action="store_true", help="Skip LLM classification and summarization")
    parser.add_argument("--no-slack", action="store_true", help="Skip sending Slack notification")
    parser.add_argument("--email", type=str, default=None, help="Email address to send results to")
    parser.add_argument("--output-dir", default=".tmp", help="Directory for JSON output (default: .tmp)")
    parser.add_argument("--json-only", action="store_true", help="Output only JSON to stdout")

    args = parser.parse_args()

    results = run_monitor(
        hours=args.hours,
        scrape=not args.no_scrape,
        classify=not args.no_classify,
        slack=not args.no_slack,
        email_to=args.email,
        output_dir=args.output_dir,
    )

    if args.json_only:
        print(json.dumps(results, indent=2, default=str))


if __name__ == "__main__":
    main()
