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
- Text block extraction for article, main, docs, markdown, list, and blockquote content.
- Reading event contracts for page visibility, block visibility, and selection.
- Dexie schema for pages, chunks, events, vocabulary exposures, saved items, and daily stats.
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
- `vocabExposures`: long-lived lemma exposure memory.
- `savedItems`: only stores raw text when the user intentionally saves an item.
- `dailyStats`: report-facing daily aggregates.

## Pack Boundary

Packs are declarative data. V0 accepts `manifest`, `lexicon`, and `phrases`; validation rejects executable fields such as `scripts`, `code`, `eval`, and `wasmUrl`. This matches MV3 remote-code restrictions and keeps future commercial Packs auditable.
