# Yuel Interface System

This guide turns the [product priorities](PRODUCT.md) into interface rules. Use the existing tokens and components for changes; user-facing capabilities and limits belong in the [README](README.md).

## Visual language

- **Hierarchy:** compact, product-scale system sans typography and tabular numerals. Metrics support a reading ledger rather than a scoreboard.
- **Surfaces:** near-neutral, slightly green backgrounds and deep green-black ink. Group with spacing and dividers before adding cards; avoid cream, parchment, or decorative green washes.
- **Color:** forest green marks actions and selection; rust orange signals attention. Daily-goal completion uses a bounded champagne-gold accent.
- **Geometry:** shared radii span 8–14px; standard buttons use 10px. Reserve pills for compact status labels. Prefer borders and tonal surfaces to broad shadows.
- **Motion:** ordinary state transitions take 160–220ms with an ease-out curve; the daily-goal logo may use a one-shot completion bloom, never continuous celebration. Reduced motion keeps state changes immediate and completion static.
- **Copy:** describe the action or state directly. Put a short explanation beside the control or failure it resolves, not in repeated privacy or feature claims.

### Tokens and shared components

[`src/ui/foundation.css`](src/ui/foundation.css) owns the OKLCH colors, geometry, focus, motion, and shared styles. Reuse its semantic roles rather than copying values into entrypoint styles:

| Role | Core tokens |
|---|---|
| Background and surfaces | `--y-bg`, `--y-surface`, `--y-surface-subtle`, `--y-surface-strong` |
| Text | `--y-ink`, `--y-ink-secondary`, `--y-ink-muted` |
| Boundaries and focus | `--y-line`, `--y-line-strong`, `--y-control-line`, `--y-focus` |
| Action | `--y-accent`, `--y-accent-hover`, `--y-accent-soft`, `--y-on-accent` |
| Daily progress | `--y-brand-inactive`, `--y-celebration`, `--y-celebration-soft` |
| Attention and feedback | `--y-signal`, `--y-signal-ink`, `--y-info`, `--y-danger` and their soft/hover variants |
| Geometry and motion | `--y-radius-sm`, `--y-radius-md`, `--y-radius-lg`, `--y-duration`, `--y-ease`, `--y-shadow-popup` |

[`src/ui/primitives.tsx`](src/ui/primitives.tsx) provides:

- `BrandLockup`: the mark/name plus semantic daily-goal progress; green fills the gray mark from below, with a one-shot gold completion treatment.
- `ActionButton`: primary, secondary, quiet, and danger variants with focus/disabled states.
- `StatusPill` and `InlineNotice`: neutral, positive, warning, and danger feedback; urgent notices use alerts, other notices use polite live status.
- `Metric`, `SectionHeader`, and `ProgressBar`: compact measures, section titles with optional metadata, and named numeric progress.
- `SwitchControl`: a binary setting with visible state, keyboard focus, and busy/disabled treatment.
- `EmptyState`: a content container; callers supply its children, including an action when useful.

## Surface hierarchy and interaction

### Chrome toolbar

The pinned action is the smallest daily-progress surface. Its rasterized icon uses 16 steps; incomplete states must not look complete. Gray preserves the silhouette, green shows progress, and completion adds a gold outline/glow plus a secondary `✓` medallion at the lower right rather than a native badge. The tooltip exposes exact words and goal. This icon is static; disabling progress restores the green logo and default title without changing collection. Rendering lives in [`readingToolbar.ts`](src/background/readingToolbar.ts).

### Popup

Put current-site status and its recording switch first, today's compact summary second, then the network-PDF handler preference and destinations: side panel, dashboard, and PDF reader. A global pause keeps the saved site preference visible but disables the site control. Browser restrictions and absence of eligible English remain distinct states.

### Side panel

Current web-page or PDF coverage is the anchor. Daily totals, vocabulary, and the latest excerpt are secondary; card/dashboard actions remain easy to reach. Refresh data while open without shifting the hierarchy.

### PDF reader

Keep document controls compact and use one navigation context at a time: reading map, chapter outline, thumbnails, or search. The reading map presents a continuous chapter/page river with text-volume segment lengths, coverage fill, effective-time ticks, and pace only when sufficiently sampled. Default to chapter scale when an outline exists; page scale gives a closer view of the same evidence. A focus lens gives exact inspected values; the minimap preserves orientation in long documents. Unrecorded text is solid and unfilled; pages without measurable English use a hollow treatment.

Local highlights sit above rendered pages, separate from read-only native annotations. Offer yellow, green, blue, and rose swatches in the selection menu. Clicking a highlight opens a right-side inspector on desktop or a bottom panel on narrow screens. Keep quote/page identity visible above color, note, and tags; contain keyboard focus and require a second action for deletion.

Place **划词伴读** before persistent selection actions. Its nonmodal panel stays near the selection and within the page/viewport, clear of reader chrome. Arrange the English quote, speech control, translation status, and Chinese result with dividers rather than nested cards. Keep translation and speech failures independent. `Escape` closes the panel and returns focus to the originating action; the quiet **选区不保存** label explains its transient state.

### Dashboard

Use the current order: today ledger and optional goal-completed share card; reading-rhythm and duration insights; reading profile/calibration; recent reading and vocabulary; full-width excerpt library; local-data footer.

The rhythm view combines a 13-week, history-relative four-level heatmap with word trends, weekday averages, and first-read/review composition. Duration summaries, daily bars, sources, and focus sessions use the same restrained hierarchy. Explain effective time as an attention estimate and the five-minute session grouping near those measures.

The reading profile owns recording, daily goal, toolbar progress, and pace calibration/reset. Calibration expands into a focused full-width flow. Share cards appear only after goal completion and keep theme, source-count, favicon, and streak choices beside the preview rather than adding a permanent dashboard hero.

The excerpt library is a working list, not a gallery. Keep search, source/tag filters, and time sorting in one toolbar. Use divider rows with scannable source, quote, note, tags, and actions. Keep copy/reopen available; expand editing and deletion confirmation inline. Disclose long quotes progressively and distinguish loading, empty, filtered-empty, failure, busy, and success states at the affected action. Preserve web-source and PDF-page backlinks.

## Accessibility requirements

Apply these requirements when changing a surface; verify the rendered result rather than treating token reuse as proof:

- Declare `lang="zh-CN"` for Chinese UI documents and `lang="en"` for English calibration content.
- Meet WCAG AA contrast for text and meaningful states; never encode progress or completion by color alone.
- Expose named progressbars with numeric values, clear control names, and visible keyboard focus.
- Announce asynchronous results through appropriate live status or alerts.
- Preserve keyboard operation, modal focus containment, nonmodal dismissal, and focus return.
- Use targets of at least 40px in dense desktop UI and 44px for primary actions.
- Wrap or truncate long domains, quotes, and tags without horizontal scrolling or hiding required actions.
- Respect `prefers-reduced-motion` and keep progress legible in forced-color modes.
