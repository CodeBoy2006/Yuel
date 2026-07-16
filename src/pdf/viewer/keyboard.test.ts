import { describe, expect, it } from 'vitest';

import { shouldIgnorePdfReaderShortcut } from './keyboard';

describe('PDF reader keyboard shortcuts', () => {
  it('ignores editable controls', () => {
    const input = document.createElement('input');
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');

    expect(shouldIgnorePdfReaderShortcut(input)).toBe(true);
    expect(shouldIgnorePdfReaderShortcut(editable)).toBe(true);
  });

  it('ignores controls inside a shortcut-disabled surface', () => {
    const dialog = document.createElement('section');
    dialog.dataset.pdfReaderShortcutsDisabled = '';
    const button = document.createElement('button');
    dialog.append(button);

    expect(shouldIgnorePdfReaderShortcut(button)).toBe(true);
  });

  it('allows shortcuts from ordinary reader controls', () => {
    const button = document.createElement('button');

    expect(shouldIgnorePdfReaderShortcut(button)).toBe(false);
    expect(shouldIgnorePdfReaderShortcut(document.body)).toBe(false);
    expect(shouldIgnorePdfReaderShortcut(null)).toBe(false);
  });
});
