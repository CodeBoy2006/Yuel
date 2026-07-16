const PDF_READER_SHORTCUT_BLOCKING_SELECTOR = [
  'input',
  'textarea',
  'select',
  '[contenteditable="true"]',
  '[data-pdf-reader-shortcuts-disabled]',
].join(', ');

export function shouldIgnorePdfReaderShortcut(
  target: EventTarget | null,
): boolean {
  return target instanceof Element
    && Boolean(target.closest(PDF_READER_SHORTCUT_BLOCKING_SELECTOR));
}
