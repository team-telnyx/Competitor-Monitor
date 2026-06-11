# PLG-66: CPaaS / Telephony / Messaging Competitor Source Registry

## Telnyx Product Surface (what we're defending)

| Product | Category | Competitors |
|---------|----------|-------------|
| Voice API / Call Control | Programmable Voice | Twilio, Vonage, Plivo, SignalWire, Bandwidth |
| Elastic SIP Trunking | Telephony / SIP | Twilio, Bandwidth, Vonage, SignalWire |
| SMS / MMS API | Messaging | Twilio, Sinch, Plivo, Infobip, Bandwidth, Bird / MessageBird, Vonage |
| WhatsApp Business API | Messaging Channels | Twilio, Sinch, Infobip, Bird / MessageBird, Vonage |
| 10DLC Registration / Compliance | Messaging Compliance | Twilio, Bandwidth, Sinch, Vonage, Plivo |
| Number Search / Number Ordering / Number Management | Numbers | Twilio, Bandwidth, Plivo, Vonage |
| Number Porting | Numbers / Operations | Bandwidth, Twilio, Vonage, Plivo |
| Verify API | Identity / OTP | Twilio Verify, Vonage Verify, Telesign, Sinch |
| Fax API | CPaaS / Legacy Messaging | Twilio, eFax-like providers, limited overlap |
| Pricing / Packaging | Competitive Positioning | All CPaaS competitors |

---

## Competitor Source Registry

### 1. Telnyx (Internal Baseline / Product Surface)

| Source | URL | Type | Fetchable | Has Dates | lastmod | Detection | Notes |
|--------|-----|------|:---------:|:---------:|:-------:|-----------|-------|
| Release Notes | https://telnyx.com/release-notes | Release notes | Yes | Yes | Via sitemap | Sitemap + content diff | Primary official Telnyx update feed |
| Voice API Release Notes | https://telnyx.com/release-notes/tag/voice-api | Release-note tag | Yes | Yes | Via sitemap | Sitemap + content diff | Voice API / Call Control updates |
| Telephony Release Notes | https://telnyx.com/release-notes/tag/telephony | Release-note tag | Yes | Yes | Via sitemap | Sitemap + content diff | Broader telephony/SIP/network updates |
| Messaging Release Notes | https://telnyx.com/release-notes/tag/messaging | Release-note tag | Yes | Yes | Via sitemap | Sitemap + content diff | SMS/MMS/Messaging API updates |
| 10DLC Release Notes | https://telnyx.com/release-notes/tag/10dlc | Release-note tag | Yes | Yes | Via sitemap | Sitemap + content diff | Messaging compliance changes |
| WhatsApp Release Notes | https://telnyx.com/release-notes/tag/whatsapp | Release-note tag | Yes | Yes | Via sitemap | Sitemap + content diff | WhatsApp Business API updates |
| Numbers Release Notes | https://telnyx.com/release-notes/tag/numbers | Release-note tag | Yes | Yes | Via sitemap | Sitemap + content diff | Number ordering/management updates |
| Verify Release Notes | https://telnyx.com/release-notes/tag/verify-api | Release-note tag | Yes | Yes | Via sitemap | Sitemap + content diff | Verify API / OTP changes |
| Telnyx Sitemap | https://telnyx.com/sitemap.xml | Sitemap | Yes | — | Yes | Lastmod | ~2K URLs; filter to release-notes/products/pricing/resources |
| Developer Sitemap | https://developers.telnyx.com/sitemap.xml | Sitemap | Yes | — | Yes | Lastmod | Best source for docs/API-reference changes |
| Developer Docs Index | https://developers.telnyx.com/llms.txt | Docs index | Yes | — | N/A | Content diff | Machine-readable docs index; useful for `.md` URLs |

**Product area tags:** Voice API, SIP Trunking, Messaging, SMS, MMS, WhatsApp, 10DLC, Numbers, Verify, Fax, Pricing
**Scraping constraints:** Telnyx is highly scrapeable. Best path is release-note tag monitoring plus developer sitemap monitoring. Current repo can handle sitemaps, but needs fixed-page content diffing for tag/index pages and pricing/product pages.

---

### 2. Twilio (Broad CPaaS Platform)

