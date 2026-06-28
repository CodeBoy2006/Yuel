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
