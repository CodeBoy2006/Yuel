# Yuel Reading

Yuel is a local-first Chrome extension for reading English articles, documentation, and PDFs. Track reading progress, save vocabulary and excerpts, and review your reading habits.

## Build and load

Use Node.js 22.x (22.13 or newer), the pnpm version pinned in [package.json](package.json), and Chrome 116 or newer.

```bash
pnpm install
pnpm build
```

Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `.output/chrome-mv3/`.

For development, run `pnpm dev` and load `.output/chrome-mv3-dev/` manually.

## Read, save, and review

- **Read:** recording starts automatically on supported English web pages. Open the side panel for page coverage and today's totals. Pause a site from the popup or all recording from the dashboard's reading profile.
- **Save:** select web text and choose **保存到阅量摘录** from the context menu. In PDFs, save highlights with notes and tags.
- **Review:** use the dashboard for reading history, vocabulary, and searchable excerpts. Set a daily goal, calibrate your reading pace, and share a summary card after reaching the goal.

Reading estimates use visible text, engagement, and reading pace. See the [reading model](docs/architecture/reading-architecture.md#reading-model) for details.

### PDFs

Open the reader from the popup to load a local file (up to **256 MiB**) or remote URL (up to **96 MiB**). Search, navigate, highlight, and use **划词伴读** for browser-supported English-to-Chinese translation and read-aloud. The popup's **网络 PDF** switch chooses Yuel or Chrome for online PDFs.

Position and view settings are restored on reopening; local files require reselecting the original file. Highlights stay in Yuel's local library, separate from the downloaded PDF.

## Local data and privacy

Reading records stay in this browser. Automatic analytics store domains, hashes, vocabulary, and aggregates. Saved excerpts retain their text and exact source URLs; recent PDFs retain metadata and remote URLs, including query parameters. Remote PDF loading and browser translation or speech services may use the network.

The dashboard's **清空本地数据** removes reading history, vocabulary, excerpts, highlights, PDF state, and pace calibration while preserving settings. Pause recording first if you also want to stop collection.

## Project documentation

- [Development and verification](docs/development.md)
- [Architecture](docs/architecture/reading-architecture.md)
- [Product brief](PRODUCT.md)
- [Interface system](DESIGN.md)

## License and contributions

Yuel is source-available under [PolyForm Strict 1.0.0 with an upstream contribution permission](LICENSE). See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution workflow and contributor agreement.
