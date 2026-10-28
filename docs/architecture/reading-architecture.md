# Yuel Reading Architecture

Yuel is a local-first, event-driven MV3 extension. Web and PDF adapters feed one reading-session protocol; the background validates and persists measurements, and extension pages query local aggregates. User-facing controls and privacy behavior are documented in the [README](../../README.md).

## Runtime ownership

```text
Web DOM -> content adapter -----+
                               +-> shared reading session -> runtime messages
PDFium -> PDF analytics adapter +                                |
                                                                v
UI pages <- local queries <- Dexie / IndexedDB <- background validation + aggregation
```

- [`entrypoints/`](../../entrypoints/) wires WXT's content script, background worker, popup, side panel, dashboard, and PDF reader.
- [`src/content/`](../../src/content/) owns English-content eligibility, DOM snapshots, dynamic-page refresh, and text-range geometry. The observer stays alive on initially empty SPAs; readable mutations refresh a snapshot, and client-side navigation flushes the old lifecycle before starting the next one. Accepted reading ancestors prevent nested text duplication.
- [`src/analytics/`](../../src/analytics/) owns the source-neutral session, ordered delivery/retry, lifecycle events, focus/idle state, scroll gestures, hashed selections, viewport geometry, and exposure heartbeat. Adapters provide source geometry rather than separate scoring systems.
- [`src/background/`](../../src/background/) owns message routing/authorization, snapshot registration, maintenance alarms, context-menu saving, PDF handler registration, and toolbar updates. Continuous observation stays in the page, not in an MV3 worker timer.
- [`src/domain/`](../../src/domain/) contains contracts and pure metric, pace, and Pack rules; [`src/analysis/`](../../src/analysis/) contains shared English tokenization and chunking.
- [`src/storage/`](../../src/storage/) owns schema, transactional writes, aggregate updates, excerpt invariants, and read-side reports. [`src/permissions/`](../../src/permissions/) combines Chrome access with local recording preferences.
- [`src/pdf/`](../../src/pdf/) owns source acquisition, packaged PDFium/plugin setup, viewer interaction, companion tasks, and the PDF analytics adapter.

The exact permissions, HTTP(S) host matches, MIME registration, reader web accessibility, and WASM-compatible CSP are defined in [`wxt.config.ts`](../../wxt.config.ts). `tabs` supports persistent active-tab context; `declarativeNetRequestWithHostAccess` supports PDF fallback routing. Chrome access and Yuel's global/site switches are independent gates. Collectors react to setting changes; the background rechecks recording authorization before writes.

## Snapshot and event delivery

Web snapshots derive a stable `snapshotId` from page metadata and ordered chunks. The first flush sends `yuel.readingPageSnapshot.register` with the full snapshot and events; later flushes send `yuel.readingEvents.referenceBatch` with only the ID and events.

The [snapshot registry](../../src/background/readingSnapshotRegistry.ts) is sender-scoped, uses LRU eviction, holds at most **32** entries, and expires entries after **30 minutes** of inactivity. It is memory-only. Worker suspension or eviction yields `snapshot-missing`; the client re-registers and replays the same event IDs. Storage deduplicates persisted and incoming IDs within its transaction.

`yuel.readingEvents.batch` remains supported for existing content scripts and PDF readers. A PDF batch includes document-level `totalWords` but only the chunks referenced by that batch's visibility events. One PDF resource maps to one page aggregate; physical pages use stable `sectionId` values on chunks. Storage accumulates unique coverage while the resource identity matches.

[`contracts.ts`](../../src/messaging/contracts.ts), [`readingEventsClient.ts`](../../src/messaging/readingEventsClient.ts), and [`readingMessage.ts`](../../src/background/readingMessage.ts) define validation, retries, and snapshot recovery. Reconstructed reference batches pass through the same authorization and storage path as full batches.

## Reading model

### Shared chunks and attention geometry

[`textChunks.ts`](../../src/analysis/textChunks.ts) uses the same English word boundaries as counting, including URLs and code without whitespace. It preserves sentence boundaries where possible, rebalances toward an 8-word minimum, targets 16–24 words, and permits short source text. `Intl.Segmenter` supplies sentence boundaries when available.