| Source | URL | Type | Fetchable | Has Dates | lastmod | Detection | Notes |
|--------|-----|------|:---------:|:---------:|:-------:|-----------|-------|
| Changelog | https://www.twilio.com/en-us/changelog | Changelog | Yes | Yes | Yes | Lastmod | Highest-signal Twilio product update source |
| Blog | https://www.twilio.com/en-us/blog | Blog | Yes | Yes | Yes | Lastmod | Product launches, compliance, customer/industry content |
| Sitemap | https://www.twilio.com/sitemap.xml | Sitemap index | Yes | — | Yes | Lastmod | Large sitemap; must filter to `/en-us/changelog`, `/en-us/blog`, docs/product paths |
| Status Feed | https://status.twilio.com/history.atom | Atom feed | Yes | Yes | N/A | RSS/Atom parser needed | Current repo does not support Atom feeds |

**Product area tags:** Voice API, Messaging, SMS, MMS, WhatsApp, Verify, Numbers, SIP, CPaaS Platform
**Scraping constraints:** Changelog and sitemap are reliable. Current repo can monitor Twilio via sitemap + include filters. Atom status feed requires RSS/Atom support.

---

### 3. Vonage (Communications APIs)

| Source | URL | Type | Fetchable | Has Dates | lastmod | Detection | Notes |
|--------|-----|------|:---------:|:---------:|:-------:|-----------|-------|
| Release Notes | https://developer.vonage.com/en/release-notes | Release notes | Yes | Yes | Unknown | Content diff / sitemap if available | Strong developer-facing product source |
| Developer Blog | https://developer.vonage.com/en/blog | Blog | Yes | Yes | Unknown | Content diff / sitemap if available | Product launches, API changes, tutorials |
| Status Page | https://www.vonage.com/communications-apis/status/ | Status | Partial | Yes | N/A | Browser/API likely needed | May block simple requests or use third-party status tooling |
| Sitemap | https://developer.vonage.com/sitemap.xml | Sitemap | Needs validation | — | Unknown | Sitemap if parseable | Candidate discovery source |

**Product area tags:** Voice API, SMS, Messaging, WhatsApp, Verify, CPaaS
**Scraping constraints:** Developer release notes are the best source. May need direct fixed-page diffing if sitemap coverage is incomplete. Status may require custom handling.

---

### 4. Sinch (Messaging / Omnichannel CPaaS)

| Source | URL | Type | Fetchable | Has Dates | lastmod | Detection | Notes |
|--------|-----|------|:---------:|:---------:|:-------:|-----------|-------|
| SMS API Release Notes | https://developers.sinch.com/docs/sms/release-notes/ | Release notes | Yes | Yes | Unknown | Content diff / docs scrape | High-signal for SMS API changes |
| Blog | https://www.sinch.com/blog/ | Blog | Partial | Yes | Unknown | Browser or content diff | May block scripted requests |
| Status Feed | https://status.sinch.com/history.atom | Atom feed | Yes | Yes | N/A | RSS/Atom parser needed | Current repo does not support Atom feeds |
| Developer Sitemap | https://developers.sinch.com/sitemap.xml | Sitemap | Needs validation | — | Unknown | Sitemap if parseable | Candidate docs discovery source |

**Product area tags:** SMS, Messaging, WhatsApp, RCS, Omnichannel, CPaaS
**Scraping constraints:** SMS release notes are the priority. Atom status feed requires repo enhancement. Blog may require browser-capable scraping or should be lower priority.

---

### 5. Bandwidth (Voice / Messaging / Numbers)

| Source | URL | Type | Fetchable | Has Dates | lastmod | Detection | Notes |
|--------|-----|------|:---------:|:---------:|:-------:|-----------|-------|
| Release Notes | https://support.bandwidth.com/hc/en-us/sections/360008699214-Release-Notes | Support release notes | Partial | Yes | Unknown | Zendesk scrape / content diff | Official release notes, but may be protected by Cloudflare/Zendesk behavior |
| Blog | https://www.bandwidth.com/blog/ | Blog | Yes | Yes | Unknown | Sitemap + content diff | Product announcements and regulatory content |
| Status Feed | https://status.bandwidth.com/history.atom | Atom feed | Yes | Yes | N/A | RSS/Atom parser needed | Current repo does not support Atom feeds |
| Sitemap | https://www.bandwidth.com/sitemap.xml | Sitemap | Yes | — | Likely | Lastmod / snapshot diff | Candidate discovery source |

