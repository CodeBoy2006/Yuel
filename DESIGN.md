# Yuel Interface System

## Product scene

A bilingual reader is working through long documentation at a desk and glances at Yuel between paragraphs. The interface should feel like a quiet measurement instrument: fast to scan, truthful about state, and never competitive or performative.

## Design principles

1. **Control, accompany, reflect.** Popup controls the current site, the side panel accompanies the active page, and the dashboard supports reflection. Do not repeat the same hierarchy on every surface.
2. **Evidence over decoration.** Accent color communicates action or state. It is not used as ambient decoration.
3. **One surface, few containers.** Group with spacing and dividers before introducing another card.
4. **Compact, truthful copy.** Labels describe the action that actually happens. Explanatory text is kept to one short sentence at the point of need.
5. **Quiet numbers.** Metrics use tabular numerals but never become a scoreboard-style hero.
6. **Local by default.** Privacy is expressed as a persistent state, not repeated marketing copy.

## Visual language

- **Register:** restrained product UI.
- **Background:** near-neutral with a slight green tint, never cream or parchment.
- **Ink:** deep green-black rather than blue-black.
- **Primary:** forest green, reserved for the current selection and primary action.
- **Brand progress:** the shared Logo is a quiet daily-goal gauge: green rises through a visible gray mark, then a champagne-gold edge and bounded glow signal completion.
- **Signal:** rust orange, reserved for warnings or attention.
- **Geometry:** 10–14px radii for controls and containers; pills only for compact statuses.
- **Elevation:** borders and tonal surfaces do the work. Shadows are limited to the extension popup shell and never paired with a wide blur.
- **Typography:** system sans throughout, with tabular numerals for measured values. Fixed product-scale sizes; no oversized display type.
- **Motion:** 160–220ms state transitions with an exponential ease-out. Reduced-motion users receive instant state changes.

## Tokens

The source of truth lives in `src/ui/foundation.css` and uses OKLCH.

| Role | Token |
|---|---|
| App background | `--y-bg` |
| Primary surface | `--y-surface` |
| Secondary surface | `--y-surface-subtle` |
| Primary ink | `--y-ink` |
| Secondary ink | `--y-ink-secondary` |
| Muted ink | `--y-ink-muted` |
| Divider | `--y-line` |
| Control boundary | `--y-control-line` |
| Primary action | `--y-accent` |
| Inactive Logo progress | `--y-brand-inactive` |
| Completed Logo edge | `--y-celebration` |
| Completed Logo glow | `--y-celebration-soft` |
| Warning signal | `--y-signal` |
| Warning text | `--y-signal-ink` |
| Informational state | `--y-info` |
| Destructive action | `--y-danger` |

## Shared components

- `BrandLockup`: one consistent mark and name; it exposes today's effective-word goal as a semantic progressbar, fills green from bottom to top, and uses a one-shot gold completion bloom with a static reduced-motion-safe finish.
- `ActionButton`: primary, secondary, quiet, and danger variants with complete focus/disabled states.
- `StatusPill`: neutral, positive, warning, and danger states.
- `Metric`: compact label/value pair.
- `SectionHeader`: title plus optional compact metadata.
- `ProgressBar`: semantic progressbar with an accessible value.
- `SwitchControl`: shared binary setting with visible state text, keyboard focus, and busy/disabled treatment.
- `InlineNotice`: concise live status and recovery feedback.
- `EmptyState`: one-line empty state with an optional next action.

## Surface architecture

### Chrome toolbar

The pinned browser action is the smallest daily-progress surface. It uses 16 rasterized progress steps so each change maps to roughly one visible DIP: a green interior rises through a gray Logo, while a fine gray outline preserves the silhouette on light and dark Chrome themes. Incomplete states never render as fully filled. Completion replaces that outline with a champagne-gold edge and a broader layered glow whose opacity increases toward the mark, then adds a compact circular `✓` medallion inside the lower-right corner of the icon. The medallion stays secondary to the Logo instead of using Chrome's oversized native badge, while the accessible toolbar title exposes exact words. The state remains static rather than simulating continuous animation. A reading-profile switch can disable progress feedback, returning the action to the static green Logo, default title, and empty native badge while preserving the preference locally.