Web element intersection is a coarse filter. `Range.getClientRects()` measures individual chunks, including chunks inside long paragraphs or nested scrollers. [`viewportGeometry.ts`](../../src/analytics/viewportGeometry.ts) sums visible word mass with Gaussian attention weighting. Web content-rate multipliers are **0.2** for code/preformatted text, **0.6** for headings, **0.8** for list items, and **1** for prose.

The shared session samples exposure every **one second** and closes intervals on visibility/composition changes and lifecycle transitions. It omits ticks under **250 ms** or without visible chunks. Ordered batches normally flush every **15 seconds**, with additional lifecycle flushes and retries.

### Budgeted Exposure Model v2

[`allocateReadingBudget`](../../src/domain/metrics.ts) allocates attention time first, then converts it into words:

1. Gate the interval by active/focused document state, idle decay, and scroll-speed decay: `timeBudgetMs = tickMs × engagementWeight`.
2. Select chunks with at least 50% visibility, at least five words, positive attention/content rate, and remaining session/day capacity.
3. Distribute time by attention mass using capped weighted water-filling. A chunk's capacity is its remaining session/day words divided by its local words-per-millisecond rate; when it saturates, its unused time share is redistributed to other eligible chunks.
4. Convert each allocation once: `effectiveWords = allocatedMs × baseWPM × contentMultiplier / 60,000`.
5. Split those words by lifetime coverage into new and review words. Lifetime coverage does not cap review accumulation across days/sessions.

Visible-word supply scales **confidence**, reaching its full contribution at 80 visible words; it does not reduce the time budget or create a renewable per-tick word cap. A segment's session and day totals are each capped at its word count. Allocated time can be less than the available budget when all segments reach their caps.

[`aggregateReading.ts`](../../src/storage/aggregateReading.ts) sums allocated `effectiveReadingMs` directly and derives daily minutes by dividing by 60,000. It does not reconstruct duration from effective words and base WPM, which would distort slower content types. Raw viewport exposure is stored separately. Current aggregation uses metric model version **2**.

### Calibration and adaptive pace

Storage resolves the local language/content-type pace before aggregation; the default is **220 WPM**. The general pace range is **100–350 WPM**. Dashboard calibration uses one of four local 200–260-word passages with three matched questions. Timing counts only visible, focused reading. A 3/3 result blends the observed pace at **0.35** weight; 2/3 uses **0.15**; lower comprehension rejects the sample. Rules live in [`readingPace.ts`](../../src/domain/readingPace.ts).

Adaptive evidence comes from progression episodes in [`repositories.ts`](../../src/storage/repositories.ts), not from the allocator's own `effectiveWords / minutes` output:

- The page needs at least **250 words**. Acceptance needs at least **120 completed words**, **three segments**, and **30 seconds** of active time. Segments need central-band dwell and forward completion with reliable visibility and prose-rate content.
- Scroll events share one gesture anchor until **750 ms** of quiet. Forward movement above **5 ×** active WPM ends an episode; effective-attention decay already begins above **1.6 ×**. Reverse movement is tolerated within **1.5%** of page extent, bounded to **80–240 px** from furthest progress.
- Hidden/unfocused state, excessive idle, or a **ten-minute** active ceiling ends the episode. Readable DOM changes, web resizing, and PDF zoom/rotation reset the absolute scroll-coordinate baseline without discarding valid episode evidence.
- Confidence averages evidence ratios against **240 words**, **six segments**, and **60 seconds**. It scales an EMA step of **0.12** for the first 10 accepted episodes, **0.06** until 50, then **0.03**. Accepted samples in one batch apply in event order; `adaptiveSampleCount` counts accepted episodes directly.

Static viewports do not calibrate pace. The absence of a stored profile represents the default; reset deletes the selected profile and clears unfinished adaptive episodes.

## PDF integration