**Product area tags:** Voice, SIP, Messaging, SMS, Numbers, 10DLC, Emergency Calling
**Scraping constraints:** Bandwidth is important for Telnyx voice/numbers parity. Status and release-note feeds need custom handling. Blog/sitemap should be usable by current repo with filters.

---

### 6. Plivo (Voice / SMS CPaaS)

| Source | URL | Type | Fetchable | Has Dates | lastmod | Detection | Notes |
|--------|-----|------|:---------:|:---------:|:-------:|-----------|-------|
| Changelog | https://www.plivo.com/changelog/ | Changelog | Yes | Yes | Via sitemap likely | Sitemap + content diff | Primary official product/API update source |
| Blog | https://www.plivo.com/blog/ | Blog | Yes | Yes | Via sitemap likely | Sitemap + content diff | Product launches and API/compliance content |
| Sitemap | https://www.plivo.com/sitemap.xml | Sitemap | Yes | — | Likely | Lastmod / snapshot diff | Candidate discovery source |
| Status Feed | https://status.plivo.com/history.atom | Atom feed | Yes | Yes | N/A | RSS/Atom parser needed | Current repo does not support Atom feeds |

**Product area tags:** Voice API, SMS API, Numbers, CPaaS
**Scraping constraints:** Plivo should be straightforward through sitemap + changelog. Status feed requires RSS/Atom support.

---

### 7. Infobip (Messaging / Omnichannel Platform)

| Source | URL | Type | Fetchable | Has Dates | lastmod | Detection | Notes |
|--------|-----|------|:---------:|:---------:|:-------:|-----------|-------|
| Release Notes | https://www.infobip.com/docs/release-notes | Release notes | Yes | Yes | Unknown | Docs scrape / content diff | Strong official release-note source |
| Blog | https://www.infobip.com/blog | Blog | Yes | Yes | Unknown | Sitemap + content diff | Product launches, channel updates, marketing content |
| Sitemap | https://www.infobip.com/sitemap.xml | Sitemap | Yes | — | Likely | Lastmod / snapshot diff | Candidate discovery source |
| Status Feed | https://status.infobip.com/history.atom | Atom feed | Yes | Yes | N/A | RSS/Atom parser needed | Current repo does not support Atom feeds |

**Product area tags:** SMS, MMS, RCS, WhatsApp, Omnichannel, CPaaS
**Scraping constraints:** Release notes are the best source. Blog is useful but noisy. Atom feed needs repo enhancement.

---

### 8. Bird / MessageBird (Messaging / Channels)

| Source | URL | Type | Fetchable | Has Dates | lastmod | Detection | Notes |
|--------|-----|------|:---------:|:---------:|:-------:|-----------|-------|
| Product Updates | https://docs.bird.com/applications/bird-documentation/product-updates | Docs product updates | Yes | Yes | Unknown | Docs scrape / content diff | Official Bird product update source |
| Bird Updates | https://docs.bird.com/applications/help-and-reference/bird-updates | Docs updates | Yes | Yes | Unknown | Docs scrape / content diff | Secondary official update source |
| Blog | https://bird.com/en-us/resources/blog | Blog | Yes | Yes | Unknown | Sitemap + content diff | Product/company announcements |
| Sitemap | https://bird.com/sitemap.xml | Sitemap | Needs validation | — | Unknown | Sitemap if parseable | Candidate discovery source |
| Status Feed | https://status.bird.com/history.atom | Atom feed | Yes | Yes | N/A | RSS/Atom parser needed | Current repo does not support Atom feeds |

**Product area tags:** Messaging, SMS, WhatsApp, Email, Omnichannel, Channels
**Scraping constraints:** Bird has moved away from old MessageBird developer URLs. Use Bird docs/product-update pages, not stale MessageBird changelog URLs. RSS/Atom support needed for status.

---

### 9. Telesign (Verify / SMS / Identity)

