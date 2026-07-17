import {
  PdfActionType,
  type PdfLinkTarget,
} from '@embedpdf/models';
import {
  getAnnotationsByPageIndex,
  isLink,
} from '@embedpdf/plugin-annotation';
import { useAnnotation } from '@embedpdf/plugin-annotation/react';
import { useMemo } from 'react';

import { getSafePdfExternalUrl } from '../externalLinks';

type PdfLinkKind = 'destination' | 'goto' | 'uri';

interface PdfLinkDescriptor {
  kind: PdfLinkKind;
  label: string;
}

export function PdfLinkInteractionLayer({
  documentId,
  pageIndex,
  scale,
  sourceUrl,
}: {
  documentId: string;
  pageIndex: number;
  scale: number;
  sourceUrl?: string;
}) {
  const { provides: annotation, state } = useAnnotation(documentId);
  const links = useMemo(() => (
    getAnnotationsByPageIndex(state, pageIndex).flatMap((trackedAnnotation) => {
      if (!isLink(trackedAnnotation) || !trackedAnnotation.object.target) {
        return [];
      }

      const descriptor = describePdfLink(
        trackedAnnotation.object.target,
        sourceUrl,
      );
      return descriptor
        ? [{
          descriptor,
          target: trackedAnnotation.object.target,
          trackedAnnotation,
        }]
        : [];
    })
  ), [pageIndex, sourceUrl, state]);

  if (links.length === 0) return null;

  return (
    <div
      className="pdf-reader__link-interaction-layer"
      data-page-index={pageIndex}
    >
      {links.map(({ descriptor, target, trackedAnnotation }) => {
        const { object } = trackedAnnotation;
        const noZoom = object.flags?.includes('noZoom') ?? false;
        const visualScale = noZoom ? 1 : scale;

        return (
          <button
            key={object.id}
            className="pdf-reader__page-link"
            type="button"
            data-pdf-link-kind={descriptor.kind}
            aria-label={descriptor.label}
            title={descriptor.label}
            style={{
              left: object.rect.origin.x * scale,
              top: object.rect.origin.y * scale,
              width: object.rect.size.width * visualScale,
              height: object.rect.size.height * visualScale,
            }}
            onClick={(event) => {
              event.stopPropagation();
              annotation?.navigateTarget(target);
            }}
          />
        );
      })}
    </div>
  );
}

function describePdfLink(
  target: PdfLinkTarget,
  sourceUrl?: string,
): PdfLinkDescriptor | undefined {
  if (target.type === 'destination') {
    return {
      kind: 'destination',
      label: `前往 PDF 第 ${target.destination.pageIndex + 1} 页`,
    };
  }

  if (target.action.type === PdfActionType.Goto) {
    return {
      kind: 'goto',
      label: `前往 PDF 第 ${target.action.destination.pageIndex + 1} 页`,
    };
  }

  if (target.action.type === PdfActionType.URI) {
    const externalUrl = getSafePdfExternalUrl(target.action.uri, sourceUrl);
    if (!externalUrl) return undefined;

    return {
      kind: 'uri',
      label: `打开 PDF 外部链接：${new URL(externalUrl).hostname}`,
    };
  }

  return undefined;
}
