# Workflow: AI/Voice Competitor Monitoring

## Objective
Daily automated scan of competitor websites to detect new pages and product updates related to **AI assistants, inference, STT, and TTS**. Results are classified by an LLM, summarized into an executive digest, and delivered via Slack/email.

## Focus Areas
- **AI Assistants** — voice agents, conversational AI, virtual assistants, agent frameworks
- **Inference** — LLM hosting, model serving, real-time inference, API endpoints
- **STT (Speech-to-Text)** — transcription, ASR, real-time speech recognition, diarization
- **TTS (Text-to-Speech)** — voice synthesis, voice cloning, audio generation, voice models

## How It Works

1. **Discovery** — Fetches each competitor's sitemap(s), detects new pages via `<lastmod>` dates or snapshot diffs
2. **Scraping** — Extracts title, description, and content preview from each new page
3. **Classification** — Claude Haiku classifies each page by focus area and filters out irrelevant content (careers, legal, marketing fluff)
4. **Summarization** — Claude generates a categorized executive digest highlighting competitive signals
5. **Delivery** — Posts digest to Slack and/or sends email

## Competitors Monitored

### Direct Voice AI
| Competitor | Detection Method | Has `lastmod` | Focus |
|-----------|-----------------|:---:|-------|
| Vapi | Snapshot diff | No | Voice agents, orchestration |
| ElevenLabs | Lastmod | Yes | TTS, voice cloning, audio AI |
| Retell AI | Snapshot diff | No | Voice agents, contact center AI |
| Bland AI | Lastmod | Yes | Voice agents, phone AI |

### Transcription / Audio AI
| Competitor | Detection Method | Has `lastmod` | Focus |
|-----------|-----------------|:---:|-------|
| Deepgram | Snapshot diff | No | STT, audio intelligence |
| AssemblyAI | Snapshot diff | No | STT, audio intelligence |

### Platform Competitors
| Competitor | Detection Method | Has `lastmod` | Focus |
|-----------|-----------------|:---:|-------|
| Twilio | Lastmod | Yes | Blog, changelog, press (filtered to en-us) |
| OpenAI | Lastmod | Yes | Realtime API, inference, audio models |
| Google Cloud | Lastmod | Yes | Speech-to-Text, Text-to-Speech, Vertex AI |

## Tool to Execute
`tools/competitor_monitor.py`

## Running Manually
```bash
# Default: last 24h, scrape, classify, summarize
python tools/competitor_monitor.py

# Skip LLM classification (faster, raw results only)
python tools/competitor_monitor.py --no-classify

# Check last 48 hours
python tools/competitor_monitor.py --hours 48

# Dry run (no Slack, no scraping, no classification)
python tools/competitor_monitor.py --no-slack --no-scrape --no-classify

# Send email digest
python tools/competitor_monitor.py --email user@example.com
```

## Environment Variables
| Variable | Required | Purpose |
|----------|----------|---------|
| `ANTHROPIC_API_KEY` | For classification | LLM-based relevance filtering and digest |
| `SLACK_BOT_TOKEN` | For Slack | Post digest to Slack channel |
| `SLACK_COMPETITOR_CHANNEL` | Optional | Slack channel (defaults to `#product-intel`) |
| `SENDGRID_API_KEY` | For email | Send digest via email |
| `SENDGRID_SENDER_EMAIL` | For email | Sender address for email |

## Adding a New Competitor
Edit the `COMPETITORS` list in `tools/competitor_monitor.py`:
```python
{
    "name": "CompanyName",
    "sitemap_urls": ["https://company.com/sitemap.xml"],
    "include_patterns": [r"/blog/", r"/changelog/"],
    "exclude_patterns": [r"/careers/", r"/legal/"],
    "use_snapshot_diff": True,  # if no lastmod dates available
}
```

## Known Constraints
- **No lastmod = snapshot diff**: Competitors without `<lastmod>` use snapshot diffs. First run saves a baseline with 0 results.
- **LLM classification costs**: Uses Claude Haiku (~$0.001 per classification batch). Negligible for daily runs.
- **JS-rendered sitemaps**: Standard XML sitemaps only.
- **Rate limiting**: Pages scraped sequentially to avoid blocks.
- **Google Cloud sitemap**: Very large. Include filters keep scan time reasonable.

## Learnings Log
*Document issues encountered and solutions found here*
