# Yuel Reading

Yuel is a local-first Chrome MV3 extension for people reading English articles, documentation, and PDFs. It estimates reading progress from visible text and engagement, keeps a local vocabulary and excerpt library, and provides a PDF workspace with highlights, search, and selection assistance.

## Build and load

Use Node.js 22.13 or newer in the 22.x line and the pnpm version pinned in [package.json](package.json).

```bash
pnpm install
pnpm build
```

Open `chrome://extensions`, enable developer mode, choose **Load unpacked**, and select `.output/chrome-mv3/`. For development, `pnpm dev` watches into `.output/chrome-mv3-dev/`; load that directory manually. WXT does not launch Chrome automatically.

The manifest declares Chrome 116 as its minimum version. PDF interception and selection translation are capability-detected; their availability also depends on the browser.

## Read, save, and review

- **Popup:** inspect the current site's recording state, pause that site, choose the network PDF handler, or open the side panel, dashboard, or PDF reader.
- **Side panel:** follow the current web page or PDF's measured coverage, today's totals, vocabulary, and the latest saved excerpt. Data refreshes while the panel is open.
- **Dashboard:** review the 13-week reading rhythm, effective duration, focus sessions, recent measured pages, and vocabulary. Search excerpts by text, source, notes, or tags; filter by source/tag, sort by save time, copy, reopen, edit, or delete them.
- **PDF reader:** open a local file or remote URL; navigate by page, outline, thumbnail, search, or reading map. Use zoom, rotation, pan, text selection, copy, print, and download. The reader restores position and view settings when the same document is reopened.

On a web page, select text and choose **保存到阅量摘录** from Chrome's context menu. In a PDF, save a yellow, green, blue, or rose highlight from the selection menu. Click a highlight to edit its color, note, and tags or confirm deletion. Highlights are local records; they are not embedded into the PDF download. Saving a word or short phrase also updates its vocabulary saved count; saving a long excerpt does not mark every word as saved vocabulary.

### Recording and daily goals

Recording starts by default on HTTP(S) pages where Chrome permits access and Yuel finds eligible English text. It handles later text injection and SPA route changes, including English passages on localized pages. If a page is not recording, check the popup's state: browser restriction, global pause, site pause, and no detected English are separate conditions.

The dashboard's reading profile controls global recording; the popup controls the current site. Site preferences use normalized hostnames: `www.example.com` and `example.com` share a setting, while other subdomains remain separate. Pausing does not delete data or revoke Chrome permissions.

The daily goal defaults to **500 effective words** and accepts whole numbers from **1 to 100,000**. Changing it recalculates historical streaks against the new goal. Once today's goal is reached, the share card supports theme selection, one to three source domains, optional favicons and streak, and copy/download. Card preferences remain local.

The shared logo and Chrome toolbar icon show daily progress. The toolbar uses 16 steps and an exact-count tooltip; completion adds a gold edge and check mark. Disable toolbar progress in the reading profile to return to a static logo without changing recording.

### What the measurements mean

Effective words and duration are estimates of reading attention, not exact eye-tracking or comprehension measurements. Visible text shares one engagement-gated time budget; session/day caps prevent repeated exposure from increasing a segment indefinitely. Lifetime coverage separates first reading from review. Pages with no effective words are not counted as read pages or shown in recent reading.

Reading pace defaults to **220 WPM**. Dashboard calibration uses a randomly chosen 200–260-word passage and three comprehension questions; timing pauses when the page is hidden or unfocused and ends before the questions. Qualified forward-reading episodes can adapt the pace later. Reset removes the profile and unfinished adaptive episodes. See the [reading model](docs/architecture/reading-architecture.md#reading-model) for the allocation and adaptation rules.

## PDF behavior and limits

Local files are limited to **256 MiB**; remote documents to **96 MiB**. Remote files download completely before opening, with both declared and received size checks. Recent remote documents reopen from their stored URL; local documents require reselecting the original file. Both paths verify document identity before restoring saved state or excerpt targets. The recent list shows five documents; PDF bytes are not retained in the database.

### Opening network PDFs

The popup's **网络 PDF** switch defaults to **Yuel**:

- If Chrome exposes `chrome.mimeHandler`, Yuel uses its one-use PDF stream. Stream acquisition or metadata failures request Chrome's native fallback.
- Otherwise, when response-header rules are supported, Declarative Net Request (DNR) rules redirect top-level HTTP(S) `GET` responses with `application/pdf`, or `.pdf` URLs served as `application/octet-stream`.
- The DNR path leaves attachments as downloads and does not intercept embedded PDFs, `POST`, `file:`, `blob:`, or `data:` documents. It must fetch the URL again, including applicable Chrome cookies; single-use URLs can therefore fail. The native stream path avoids the second origin request.

Manual remote loads and recent-document/backlink reopening use the same cookie-including fetch path. Turning the preference off returns subsequent PDF navigations to Chrome without closing existing reader tabs or deleting records. If automatic handling is unsupported, open the reader from the popup.

### Selection assistance

**划词伴读** opens English-to-Chinese translation through the browser's built-in `Translator` API and English read-aloud through speech synthesis. Translation may require a model download; translation and speech report availability and failures independently. The panel accepts English selections up to 1,200 UTF-16 code units, closes with `Escape`, and keeps its quote and translation only for the current reader session. Copy and highlighting remain available if assistance is unavailable.

Right-clicking selected PDF text also exposes a temporary DOM selection to Chrome's native menu, including after select-all. Native menu commands depend on Chrome and the operating system; scrolling, resizing, or changing the selection clears the temporary range.

## Local data and privacy

Yuel requires HTTP(S) host access for automatic collection. Chrome controls site access independently of Yuel's recording switches.

- **Automatic web analytics:** store domains, hashed page titles/URLs, chunk hashes, vocabulary lemmas, and reading aggregates. Raw chunk text passes through local extension messages for analysis but is not stored in the chunk table. Ordinary selection telemetry contains a hash and character count.
- **Intentional saves:** store the quote, exact web source URL/title, note, and tags. PDF highlights also store a document identity and source rectangles. Deleting a highlight removes its anchor; deleting a vocabulary-tracked save reverses its saved-count contribution.
- **PDF recent state:** stores the display name, identity, view settings, and remote source URL even without saving an excerpt. That URL can include query parameters. PDF bytes stay in the reader/worker lifecycle; packaged PDFium workers and WASM do not require a remote renderer or font fallback.
- **Browser services:** recent-page icons use Chrome's favicon service rather than direct site-icon fetches. Read-aloud prefers a local English voice, then another browser-provided voice; offline speech depends on the available voice. Translation model downloads and remote PDF loading can require network access.

The dashboard's confirmed **清空本地数据** action removes analytics, vocabulary, excerpts/highlights, PDF recent/view state, and pace calibration. It preserves recording/site preferences, daily goal, toolbar, PDF-handler, and share-card settings. Clearing does not pause collection; pause automatic recording first to stop new measurements. Event-retention and delayed-write handling are described in the [storage lifecycle](docs/architecture/reading-architecture.md#storage-and-lifecycle).

## Project documentation

- [Development and verification](docs/development.md): toolchain, test selection, browser requirements, and coverage limits.
- [Current architecture](docs/architecture/reading-architecture.md): runtime ownership, messaging, measurement, PDF integration, and storage.
- [Product brief](PRODUCT.md): audience, purpose, and product priorities.
- [Interface system](DESIGN.md): visual rules, shared components, surface hierarchy, and accessibility requirements.
