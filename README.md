# Competitor Monitor

AI/voice product intelligence — daily automated monitoring of competitor websites for updates related to AI assistants, inference, STT, and TTS.

## Competitors Tracked

**Voice AI**: Vapi, ElevenLabs, Retell AI, Bland AI
**Transcription**: Deepgram, AssemblyAI
**Platforms**: Twilio, OpenAI, Google Cloud Speech

## How It Works

1. Fetches competitor sitemaps and detects new pages (via `lastmod` or snapshot diffs)
2. Scrapes new pages for content
3. **LLM classifies** each page by focus area (AI Assistants, Inference, STT, TTS) and filters out noise
4. **LLM generates** an executive digest with competitive signals
5. Delivers via Slack and/or email

## Setup

```bash
pip install -r requirements.txt
```

Create a local `.env` from the sample and add secrets there (do not commit it):
```bash
cp .env.example .env
```

Required for LLM classification/summarization:
```
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini       # Optional override
```

Optional delivery settings:
```
SLACK_BOT_TOKEN=xoxb-...       # Slack delivery
SENDGRID_API_KEY=SG....        # Email delivery
SENDGRID_SENDER_EMAIL=...      # Email sender
```

## Usage

```bash
# Full run: scrape, classify, summarize, post to Slack
python tools/competitor_monitor.py

# Refresh one competitor and fail fast if inference is not configured
python tools/competitor_monitor.py --competitor ElevenLabs --require-inference --no-slack

# Skip LLM (raw results only)
python tools/competitor_monitor.py --no-classify

# Email digest
python tools/competitor_monitor.py --email user@example.com

# Dry run
python tools/competitor_monitor.py --no-slack --no-scrape --no-classify

# Custom time window
python tools/competitor_monitor.py --hours 48
```

See [workflows/competitor_monitoring.md](workflows/competitor_monitoring.md) for full details.

## Roadmap

- **Slack notifications** — Send daily digest to Max and Jake via Slack DM/channel
- **Linear ticket creation** — Automatically create Linear tickets for notable competitor updates that need team review