[`source/load.ts`](../../src/pdf/source/load.ts) bounds acquisition, validates the PDF signature, computes content identity, and returns a releasable in-memory handle. [`PdfReaderWorkspace.tsx`](../../src/pdf/viewer/PdfReaderWorkspace.tsx) passes the buffer to EmbedPDF and releases that handle. Remote acquisition buffers the full file; HTTP Range loading is not implemented. See the README for [PDF use and file-size limits](../../README.md#pdfs).

[`engine/`](../../src/pdf/engine/) packages PDFium WASM and registers the EmbedPDF plugins. [`viewer/`](../../src/pdf/viewer/) owns password retry, virtualized pages, low-resolution base rendering plus visible high-resolution tiles, zoom/rotation, selection, search, outline/thumbnail navigation, native annotations, print, and download. Downloads use `exportPdf.saveAsCopy()` and the source display name; Yuel's local highlights are separate from that export.

[`analytics/`](../../src/pdf/analytics/) sequentially extracts PDFium text runs into stable document/page/chunk identities and source-coordinate rectangles. Rotation-aware layout projection feeds the shared reading session from virtualized page geometry. The reading map combines the in-memory text structure with stored measurements, so unrecorded text and pages without measurable English remain distinguishable. Pace appears only after at least **30 seconds** of effective time and **100 processed words**.

Highlight anchors store source rectangles and remount with virtualized pages. Saved items own editable notes/tags and reference the anchor; older anchors without a color render yellow. [`saveItems.ts`](../../src/storage/saveItems.ts) coordinates editing/deletion with the annotation and vocabulary records. [`documentState.ts`](../../src/pdf/documentState.ts) persists document metadata and view settings for identity-checked reopening, not PDF bytes.

[`companion/localCompanion.ts`](../../src/pdf/companion/localCompanion.ts) detects browser translation/speech capabilities, reuses the translator, reports download progress, and cancels stale tasks. Quote/translation state is transient. [`PdfNativeSelection.tsx`](../../src/pdf/viewer/PdfNativeSelection.tsx) creates a temporary DOM range at the right-clicked text rather than mounting a full text layer.

## Storage and lifecycle

[`schema.ts`](../../src/storage/schema.ts) defines database **`yuel-local`**, schema version **8**. The latest migration adds the `savedItems.pdfAnnotationId` index.

- `pages`, `textChunks`: identities, hashes, counts, coverage, confidence, and reading aggregates; no stored raw chunk text.
- `chunkSessions`, `chunkDays`: per-session/day segment caps and daily exposure totals.
- `readingEvents`: short-lived behavior records; maintenance prunes events older than seven days.
- `readingSessions`: durable effective intervals. Storage merges same-page/session intervals within a five-minute gap; dashboard queries merge nearby records into cross-page focus sessions with page/source counts.
- `vocabExposures`: lemma exposure, intentional-save counts, Pack tags, and learning status.
- `savedItems`, `pdfAnnotations`: intentionally saved text, source metadata, notes/tags, and PDF quotes/geometry.
- `pdfDocumentStates`: document identity, display name, optional remote URL, view settings, and timestamps.
- `dailyStats`: daily effective words/time, first-read/review split, goal, streak, and sources.
- `readingPaceProfiles`, `readingPaceEpisodes`: pace estimates and unfinished progression evidence; batch processing prunes episodes inactive for 24 hours.
- `metadata`: numeric settings and the reading-data-clear cutoff. Recording, toolbar, PDF-handler, and share-card preferences use extension-local storage.

`clearLocalReadingData` transactionally clears the reading tables and preserves settings in `metadata` and extension-local storage. It advances `readingDataClearedAt`; later writes discard queued events at or before that cutoff and trim exposure intervals crossing it. Clearing leaves collection enabled. Retained raw fields and user-facing deletion effects are listed in [Local data and privacy](../../README.md#local-data-and-privacy).

## Vocabulary and Packs

`tokenizeEnglishText` produces the ordered tokens shared by vocabulary counting and `matchPackRules(pack, normalizedTokens)`. Each measured chunk is tokenized once and reused across active Packs. Effective vocabulary exposure increments by the segment's effective-word coverage fraction. Full sentence analysis remains separate for callers that need it.

[`packs.ts`](../../src/domain/packs.ts) validates declarative `manifest`, `lexicon`, and `phrases` data and rejects executable fields such as `scripts`, `code`, `eval`, and `wasmUrl`. The bundled [Tech English Pack](../../src/packs/tech-english.pack.json) supplies local tags. EPUB reading, cross-device sync, and a Pack marketplace/signature system are outside the current implementation.
