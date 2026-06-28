import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { collectTextBlocks, summarizeCurrentPage } from './extractBlocks';

function visibleRect(): DOMRect {
  return {
    x: 0,
    y: 0,
    width: 640,
    height: 80,
    top: 0,
    right: 640,
    bottom: 80,
    left: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

function longReadableParagraph(sentenceCount = 10): string {
  return Array.from(
    { length: sentenceCount },
    (_, index) =>
      `Section ${index + 1} explains how budgeted reading analytics allocate viewport attention across visible documentation paragraphs without duplicating effective reading speed.`,
  ).join(' ');
}

describe('collectTextBlocks', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(visibleRect());
    document.documentElement.lang = '';
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('collects visible article paragraphs with stable chunk metadata', () => {
    document.body.innerHTML = `
      <article>
        <p id="intro">Mitigate memory overhead and fail gracefully when browser extension APIs change.</p>
      </article>
    `;

    const blocks = collectTextBlocks(document);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      selector: 'p#intro',
      wordCount: 11,
      sentenceCount: 1,
    });
    expect(blocks[0].chunkId).toContain(blocks[0].pageId);
  });

  it('falls back to visible body paragraphs when user-enabled pages lack article wrappers', () => {
    document.body.innerHTML = `
      <header><p>Skip tiny nav copy.</p></header>
      <p id="plain">Backward compatible defaults reduce migration risk while teams roll out analytics carefully.</p>
    `;

    const blocks = collectTextBlocks(document);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      selector: 'p#plain',
      text: 'Backward compatible defaults reduce migration risk while teams roll out analytics carefully.',
    });
  });

  it('falls back to nested plain content while skipping navigation and footer copy', () => {
    document.body.innerHTML = `
      <nav><p id="nav">Documentation home pricing integrations changelog roadmap company careers contact support.</p></nav>
      <div class="content-shell">
        <div>
          <p id="nested">Memory overhead can grow quickly when analytics batches retry across unstable browser extension contexts.</p>
        </div>
      </div>
      <footer><p id="footer">Privacy terms security status cookies trademarks accessibility contact newsletter.</p></footer>
    `;

    const blocks = collectTextBlocks(document);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      selector: 'p#nested',
      text: 'Memory overhead can grow quickly when analytics batches retry across unstable browser extension contexts.',
    });
  });

  it('collects readable headings and code blocks inside primary article content', () => {
    document.body.innerHTML = `
      <article>
        <h2 id="heading">Budgeted exposure model allocates viewport attention across visible text blocks.</h2>
        <pre id="snippet">retry storage writes after extension service worker restarts without duplicating exposure analytics</pre>
      </article>
    `;

    const blocks = collectTextBlocks(document);

    expect(blocks.map((block) => block.selector)).toEqual(['h2#heading', 'pre#snippet']);
  });

  it('splits long article paragraphs into bounded sentence-preserving chunks', () => {
    const text = longReadableParagraph();
    document.body.innerHTML = `
      <article>
        <p id="long">${text}</p>
      </article>
    `;

    const blocks = collectTextBlocks(document);
    const page = summarizeCurrentPage(document, blocks);

    expect(blocks.length).toBeGreaterThan(1);
    expect(blocks.every((block) => block.wordCount <= 120)).toBe(true);
    expect(blocks.every((block) => block.wordCount >= 30)).toBe(true);
    expect(blocks.map((block) => block.text).join(' ')).toBe(text);
    expect(blocks.map((block) => block.selector)).toEqual(blocks.map((_, index) => `p#long::chunk(${index + 1})`));
    expect(page.totalWords).toBe(blocks.reduce((sum, block) => sum + block.wordCount, 0));
  });

  it('keeps short trailing sentences when splitting long article paragraphs', () => {
    const leadSentence = `${Array.from({ length: 120 }, () => 'alpha').join(' ')}.`;
    const trailingSentence = 'Tiny final sentence remains here.';
    const text = `${leadSentence} ${trailingSentence}`;
    document.body.innerHTML = `
      <article>
        <p id="long">${text}</p>
      </article>
    `;

    const blocks = collectTextBlocks(document);

    expect(blocks.length).toBeGreaterThan(1);
    expect(blocks.map((block) => block.text).join(' ')).toBe(text);
    expect(blocks.reduce((sum, block) => sum + block.wordCount, 0)).toBe(125);
    expect(blocks.at(-1)?.text).toBe(trailingSentence);
  });

  it('skips non-reading ancestors even when they match primary content selectors', () => {
    document.body.innerHTML = `
      <main>
        <aside>
          <p id="aside">Related links changelog pricing integrations support contact company careers roadmap newsletter.</p>
        </aside>
        <div aria-hidden="true">
          <p id="hidden">Decorative repeated marketing copy should stay outside local reading analytics.</p>
        </div>
        <article>
          <p id="content">Reading analytics should focus on visible article body text instead of page chrome.</p>
        </article>
      </main>
    `;

    const blocks = collectTextBlocks(document);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      selector: 'p#content',
      text: 'Reading analytics should focus on visible article body text instead of page chrome.',
    });
  });

  it('skips role-based and attribute-hidden page chrome in primary content selectors', () => {
    document.body.innerHTML = `
      <main>
        <div role="navigation">
          <p id="role-nav">Documentation home pricing integrations changelog roadmap company careers contact support.</p>
        </div>
        <div hidden>
          <p id="hidden-attr">Hidden onboarding copy should not become local reading analytics text.</p>
        </div>
        <div inert>
          <p id="inert">Inactive drawer copy should stay out of visible reading event capture.</p>
        </div>
        <article>
          <p id="article">Visible documentation content should remain the only captured reading block here.</p>
        </article>
      </main>
    `;

    const blocks = collectTextBlocks(document);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      selector: 'p#article',
      text: 'Visible documentation content should remain the only captured reading block here.',
    });
  });

  it('skips editable page regions in primary content selectors', () => {
    document.body.innerHTML = `
      <main>
        <div contenteditable="true">
          <p id="draft">Private draft notes about architecture performance incidents should not become reading analytics.</p>
        </div>
        <article>
          <p id="article">Published documentation content should remain eligible for local reading analytics.</p>
        </article>
      </main>
    `;

    const blocks = collectTextBlocks(document);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      selector: 'p#article',
      text: 'Published documentation content should remain eligible for local reading analytics.',
    });
  });

  it('skips locally declared non-English text inside English pages', () => {
    document.documentElement.lang = 'en-US';
    document.body.innerHTML = `
      <main>
        <section lang="fr">
          <p id="localized">Architecture notes and performance details should not be captured when this section declares another language.</p>
        </section>
        <article>
          <p id="article">English documentation content should remain eligible for local reading analytics.</p>
        </article>
      </main>
    `;

    const blocks = collectTextBlocks(document);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      selector: 'p#article',
      text: 'English documentation content should remain eligible for local reading analytics.',
    });
  });

  it('reports declared non-English page language in page snapshots', () => {
    document.documentElement.lang = 'fr-FR';

    const page = summarizeCurrentPage(document, []);

    expect(page.language).toBe('fr');
  });
});
