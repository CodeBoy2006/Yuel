import { describe, expect, it } from 'vitest';

import { getSafePdfExternalUrl } from './externalLinks';

describe('PDF external links', () => {
  it.each([
    ['https://docs.example.com/guide?q=pdf#links', 'https://docs.example.com/guide?q=pdf#links'],
    [' http://example.com/reference ', 'http://example.com/reference'],
  ])('accepts absolute HTTP links: %s', (uri, expected) => {
    expect(getSafePdfExternalUrl(uri)).toBe(expected);
  });

  it.each([
    [
      '../guide?q=pdf#links',
      'https://docs.example.com/books/reference.pdf',
      'https://docs.example.com/guide?q=pdf#links',
    ],
    [
      '//cdn.example.com/reference',
      'https://docs.example.com/books/reference.pdf',
      'https://cdn.example.com/reference',
    ],
  ])('resolves safe relative links: %s', (uri, documentUrl, expected) => {
    expect(getSafePdfExternalUrl(uri, documentUrl)).toBe(expected);
  });

  it.each([
    '',
    '/relative/path',
    'javascript:alert(document.domain)',
    'data:text/html,<h1>unsafe</h1>',
    'file:///tmp/private.pdf',
    'mailto:reader@example.com',
    'not a URL',
  ])('rejects unsupported or malformed links: %s', (uri) => {
    expect(getSafePdfExternalUrl(uri)).toBeUndefined();
  });

  it('rejects relative links when the document base is not HTTP', () => {
    expect(
      getSafePdfExternalUrl('../guide', 'file:///tmp/reference.pdf'),
    ).toBeUndefined();
  });
});
