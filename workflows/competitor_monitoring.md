# Workflow: Competitor Monitoring

## Objective
Daily automated scan of competitor websites (Vapi, ElevenLabs, Twilio) to detect new pages and product updates published in the last 24 hours. Results are posted to Slack.

## How It Works

The tool uses **sitemap-based discovery**:
1. Fetches each competitor's `sitemap.xml` (handles sitemap indexes automatically)
2. Parses `<lastmod>` dates to find pages modified in the last 24 hours
3. Scrapes new pages for title, description, and content preview
4. Sends a consolidated Slack notification to `#product-intel`

## Competitors Monitored

| Competitor  | Sitemap URL | Filters |
|------------|-------------|---------|
| Vapi       | vapi.ai/sitemap.xml | All pages (excludes legal/terms) |
| ElevenLabs | elevenlabs.io/sitemap.xml | All pages (excludes legal/terms) |
| Twilio     | twilio.com/sitemap.xml | Blog, changelog, press, product pages only |

Twilio is filtered to blog/changelog/product because their sitemap is massive (docs, API refs, etc.).

## Tool to Execute
`tools/competitor_monitor.py`

## Running Manually
```bash
# Default: last 24 hours, scrape pages, send to Slack
python tools/competitor_monitor.py

# Check last 48 hours
python tools/competitor_monitor.py --hours 48

# Dry run (no Slack, no scraping)
python tools/competitor_monitor.py --no-slack --no-scrape

# JSON output only
python tools/competitor_monitor.py --json-only --no-slack
```

## Scheduled Execution
Runs daily via Claude Code cron job. See `/schedule` for management.

## Slack Configuration
- **Channel**: Set via `SLACK_COMPETITOR_CHANNEL` in `.env` (defaults to `#product-intel`)
- **Bot token**: Uses existing `SLACK_BOT_TOKEN` from `.env`

## Adding a New Competitor
Edit the `COMPETITORS` list in `tools/competitor_monitor.py`:
```python
{
    "name": "CompanyName",
    "sitemap_urls": ["https://company.com/sitemap.xml"],
    "include_patterns": [r"/blog/", r"/changelog/"],  # empty = all pages
    "exclude_patterns": [r"/legal/"],
}
```

## Known Constraints
- **No lastmod = invisible**: If a competitor doesn't include `<lastmod>` in their sitemap, those pages won't be detected as new. This is a sitemap standard limitation.
- **JS-rendered sitemaps**: Some sites generate sitemaps dynamically. The tool handles standard XML sitemaps only.
- **Rate limiting**: The tool scrapes pages sequentially. For sites with many new pages, this is intentional to avoid getting blocked.
- **Twilio sitemap size**: Twilio's sitemap index is large. The include filter keeps scan time reasonable.

## Learnings Log
*Document issues encountered and solutions found here*
