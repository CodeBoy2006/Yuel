# Yuel Reading V0 Architecture

## Decision

Yuel Reading starts as a local-first, event-driven MV3 extension. The core product is not a webpage translator; it is a browser-side reading data pipeline that turns visible English reading behavior into local statistics, vocabulary exposure, and Pack-based insights.

## Runtime Shape

```text
Supported English website
  -> WXT content script
  -> text block snapshots and reading events
  -> MV3 background service worker
  -> Dexie / IndexedDB local tables
  -> popup, side panel, dashboard
```

The content script owns continuous page observation because it has direct DOM access. The background service worker stays limited to routing, alarms, side panel setup, and database writes because MV3 workers are not reliable long-running timers.

## First-Version Scope

Included:

- WXT Chrome MV3 scaffold.
- React popup, side panel, and dashboard entrypoints.
- Text block extraction for article, main, docs, markdown, heading, code, list, and blockquote content.
- Reading event contracts for page visibility, block visibility, viewport exposure, scroll velocity, idle/activity, and selection.
- Dexie schema for pages, chunks, chunk session/day caps, events, vocabulary exposures, saved items, and daily stats.
- Lightweight English tokenization using browser-native `Intl.Segmenter` for sentence splitting where available.
- Data-only Pack validation and matching for lexicon and phrase rules.

Deferred:

- Local AI and heavy NLP.
- Cross-device sync.
- PDF/EPUB reading.
- Pack marketplace and signature verification.
- Full runtime whitelist UI.

## Permission Model

The generated manifest uses mandatory permissions only for extension mechanics:

```text
activeTab, alarms, contextMenus, idle, sidePanel, scripting, storage
```

Broad host access is listed under `optional_host_permissions`. The first static content script is restricted to starter sites so the prototype can be loaded and tested without asking for every website.

## Data Model

The local database uses event sourcing plus aggregate-ready tables:

- `readingEvents`: short-lived behavior events.
- `pages`: hashed page identity and page-level counters.
- `textChunks`: hashed chunk identity and aggregate exposure fields.
- `chunkSessions`: per-session chunk effective-word caps.
- `chunkDays`: per-day chunk effective-word caps and raw/effective exposure fields.
- `vocabExposures`: long-lived lemma exposure memory.
- `savedItems`: only stores raw text when the user intentionally saves an item.
- `dailyStats`: report-facing daily aggregates.
- `readingPaceProfiles`: local WPM baselines by language and content type, seeded by onboarding or adaptive samples.

## Effective Reading Model

Yuel uses a Budgeted Exposure Model instead of scoring each visible chunk independently. The content script closes a viewport interval on timer flushes, visibility changes, page hide, stop, and visible-block composition changes. Each `TextViewportExposureTick` carries one `tickMs` budget, base WPM, active/document visibility, scroll WPM, idle age, and visible chunk snapshots with visible ratio, viewport-center distance, and content weight. Split chunks from long text elements keep DOM ranges and use `Range.getClientRects()` for text-level viewport geometry, so one partially visible parent paragraph does not make every child chunk look equally visible. Storage resolves the active reading pace profile before aggregation and overrides the collector default WPM when a calibrated or adaptive profile exists.

The storage layer caps the active WPM budget by currently visible weighted word supply, allocates the capped tick budget across eligible chunks by attention weight, applies per-chunk visible supply plus session and day caps before counting effective words, and uses lifetime coverage only to split new words from review words. Reading minutes are folded from effective words at the active base WPM rather than by summing chunk dwell time, so multiple visible blocks cannot multiply reading time and sparse visible text cannot inflate effective words beyond what is currently exposed.

Reading pace starts from an onboarding dashboard calibration: a fixed 200-260 word passage plus comprehension questions produces an initial WPM weighted by answer confidence. Later adaptive updates use an exponential moving average from high-confidence raw viewport samples only. A sample must come from a sufficiently long page, active and visible tab state, normal scroll speed, no long idle interval, and multiple reliable body chunks. The adaptive path intentionally does not compute WPM from `effectiveWords / minutes`, because those are already capped and folded outputs of the budget allocation.

## Pack Boundary

Packs are declarative data. V0 accepts `manifest`, `lexicon`, and `phrases`; validation rejects executable fields such as `scripts`, `code`, `eval`, and `wasmUrl`. This matches MV3 remote-code restrictions and keeps future commercial Packs auditable.
