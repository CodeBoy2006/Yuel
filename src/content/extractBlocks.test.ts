import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { collectTextBlocks } from './extractBlocks';

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
});