| Source | URL | Type | Fetchable | Has Dates | lastmod | Detection | Notes |
|--------|-----|------|:---------:|:---------:|:-------:|-----------|-------|
| Changelog | https://developer.telesign.com/enterprise/changelog | Changelog | Yes | Yes | Unknown | Content diff / RSS preferred | Official developer changelog |
| Changelog RSS | https://developer.telesign.com/enterprise/changelog.rss | RSS | Yes | Yes | N/A | RSS parser needed | Best machine-readable source, but current repo does not support RSS |
| Blog | https://www.telesign.com/blog | Blog | Partial | Yes | Unknown | Browser/content diff | May be Cloudflare-protected |
| Status Feed | https://status.telesign.com/history.atom | Atom feed | Yes | Yes | N/A | RSS/Atom parser needed | Current repo does not support Atom feeds |

**Product area tags:** Verify, SMS OTP, Voice OTP, Identity, Fraud Prevention
**Scraping constraints:** Telesign’s RSS changelog is likely the best source, but repo needs RSS support. HTML changelog may work as fallback.

---

### 10. SignalWire (Programmable Voice / Messaging / SIP)

| Source | URL | Type | Fetchable | Has Dates | lastmod | Detection | Notes |
|--------|-----|------|:---------:|:---------:|:-------:|-----------|-------|
| Release Notes Entrypoint | https://developer.signalwire.com/release-notes/ | Release notes | Partial | Unknown | Unknown | Docs scrape / sitemap if parseable | Redirects into docs; exact structure needs validation |
| Blog | https://signalwire.com/blogs | Blog | Yes | Yes | Unknown | Sitemap + content diff | Product announcements and platform content |
| Sitemap | https://developer.signalwire.com/sitemap.xml | Sitemap | Partial | — | Unknown | May need parser hardening | Repo encountered malformed sitemap content in testing |
| Status Page | https://status.signalwire.com/ | Status | Yes | Yes | N/A | Custom status scrape | PagerDuty/trust-style status page |

**Product area tags:** Voice API, SIP, Messaging, Video, CPaaS
**Scraping constraints:** SignalWire likely needs some parser hardening. Blog is usable. Developer sitemap may not be clean XML. Status is not a standard sitemap feed.

---

### 11. Voximplant (Voice / Video / CPaaS)

| Source | URL | Type | Fetchable | Has Dates | lastmod | Detection | Notes |
|--------|-----|------|:---------:|:---------:|:-------:|-----------|-------|
| Release Page | https://kit-release.voximplant.com/ | Release page | Yes | Yes | Unknown | Content diff | Official Vox Releases page |
| SDK Changelog | https://voximplant.com/docs/references/ios_v3/changelog | Docs changelog | Yes | Yes | Unknown | Docs scrape / content diff | SDK-level updates |
| Sitemap | https://voximplant.com/sitemap.xml | Sitemap | Yes | — | Unknown | Sitemap / snapshot diff | Candidate discovery source |
| Status Feed | https://status.voximplant.com/history.atom | Atom feed | Yes | Yes | N/A | RSS/Atom parser needed | Current repo does not support Atom feeds |

**Product area tags:** Voice API, Video, Messaging, SDKs, CPaaS
**Scraping constraints:** More voice/video-oriented than messaging. Release page is scrapeable but likely needs fixed URL content diffing.

---

### 12. AWS End User Messaging / SNS (Cloud Messaging)

| Source | URL | Type | Fetchable | Has Dates | lastmod | Detection | Notes |
|--------|-----|------|:---------:|:---------:|:-------:|-----------|-------|
| AWS What's New Filter | https://aws.amazon.com/about-aws/whats-new/?awsf.whats-new-products=general-products%23amazon-simple-notification-service | Product updates | Yes | Yes | Unknown | Content diff / AWS feed if found | Official announcements for SNS / messaging-adjacent updates |
| AWS SMS Voice Docs | https://docs.aws.amazon.com/sms-voice/latest/userguide/what-is-service.html | Docs | Yes | Unknown | Unknown | Docs diff | Useful if no clean changelog exists |
| AWS Sitemap | N/A | Sitemap | No | — | — | — | Common sitemap URL did not work in testing |

**Product area tags:** SMS, Cloud Messaging, SNS, End User Messaging
**Scraping constraints:** AWS is relevant but less direct than pure CPaaS vendors. Needs content-diffing or AWS-specific feed discovery rather than current repo’s sitemap-first approach.

---

### 13. Microsoft Azure Communication Services