### Popup

Current site status first, including an exact-site recording switch, a compact daily snapshot second, then the two destinations. A global Yuel pause keeps the saved site preference visible but temporarily disables the site control; Chrome restrictions remain a distinct warning state.

### Side panel

Current-page progress is the visual anchor. Daily totals, vocabulary, and the latest excerpt are secondary. Data refreshes while the panel remains open.

### PDF reader

The PDF workspace keeps navigation, reading evidence, search, and document output in one compact instrument. Its reading map combines the complete in-memory text structure with local chunk measurements as one continuous document river. Chapter bands are the default scale when an outline exists, while the page scale provides a closer view without changing the underlying evidence. Segment length reflects text volume, the continuous fill shows coverage, quiet ticks show effective time, and a relative marker appears only when pace is sufficiently sampled. A compact focus lens exposes exact values for the current or inspected segment, while a full-document minimap keeps the current position visible in long PDFs. Unrecorded text remains solid but unfilled, and pages without measurable English text use a hollow treatment so neither state appears as measured zero.

Persistent highlights are a local layer above the rendered PDF, separate from read-only native annotations and from the document bytes. The selection menu uses compact yellow, green, blue, and rose swatches before the highlight command. Stored source rectangles remount with virtualized pages and remain directly clickable. Their editor is a restrained right-side inspector on desktop and a bottom panel on narrow screens, with the quote and page identity fixed above color, note, and tag fields; focus stays inside while open, and deletion requires an explicit second action. Legacy PDF excerpts adopt the yellow treatment without migration.

The selection menu also offers "划词伴读" before persistent actions. It opens a compact nonmodal panel near the selected text, clamped to both the viewport and the rendered page so it remains anchored without covering the reader chrome. The panel keeps the English quote, read-aloud control, translation status, and Chinese result in one continuous surface separated by dividers rather than nested cards. Translation and speech degrade independently, download and error states stay explicit, and keyboard users can close with `Escape` and return focus to the originating action. A quiet "选区不保存" line communicates that the quote and translation are transient without turning privacy into promotional copy.

### Dashboard

The page is organized as a reading ledger: today summary, goal-based check-in progress, a 13-week reading-rhythm view, effective-duration analysis, recent reading, vocabulary, a full-width excerpt library, and reading profile. The rhythm view combines a history-relative, four-level activity heatmap with effective-word trends, weekday averages, and first-read/review composition without turning the page into a scoreboard. The duration view uses the same restrained hierarchy for range summaries, daily bars, source totals, and recent focus sessions; it explicitly describes effective time as an attention estimate and groups reading separated by no more than five minutes.

The excerpt library is an operational reading surface rather than a gallery. Search, source segments, tag filtering, and time sorting form one compact toolbar. Results use a continuous divider list so the source, quote, note, tags, and actions remain easy to scan without nested cards. Copy and source reopening stay immediately available; note/tag editing and destructive confirmation expand inline to preserve context. Long excerpts disclose progressively, web saves reopen their exact HTTP(S) source, and PDF saves retain page-level backlinks. Loading, empty, filtered-empty, failure, busy, success, and deletion states remain explicit at the point of action.

The reading profile owns the global automatic-recording switch, editable daily effective-word goal, toolbar progress preference, and reading-speed calibration/reset, while the today ledger reports the remaining words and completed state. The share card is a disclosure available only after the daily goal is reached; it keeps the streak quiet, presents up to three domains as a compact source list, and locally remembers the user's theme, source-count, favicon, and streak-display choices. Calibration becomes a focused full-width flow, and local data management sits in a quiet footer.

## Accessibility baseline

- Chinese UI documents declare `lang="zh-CN"`; English calibration content declares `lang="en"`.
- Body text reaches WCAG AA contrast.
- Every async status is announced through a live region.
- Progress indicators expose `role="progressbar"` and numeric values.
- Focus indicators are explicit and consistent.
- Touch targets are at least 40px in dense desktop UI and 44px for primary actions.
- Long domains, excerpts, and tags wrap or truncate without creating horizontal scroll.
- Motion respects `prefers-reduced-motion`.
