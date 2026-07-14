import { analyzeEnglishText, isTrackableEnglishToken } from '../analysis/english';
import { getDomain, hashText } from '../domain/events';
import { getPdfReadingDomain } from '../pdf/analytics/identity';
import type { PdfSourceMetadata } from '../pdf/source';
import {
  db,
  type PdfAnnotationRecord,
  type PdfSourceRectRecord,
  type SavedItemRecord,
  type VocabExposureRecord,
} from './schema';

let savedItemSequence = 0;

export interface SaveSelectedTextOptions {
  sourceUrl?: string;
  createdAt?: number;
}

export interface SavePdfSelectedTextOptions {
  metadata: PdfSourceMetadata;
  sourceRects: PdfSourceRectRecord[];
  createdAt?: number;
}

export async function saveSelectedTextItem(
  selectedText: string,
  options: SaveSelectedTextOptions = {},
): Promise<SavedItemRecord | undefined> {
  const text = selectedText.trim();
  if (!text) {
    return undefined;
  }

  const createdAt = options.createdAt ?? Date.now();
  const record: SavedItemRecord = {
    id: createSavedItemId(text, createdAt),
    text,
    type: classifySavedText(text),
    sourceDomain: getDomain(options.sourceUrl ?? ''),
    tags: ['selection'],
    createdAt,
  };

  await db.transaction('rw', [db.savedItems, db.vocabExposures], async () => {
    await db.savedItems.put(record);
    await recordSavedVocabulary(text, createdAt);
  });

  return record;
}

export async function savePdfSelectedTextItem(
  selectedText: string,
  options: SavePdfSelectedTextOptions,
): Promise<SavedItemRecord | undefined> {
  const text = selectedText.trim();
  if (!text) {
    return undefined;
  }

  const sourceRects = normalizePdfSourceRects(options.sourceRects);
  if (sourceRects.length === 0) {
    throw new RangeError('PDF saved selections require at least one source rectangle.');
  }

  const createdAt = options.createdAt ?? Date.now();
  const savedItemId = createSavedItemId(text, createdAt);
  const annotationId = `pdf_annotation_${savedItemId}`;
  const annotation: PdfAnnotationRecord = {
    id: annotationId,
    resourceId: options.metadata.resourceId,
    pageIndex: sourceRects[0]!.pageIndex,
    type: 'excerpt',
    quote: text,
    textHash: hashText(text),
    sourceRects,
    createdAt,
    updatedAt: createdAt,
  };
  const record: SavedItemRecord = {
    id: savedItemId,
    text,
    type: classifySavedText(text),
    sourceDomain: getPdfReadingDomain(options.metadata),
    tags: ['selection', 'pdf'],
    pdfAnnotationId: annotationId,
    createdAt,
  };

  await db.transaction('rw', [db.savedItems, db.pdfAnnotations, db.vocabExposures], async () => {
    await db.pdfAnnotations.put(annotation);
    await db.savedItems.put(record);
    await recordSavedVocabulary(text, createdAt);
  });

  return record;
}

function createSavedItemId(text: string, createdAt: number): string {
  savedItemSequence = (savedItemSequence + 1) % Number.MAX_SAFE_INTEGER;
  return `saved_${createdAt.toString(36)}_${hashText(text)}_${savedItemSequence.toString(36)}`;
}

function normalizePdfSourceRects(sourceRects: PdfSourceRectRecord[]): PdfSourceRectRecord[] {
  return sourceRects.flatMap((rect) => {
    if (
      !Number.isSafeInteger(rect.pageIndex)
      || rect.pageIndex < 0
      || !isFiniteNonNegative(rect.x)
      || !isFiniteNonNegative(rect.y)
      || !Number.isFinite(rect.width)
      || rect.width <= 0
      || !Number.isFinite(rect.height)
      || rect.height <= 0
    ) {
      return [];
    }

    return [{
      pageIndex: rect.pageIndex,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    }];
  });
}

function isFiniteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

async function recordSavedVocabulary(text: string, savedAt: number): Promise<void> {
  const lemmas = Array.from(new Set(analyzeEnglishText(text).tokens.filter(isTrackableEnglishToken)));

  for (const lemma of lemmas) {
    const existing = await db.vocabExposures.get(lemma);
    await db.vocabExposures.put(createSavedVocabularyRecord(lemma, savedAt, existing));
  }
}

function createSavedVocabularyRecord(
  lemma: string,
  savedAt: number,
  existing: VocabExposureRecord | undefined,
): VocabExposureRecord {
  return existing
    ? {
        ...existing,
        savedCount: existing.savedCount + 1,
        lastSeenAt: Math.max(existing.lastSeenAt, savedAt),
        userStatus:
          existing.userStatus === 'new' || existing.userStatus === 'ignored'
            ? 'learning'
            : existing.userStatus,
      }
    : {
        lemma,
        language: 'en',
        seenCount: 0,
        effectiveSeenCount: 0,
        savedCount: 1,
        lastSeenAt: savedAt,
        packTags: [],
        userStatus: 'learning',
      };
}

function classifySavedText(text: string): SavedItemRecord['type'] {
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  if (wordCount <= 1) {
    return 'word';
  }

  if (wordCount <= 8 && !/[.!?]/.test(text)) {
    return 'phrase';
  }

  if (wordCount <= 25) {
    return 'sentence';
  }

  return 'quote';
}
