# Competitor Monitor

Daily automated monitoring of competitor websites (Vapi, ElevenLabs, Twilio) for new product updates.

## Setup

```bash
pip install -r requirements.txt
```

## Usage

```bash
# Run with defaults (last 24h, scrape pages, send Slack summary)
python tools/competitor_monitor.py

# Dry run
python tools/competitor_monitor.py --no-slack --no-scrape

# Custom time window
python tools/competitor_monitor.py --hours 48
```

See [workflows/competitor_monitoring.md](workflows/competitor_monitoring.md) for full details.

## Roadmap

- **Slack notifications** — Send daily digest to Max and Jake via Slack DM/channel
- **Linear ticket creation** — Automatically create Linear tickets for notable competitor updates that need team review
