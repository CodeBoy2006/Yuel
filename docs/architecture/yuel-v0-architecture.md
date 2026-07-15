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

The content script owns continuous page observation because it has direct DOM access. It keeps a per-page collector run for the current snapshot and uses a lightweight dynamic-page manager around that run: readable DOM mutations schedule a debounced same-route snapshot refresh, while URL changes from client-side navigation trigger a page lifecycle flush and a fresh page snapshot. The background service worker stays limited to routing, alarms, side panel setup, and database writes because MV3 workers are not reliable long-running timers.

## First-Version Scope

Included:

- WXT Chrome MV3 scaffold.
- React popup, side panel, and dashboard entrypoints.
- Text block extraction for article, main, docs, markdown, heading, code, list, and blockquote content.
- Dynamic SPA refresh support for later content injection, infinite-scroll additions, and client-side route replacement.
- Reading event contracts for page visibility, block visibility, viewport exposure, scroll velocity, idle/activity, and selection.
- Dexie schema for pages, chunks, chunk session/day caps, events, durable reading sessions, vocabulary exposures, saved items, and daily stats.
- Lightweight English tokenization using browser-native `Intl.Segmenter` for sentence splitting where available.
- Data-only Pack validation and matching for lexicon and phrase rules.

Deferred:

- Local AI and heavy NLP.
- Cross-device sync.
- PDF/EPUB reading.
- Pack marketplace and signature verification.

## Permission Model

The generated manifest uses these required extension permissions:

```text
activeTab, alarms, contextMenus, favicon, idle, sidePanel, scripting, storage, tabs
```

The required `tabs` permission lets the persistent side panel resolve the active tab URL after tab switches. Required host permissions cover `http://*/*` and `https://*/*`, and the static content script uses the same matches so reading collection starts without an application-level allowlist or manual enable action. Chrome still controls whether the extension can run globally or on an individual site; UI surfaces report that browser-controlled restriction without trying to request permission at runtime.

## Data Model

The local database uses event sourcing plus aggregate-ready tables:

- `readingEvents`: short-lived behavior events.
- `readingSessions`: durable effective-reading intervals, merged within a five-minute gap and used for cross-page focus-session reporting.
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

Reading pace starts from an onboarding dashboard calibration: one randomly selected 200-260 word passage from a local material pool plus its matched comprehension questions produces an initial WPM weighted by answer confidence. The selected material remains fixed for the complete reading and question session, while its timer accumulates only visible, focused reading time.

Later adaptive updates use persisted progression episodes on sufficiently long pages. Continuous scroll events are measured against one settled gesture anchor until 750 ms of quiet; adaptive termination uses `5 x` the active WPM rather than the engagement model's earlier `1.6 x` decay point. Scroll events also carry absolute offset and extent so storage can tolerate a small reverse band of `1.5%` of page extent, bounded to 80-240 px, before ending an episode. Readable DOM changes, web viewport resizing, and PDF zoom or rotation emit a page-scoped coordinate reset that clears only persisted pixel progress and the current gesture baseline. Qualified episodes must still provide active and visible tab state, no long idle interval, central-band dwell, forward segment completion, minimum words, minimum segment count, and minimum active time.

Each accepted episode immediately enters the slow EMA. Confidence is derived from completed words, completed segments, and active duration, then multiplies the current `0.12 / 0.06 / 0.03` EMA step. The storage parser continues after episode boundaries and applies multiple accepted samples from one event batch in order. `adaptiveSampleCount` therefore counts accepted episodes directly; default pace is represented by no stored profile rather than a buffer record. The adaptive path intentionally does not compute WPM from `effectiveWords / minutes`, because those are already capped and folded outputs of the budget allocation.

## Pack Boundary

Packs are declarative data. V0 accepts `manifest`, `lexicon`, and `phrases`; validation rejects executable fields such as `scripts`, `code`, `eval`, and `wasmUrl`. This matches MV3 remote-code restrictions and keeps future commercial Packs auditable.
