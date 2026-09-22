import { useDocumentState } from '@embedpdf/core/react';
import { useSelectionCapability } from '@embedpdf/plugin-selection/react';
import { useEffect, useRef } from 'react';

import { toPdfPageCoordinates } from '../documentState';
import { usePdfSelectAllControls } from './PdfSelectAll';

export function PdfNativeSelection({ documentId }: { documentId: string }) {
  const proxyRef = useRef<HTMLSpanElement>(null);
  const documentState = useDocumentState(documentId);
  const { provides: selection } = useSelectionCapability();
  const { active: selectAll, getText: getDocumentText } = usePdfSelectAllControls();

  useEffect(() => {
    const proxy = proxyRef.current;
    const surface = proxy?.parentElement;
    const scope = selection?.forDocument(documentId);
    if (!proxy || !surface || !scope || !documentState?.document) return;

    let text = '';
    let revision = 0;
    let frame = 0;
    const clearProxy = () => {
      cancelAnimationFrame(frame);
      const nativeSelection = window.getSelection();
      if (proxy.contains(nativeSelection?.anchorNode ?? null)) {
        nativeSelection?.removeAllRanges();
      }
      proxy.textContent = '';
      proxy.style.pointerEvents = 'none';
    };
    const invalidate = () => {
      revision += 1;
      text = '';
      clearProxy();
    };
    const readText = () => {
      invalidate();
      if (!selectAll && !scope.getState().selection) return;
      const current = revision;
      const task = selectAll
        ? getDocumentText()
        : scope.getSelectedText().toPromise().then((lines) => lines.join('\n'));
      void task.then((value) => {
        if (revision === current) text = value;
      }).catch(() => undefined);
    };
    const stopChange = scope.onSelectionChange(invalidate);
    const stopEnd = scope.onEndSelection(readText);
    readText();

    const handleContextMenu = (event: MouseEvent) => {
      clearProxy();
      const target = event.target;
      if (!(target instanceof Element) || !text.trim()) return;
      if (target.closest('.pdf-reader__selection-menu, [role="dialog"], input, textarea, select, [contenteditable]')) return;
      const pageElement = target.closest<HTMLElement>('.pdf-reader__page-shell');
      const pageIndex = Number(pageElement?.dataset.pageNumber) - 1;
      const page = documentState.document?.pages[pageIndex];
      if (!pageElement || !page) return;

      let overSelection: boolean;
      if (selectAll) {
        overSelection = Array.from(pageElement.querySelectorAll('.pdf-reader__select-all-mark'))
          .some((mark) => containsPoint(mark.getBoundingClientRect(), event));
      } else {
        const bounds = pageElement.getBoundingClientRect();
        const point = toPdfPageCoordinates({
          x: (event.clientX - bounds.left) / documentState.scale,
          y: (event.clientY - bounds.top) / documentState.scale,
        }, page.size, ((page.rotation ?? 0) + documentState.rotation) % 4);
        overSelection = scope.getHighlightRectsForPage(pageIndex).some((rect) =>
          point.x >= rect.origin.x && point.x <= rect.origin.x + rect.size.width
          && point.y >= rect.origin.y && point.y <= rect.origin.y + rect.size.height);
      }
      if (!overSelection) return;

      // ponytail: one temporary target bridges native menu actions; native caret
      // navigation would need a real text layer. Chromium requires the hit point
      // to fall inside the DOM selection.
      proxy.textContent = text;
      proxy.style.left = `${event.clientX - 4}px`;
      proxy.style.top = `${event.clientY - 8}px`;
      proxy.style.pointerEvents = 'auto';
      const range = document.createRange();
      range.selectNodeContents(proxy);
      const nativeSelection = window.getSelection();
      nativeSelection?.removeAllRanges();
      nativeSelection?.addRange(range);

      // Keep the range for native Copy, but stop intercepting input once Chrome
      // has synchronously built its menu from this event's default action.
      frame = requestAnimationFrame(() => { proxy.style.pointerEvents = 'none'; });
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') clearProxy();
    };
    const handleCopy = (event: ClipboardEvent) => {
      if (!event.clipboardData || !proxy.contains(window.getSelection()?.anchorNode ?? null)) return;
      // Do not put the invisible proxy's HTML/CSS on the clipboard.
      event.clipboardData.setData('text/plain', proxy.textContent ?? '');
      event.preventDefault();
    };
    surface.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('pointerdown', clearProxy, true);
    document.addEventListener('scroll', clearProxy, true);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('copy', handleCopy);
    window.addEventListener('resize', clearProxy);
    return () => {
      invalidate();
      stopChange();
      stopEnd();
      surface.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('pointerdown', clearProxy, true);
      document.removeEventListener('scroll', clearProxy, true);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('copy', handleCopy);
      window.removeEventListener('resize', clearProxy);
    };
  }, [documentId, documentState, getDocumentText, selectAll, selection]);

  return (
    <span
      ref={proxyRef}
      data-pdf-native-selection
      aria-hidden="true"
      style={{
        position: 'fixed',
        opacity: 0,
        pointerEvents: 'none',
        userSelect: 'text',
        whiteSpace: 'pre',
        font: '16px/16px monospace',
        zIndex: 1000,
      }}
    />
  );
}

function containsPoint(rect: DOMRect, point: MouseEvent): boolean {
  return point.clientX >= rect.left && point.clientX <= rect.right
    && point.clientY >= rect.top && point.clientY <= rect.bottom;
}