| Source | URL | Type | Fetchable | Has Dates | lastmod | Detection | Notes |
|--------|-----|------|:---------:|:---------:|:-------:|-----------|-------|
| ACS What's New | https://learn.microsoft.com/en-us/azure/communication-services/whats-new | Docs updates | Yes | Yes | Unknown | Docs scrape / content diff | Highest-signal Azure Communication Services source |
| Azure Updates Filter | https://azure.microsoft.com/en-us/updates/?category=communication-services | Product updates | Yes | Yes | Unknown | Content diff | Captures broader ACS platform announcements |
| Azure Status | https://azure.status.microsoft/en-us/status | Status | Yes | Yes | N/A | Custom status scrape | Too broad unless ACS filtering is possible |
| Sitemap | N/A | Sitemap | No | — | — | — | Common sitemap URLs did not work in testing |

**Product area tags:** SMS, Voice, Email, Chat, Communication Services, Cloud CPaaS
**Scraping constraints:** Good source quality, but Microsoft sources are not a clean fit for the current sitemap-first repo. Best handled with direct URL content diffing.

---

## Relevant-Update Rules

### What counts as a relevant product update

| Category | Relevant (monitor) | Irrelevant (ignore) |
|----------|-------------------|---------------------|
| **Voice API** | Call control features, conferencing, recording, media streaming, SIP interop, voice quality improvements, new endpoints | Generic “what is VoIP” content, customer stories without product detail |
| **SIP Trunking** | Elastic SIP changes, trunking features, routing, failover, regions, emergency calling, network updates | High-level telecom explainers |
| **Messaging** | SMS/MMS/RCS/WhatsApp API changes, deliverability tooling, message analytics, new channels | Generic marketing about customer engagement |
| **10DLC / Compliance** | Registration flow changes, campaign rules, carrier requirements, throughput/rate-limit changes | Old evergreen compliance guides with no new policy |
| **Numbers** | Number search/order/porting changes, coverage expansion, inventory, provisioning workflows | SEO pages about “business phone numbers” |
| **Verify / Identity** | OTP delivery changes, fraud controls, verification channels, pricing or coverage changes | General security thought leadership |
| **Pricing / Packaging** | Public pricing changes, new tiers, carrier fee changes, bundled packages | Promotional content without concrete price/package details |
| **Platform / API** | SDK releases, deprecations, breaking changes, new API versions, new regions | Cosmetic docs changes, unrelated API changes |

### Signals that indicate product movement

- “Now available,” “launching,” “generally available,” or “beta”
- New API endpoint, SDK, version, channel, product, or region
- Throughput, latency, reliability, deliverability, or quality claims
- Pricing, packaging, fee, or billing model changes
- Compliance/regulatory changes affecting messaging or numbers
- Deprecation, migration, or breaking-change notices
- New self-service workflows or dashboard/reporting capabilities
- Competitive comparison pages that reveal positioning changes

---

## Blocked / Unreliable Sources

| Competitor | Source | Issue | Workaround |
|-----------|--------|-------|------------|
| Twilio | Status history Atom | Repo cannot parse RSS/Atom | Add RSS/Atom parser or skip status feeds |
| Sinch | Status history Atom | Repo cannot parse RSS/Atom | Add RSS/Atom parser |
| Bandwidth | Status history Atom | Repo cannot parse RSS/Atom | Add RSS/Atom parser |
| Bandwidth | Support release notes | May be Zendesk/Cloudflare-protected | Use browser-capable scraper or lower cadence manual validation |
| Plivo | Status history Atom | Repo cannot parse RSS/Atom | Add RSS/Atom parser |
| Infobip | Status history Atom | Repo cannot parse RSS/Atom | Add RSS/Atom parser |
| Bird / MessageBird | Status history Atom | Repo cannot parse RSS/Atom | Add RSS/Atom parser |
| Telesign | Changelog RSS | Repo cannot parse RSS | Add RSS parser; use HTML changelog as fallback |
| Telesign | Blog | May be Cloudflare-protected | Prefer developer changelog/RSS |
| SignalWire | Developer sitemap | May be malformed or timeout-prone | Harden sitemap parser; use blog/status fallback |
| AWS | Sitemap | Common sitemap URLs failed | Use AWS What's New page/feed-specific discovery |
| Azure | Sitemap | Common sitemap URLs failed | Use direct content-diffing of ACS pages |
| Fixed product/pricing pages | Telnyx and competitors | Current repo does not content-diff fixed URLs | Add fixed URL snapshot/content-hash diffing |

