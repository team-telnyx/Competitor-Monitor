#!/usr/bin/env python3
"""
Competitor Monitor Tool

Checks competitor sitemaps for new/updated pages in the last 24 hours.
Scrapes new pages and sends a Slack summary of product updates.
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

# Load .env from project root (parent of tools/)
load_dotenv(Path(__file__).parent.parent / ".env")
load_dotenv()  # also check cwd

# Default competitors to monitor
COMPETITORS = [
    {
        "name": "Vapi",
        # Vapi's sitemap has no <lastmod> dates, so we diff against the previous snapshot
        "sitemap_urls": ["https://vapi.ai/sitemap.xml"],
        "include_patterns": [],
        "exclude_patterns": [r"/legal/", r"/terms", r"/privacy"],
        "use_snapshot_diff": True,
    },
    {
        "name": "ElevenLabs",
        "sitemap_urls": ["https://elevenlabs.io/sitemap.xml"],
        "include_patterns": [
            r"elevenlabs\.io/blog",
            r"elevenlabs\.io/docs/changelog",
            r"elevenlabs\.io/[^/]+$",  # top-level product pages
        ],
        "exclude_patterns": [
            r"/careers/",
            r"/legal/",
            r"/terms",
            r"/privacy",
            r"/languages/",
            r"/community/",
        ],
    },
    {
        "name": "Twilio",
        "sitemap_urls": ["https://www.twilio.com/sitemap.xml"],
        "include_patterns": [
            r"twilio\.com/en-us/blog/",
            r"twilio\.com/en-us/changelog",
            r"twilio\.com/en-us/press/",
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

    # Try dateutil as fallback
    try:
        from dateutil.parser import parse as dateutil_parse
        dt = dateutil_parse(lastmod_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        pass

    return None


def load_snapshot(name, snapshot_dir=".tmp/snapshots"):
    """Load the previous sitemap snapshot for a competitor."""
    path = Path(snapshot_dir) / f"{name.lower()}_sitemap.json"
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
    snapshot_file = path / f"{name.lower()}_sitemap.json"
    snapshot_file.write_text(json.dumps({
        "urls": sorted(urls),
        "saved_at": datetime.now(timezone.utc).isoformat(),
        "count": len(urls),
    }, indent=2))
    print(f"  Snapshot saved: {len(urls)} URLs -> {snapshot_file}")


def diff_snapshot(name, current_entries, include_patterns=None, exclude_patterns=None, snapshot_dir=".tmp/snapshots"):
    """
    Compare current sitemap URLs against the previous snapshot.
    Returns entries that are new (not in the previous snapshot).
    """
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

    # Save updated snapshot
    save_snapshot(name, current_urls, snapshot_dir)

    if not new_urls:
        return []

    # Build entries for new URLs, applying filters
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

        # Apply include patterns (if specified, URL must match at least one)
        if include_patterns:
            if not any(re.search(p, url) for p in include_patterns):
                continue

        # Apply exclude patterns
        if exclude_patterns:
            if any(re.search(p, url) for p in exclude_patterns):
                continue

        lastmod = parse_lastmod(entry.get("lastmod"))
        if lastmod and lastmod >= cutoff:
            entry["lastmod_parsed"] = lastmod.isoformat()
            new_pages.append(entry)

    return new_pages


def discover_from_listing_page(listing_url, base_domain, timeout=30):
    """
    Scrape a blog/changelog listing page and extract article links.
    Used as fallback when sitemaps don't have lastmod dates.
    Returns links that belong to the same domain.
    """
    try:
        resp = requests.get(listing_url, headers=HEADERS, timeout=timeout)
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f"  Warning: Could not fetch listing page {listing_url}: {e}", file=sys.stderr)
        return []

    soup = BeautifulSoup(resp.text, "html.parser")
    links = []
    seen = set()

    for a in soup.find_all("a", href=True):
        href = a["href"]
        # Make absolute
        if href.startswith("/"):
            href = f"https://{base_domain}{href}"
        if base_domain not in href:
            continue
        # Skip the listing page itself and anchors
        if href.rstrip("/") == listing_url.rstrip("/"):
            continue
        if "#" in href:
            href = href.split("#")[0]
        if href in seen:
            continue
        seen.add(href)

        text = a.get_text(strip=True)
        if text and len(text) > 5:  # skip tiny link texts
            links.append({"url": href, "link_text": text, "lastmod": None, "source": "listing_page"})

    return links


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

    # Try og:description as fallback
    if not description:
        og_desc = soup.find("meta", attrs={"property": "og:description"})
        description = og_desc.get("content", "") if og_desc else ""

    # Extract main content text
    for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
        tag.decompose()

    # Try to find main content area
    main = soup.find("main") or soup.find("article") or soup.find("body")
    if main:
        text = main.get_text(separator="\n", strip=True)
    else:
        text = soup.get_text(separator="\n", strip=True)

    # Clean and truncate
    lines = [line.strip() for line in text.split("\n") if line.strip()]
    text_clean = "\n".join(lines)

    return {
        "url": url,
        "title": title_text,
        "description": description,
        "text_preview": text_clean[:2000],
        "text_length": len(text_clean),
    }


def format_slack_blocks(results, hours=24):
    """Format results as Slack Block Kit blocks."""
    total_new = sum(len(r["new_pages"]) for r in results)

    blocks = [
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": f"Competitor Monitor: {total_new} new pages detected",
                "emoji": True,
            },
        },
        {
            "type": "context",
            "elements": [
                {
                    "type": "mrkdwn",
                    "text": f"Pages added or updated in the last {hours} hours | {datetime.now().strftime('%Y-%m-%d %H:%M')}",
                }
            ],
        },
        {"type": "divider"},
    ]

    for r in results:
        competitor = r["competitor"]
        pages = r["new_pages"]

        if not pages:
            blocks.append(
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f"*{competitor}* - No new pages",
                    },
                }
            )
            blocks.append({"type": "divider"})
            continue

        blocks.append(
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"*{competitor}* - {len(pages)} new page{'s' if len(pages) != 1 else ''}",
                },
            }
        )

        for page in pages[:15]:  # Limit to avoid Slack message size limits
            scraped = page.get("scraped", {})
            title = scraped.get("title", page["url"])
            desc = scraped.get("description", "")
            url = page["url"]

            text = f"*<{url}|{title}>*"
            if desc:
                text += f"\n{desc[:200]}"
            if page.get("lastmod"):
                text += f"\n_Modified: {page['lastmod']}_"

            blocks.append(
                {
                    "type": "section",
                    "text": {"type": "mrkdwn", "text": text},
                }
            )

        if len(pages) > 15:
            blocks.append(
                {
                    "type": "context",
                    "elements": [
                        {
                            "type": "mrkdwn",
                            "text": f"_...and {len(pages) - 15} more pages_",
                        }
                    ],
                }
            )

        blocks.append({"type": "divider"})

    return blocks


def format_email_html(results, hours=24):
    """Format results as an HTML email."""
    total_new = sum(len(r["new_pages"]) for r in results)
    date_str = datetime.now().strftime("%B %d, %Y")

    html = f"""
    <html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a1a; max-width: 700px; margin: 0 auto; padding: 20px;">
    <h1 style="font-size: 22px; border-bottom: 2px solid #e0e0e0; padding-bottom: 10px;">
        Competitor Monitor: {total_new} new page{"s" if total_new != 1 else ""} detected
    </h1>
    <p style="color: #666; font-size: 14px;">Pages added or updated in the last {hours} hours &mdash; {date_str}</p>
    """

    for r in results:
        competitor = r["competitor"]
        pages = r["new_pages"]
        count = len(pages)

        html += f'<h2 style="font-size: 18px; margin-top: 24px;">{competitor} &mdash; {count} new page{"s" if count != 1 else ""}</h2>'

        if not pages:
            html += '<p style="color: #888;">No new pages detected.</p>'
            continue

        for page in pages[:20]:
            scraped = page.get("scraped", {})
            title = scraped.get("title", page["url"])
            desc = scraped.get("description", "")
            url = page["url"]
            lastmod = page.get("lastmod", "")

            html += f"""
            <div style="margin: 12px 0; padding: 12px; background: #f8f9fa; border-radius: 6px; border-left: 3px solid #4a90d9;">
                <a href="{url}" style="font-weight: 600; color: #1a73e8; text-decoration: none; font-size: 15px;">{title}</a>
                <br><span style="font-size: 12px; color: #888;">{url}</span>
            """
            if desc:
                html += f'<p style="margin: 6px 0 0; font-size: 13px; color: #444;">{desc[:300]}</p>'
            if lastmod:
                html += f'<p style="margin: 4px 0 0; font-size: 12px; color: #999;">Modified: {lastmod}</p>'
            html += "</div>"

        if count > 20:
            html += f'<p style="color: #888; font-size: 13px;">...and {count - 20} more pages</p>'

    html += """
    <hr style="border: none; border-top: 1px solid #e0e0e0; margin-top: 30px;">
    <p style="font-size: 12px; color: #999;">Sent by Competitor Monitor</p>
    </body></html>
    """

    return html


def send_email(results, to_email, hours=24):
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

    total_new = sum(len(r["new_pages"]) for r in results)
    subject = f"Competitor Monitor: {total_new} new pages detected — {datetime.now().strftime('%b %d')}"
    html_content = format_email_html(results, hours=hours)

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

    total = sum(
        1
        for b in blocks
        if b.get("type") == "section" and "new page" not in b.get("text", {}).get("text", "")
    )

    return send_slack_message(
        blocks=blocks,
        text=f"Competitor Monitor: new pages detected",
        channel=channel or os.getenv("SLACK_COMPETITOR_CHANNEL", "#product-intel"),
    )


def run_monitor(competitors=None, hours=24, scrape=True, slack=True, email_to=None, output_dir=".tmp"):
    """
    Main monitoring function.

    Args:
        competitors: List of competitor configs (uses defaults if None)
        hours: Look-back window in hours
        scrape: Whether to scrape discovered pages for content
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
            # Snapshot diff: compare current sitemap to previous run
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
            # Standard lastmod-based filtering
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

        all_results.append(
            {
                "competitor": name,
                "total_sitemap_urls": len(all_entries),
                "new_pages": new_pages,
                "checked_at": datetime.now(timezone.utc).isoformat(),
            }
        )

    # Save results to JSON
    output_path = Path(output_dir)
    output_path.mkdir(exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    json_file = output_path / f"competitor_monitor_{timestamp}.json"
    json_file.write_text(json.dumps(all_results, indent=2, default=str))
    print(f"\nResults saved to {json_file}")

    # Send Slack notification
    total_new = sum(len(r["new_pages"]) for r in all_results)
    if slack and total_new > 0:
        print("\nSending Slack notification...")
        blocks = format_slack_blocks(all_results, hours=hours)
        result = send_to_slack(blocks)
        print(f"  Slack: {result.get('status', 'unknown')}")
        if result.get("error"):
            print(f"  Error: {result['error']}")
    elif slack and total_new == 0:
        print("\nNo new pages found. Skipping Slack notification.")

    # Send email
    if email_to:
        print(f"\nSending email to {email_to}...")
        result = send_email(all_results, email_to, hours=hours)
        print(f"  Email: {result.get('status', 'unknown')}")
        if result.get("error"):
            print(f"  Error: {result['error']}")

    # Print summary
    print(f"\n{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}")
    for r in all_results:
        count = len(r["new_pages"])
        print(f"  {r['competitor']}: {count} new page{'s' if count != 1 else ''}")
        for page in r["new_pages"][:5]:
            title = page.get("scraped", {}).get("title", page["url"])
            print(f"    - {title}")
            print(f"      {page['url']}")
        if count > 5:
            print(f"    ... and {count - 5} more")
    print(f"\nTotal: {total_new} new pages across {len(all_results)} competitors")

    return all_results


def main():
    parser = argparse.ArgumentParser(
        description="Monitor competitor websites for new pages",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python tools/competitor_monitor.py
  python tools/competitor_monitor.py --hours 48
  python tools/competitor_monitor.py --no-slack --no-scrape
        """,
    )

    parser.add_argument(
        "--hours",
        type=int,
        default=24,
        help="Look-back window in hours (default: 24)",
    )
    parser.add_argument(
        "--no-scrape",
        action="store_true",
        help="Skip scraping page content (faster, sitemap data only)",
    )
    parser.add_argument(
        "--no-slack",
        action="store_true",
        help="Skip sending Slack notification",
    )
    parser.add_argument(
        "--output-dir",
        default=".tmp",
        help="Directory for JSON output (default: .tmp)",
    )
    parser.add_argument(
        "--email",
        type=str,
        default=None,
        help="Email address to send results to (via SendGrid)",
    )
    parser.add_argument(
        "--json-only",
        action="store_true",
        help="Output only JSON to stdout",
    )

    args = parser.parse_args()

    results = run_monitor(
        hours=args.hours,
        scrape=not args.no_scrape,
        slack=not args.no_slack,
        email_to=args.email,
        output_dir=args.output_dir,
    )

    if args.json_only:
        print(json.dumps(results, indent=2, default=str))


if __name__ == "__main__":
    main()