---

## Detection Method Summary

| Competitor | Primary Detection | Backup | lastmod Available |
|-----------|------------------|--------|:-----------------:|
| Telnyx | Lastmod via sitemap + release-note tags | Fixed-page content diff | Yes |
| Twilio | Lastmod via sitemap + changelog | Blog filters | Yes |
| Vonage | Release-note page content diff | Developer sitemap if parseable | Unknown |
| Sinch | SMS release-note page content diff | Developer sitemap if parseable | Unknown |
| Bandwidth | Sitemap/blog + support release-note scrape | Browser-capable Zendesk scrape | Unknown |
| Plivo | Sitemap + changelog | Blog scrape | Likely |
| Infobip | Sitemap + docs release notes | Blog scrape | Likely |
| Bird / MessageBird | Docs product-update content diff | Bird sitemap if parseable | Unknown |
| Telesign | RSS changelog | HTML changelog scrape | RSS has dates |
| SignalWire | Blog/content diff | Sitemap parser hardening | Unknown |
| Voximplant | Release-page content diff | Sitemap / SDK changelog | Unknown |
| AWS End User Messaging | AWS What's New content diff | Docs diff | Unknown |
| Azure Communication Services | ACS What's New content diff | Azure Updates filter | Unknown |

---

## Domain-Specific Categorization Tags

Every detected page should be classified into one or more of:

```text
voice_api          — Programmable voice, call control, conferencing, recording, media streaming
sip_trunking       — Elastic SIP, trunking, routing, failover, interconnect, emergency calling
messaging          — SMS, MMS, Messaging API, delivery, analytics, campaign messaging
whatsapp           — WhatsApp Business API, WhatsApp calling, templates, channel changes
rcs                — RCS messaging, rich messaging, branded sender experiences
ten_dlc            — A2P 10DLC, campaign registration, brand registration, carrier compliance
numbers            — Number search, ordering, management, porting, inventory, provisioning
verify             — OTP, identity verification, fraud prevention, SMS/voice verification
pricing            — Public pricing, packaging, fees, billing models, tier changes
platform           — SDKs, APIs, dashboard features, regions, deprecations, breaking changes
reliability        — Status incidents, outages, network availability, delivery degradation
```

---

## Example: Relevant vs. Irrelevant Updates

### Relevant

| Update | Competitor | Tags | Why |
|--------|-----------|------|-----|
| “Messaging API now supports RCS messages” | Twilio / Telnyx / Infobip | messaging, rcs | New messaging channel capability |
| “A2P 10DLC campaign registration flow updated” | Twilio / Bandwidth / Telnyx | ten_dlc, messaging | Compliance/onboarding workflow change |
| “New Call Control recording controls available” | Telnyx / Twilio / SignalWire | voice_api, platform | New programmable voice feature |
| “Elastic SIP trunking pricing updated for US termination” | Telnyx / Bandwidth / Twilio | sip_trunking, pricing | Competitive pricing signal |
| “WhatsApp Business API supports new authentication templates” | Sinch / Infobip / Vonage | whatsapp, messaging | Channel/product capability change |
| “Phone number porting API adds bulk status endpoint” | Telnyx / Bandwidth / Plivo | numbers, platform | New operational/API capability |
| “Verify API launches silent network authentication” | Telesign / Vonage / Twilio | verify, identity | Product expansion in verification/identity |
| “Messaging deliverability dashboard launched” | Telnyx / Twilio / Sinch | messaging, platform | Dashboard/analytics capability relevant to PLG |

### Irrelevant

| Update | Competitor | Why Skip |
|--------|-----------|----------|
| “What is CPaaS?” | Any | Generic SEO explainer, no product movement |
| “Top 10 SMS marketing strategies” | Any | Marketing content unless tied to a new product/feature |
| “Customer story: retailer improves engagement” | Any | No concrete product/API/platform update |
| “Careers page updated” | Any | Operational noise |
| “Privacy policy updated” | Any | Legal/compliance site noise unless it impacts product behavior |
| “Generic telecom trends report” | Any | Thought leadership, not product intelligence |
| “How to send your first SMS” | Any | Tutorial for existing feature, no new capability |
