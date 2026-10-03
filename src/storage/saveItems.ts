import { analyzeEnglishText, isTrackableEnglishToken } from '../analysis/english';
import { getDomain, hashText } from '../domain/events';
import { getPdfReadingDomain } from '../pdf/analytics/identity';
import type { PdfSourceMetadata } from '../pdf/source';
import { normalizePdfHighlightColor } from './pdfAnnotations';
import {
  db,
  type PdfAnnotationRecord,
  type PdfHighlightColor,
  type PdfSourceRectRecord,
  type SavedItemRecord,
  type VocabExposureRecord,
} from './schema';

let savedItemSequence = 0;

export const MAX_SAVED_ITEM_NOTE_LENGTH = 1_200;
export const MAX_SAVED_ITEM_USER_TAGS = 8;
export const MAX_SAVED_ITEM_USER_TAG_LENGTH = 24;

export interface SaveSelectedTextOptions {
  sourceUrl?: string;
  sourceTitle?: string;
  createdAt?: number;
}

export interface SavePdfSelectedTextOptions {
  metadata: PdfSourceMetadata;
  sourceRects: PdfSourceRectRecord[];
  annotationType?: PdfAnnotationRecord['type'];
  highlightColor?: PdfHighlightColor;
  note?: string;
  userTags?: string[];
  createdAt?: number;
}

export interface UpdateSavedItemMetadataInput {
  note: string;
  userTags: string[];
}

export interface UpdatePdfHighlightInput extends UpdateSavedItemMetadataInput {
  color: PdfHighlightColor;
}

export interface UpdatedPdfHighlight {
  annotation: PdfAnnotationRecord;
  savedItem: SavedItemRecord;
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
  const type = classifySavedText(text);
  const vocabularyTracked = shouldTrackSavedVocabulary(type);
  const record: SavedItemRecord = {
    id: createSavedItemId(text, createdAt),
    text,
    type,
    sourceDomain: getDomain(options.sourceUrl ?? ''),
    ...(normalizeHttpUrl(options.sourceUrl) ? { sourceUrl: normalizeHttpUrl(options.sourceUrl) } : {}),
    ...(normalizeSingleLine(options.sourceTitle) ? { sourceTitle: normalizeSingleLine(options.sourceTitle) } : {}),
    tags: ['selection'],
    vocabularyTracked,
    createdAt,
    updatedAt: createdAt,
  };

  await db.transaction('rw', [db.savedItems, db.vocabExposures], async () => {
    await db.savedItems.put(record);
    if (vocabularyTracked) {
      await recordSavedVocabulary(text, createdAt);
    }
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
  const type = classifySavedText(text);
  const vocabularyTracked = shouldTrackSavedVocabulary(type);
  const annotationType = options.annotationType
    ?? (options.highlightColor ? 'highlight' : 'excerpt');
  const note = normalizeNote(options.note ?? '');
  const userTags = normalizeUserTags(options.userTags ?? []);
  const annotation: PdfAnnotationRecord = {
    id: annotationId,
    resourceId: options.metadata.resourceId,
    pageIndex: sourceRects[0]!.pageIndex,
    type: annotationType,
    ...(annotationType === 'highlight' || options.highlightColor
      ? { color: normalizePdfHighlightColor(options.highlightColor) }
      : {}),
    quote: text,
    textHash: hashText(text),
    sourceRects,
    createdAt,
    updatedAt: createdAt,
  };
  const record: SavedItemRecord = {
    id: savedItemId,
    text,
    type,
    sourceDomain: getPdfReadingDomain(options.metadata),
    ...(normalizeHttpUrl(options.metadata.sourceUrl)
      ? { sourceUrl: normalizeHttpUrl(options.metadata.sourceUrl) }
      : {}),
    ...(normalizeSingleLine(options.metadata.displayName)
      ? { sourceTitle: normalizeSingleLine(options.metadata.displayName) }
      : {}),
    tags: annotationType === 'highlight'
      ? ['selection', 'pdf', 'highlight']
      : ['selection', 'pdf'],
    ...(note ? { note } : {}),
    ...(userTags.length > 0 ? { userTags } : {}),
    pdfAnnotationId: annotationId,
    vocabularyTracked,
    createdAt,
    updatedAt: createdAt,
  };

  await db.transaction('rw', [db.savedItems, db.pdfAnnotations, db.vocabExposures], async () => {
    await db.pdfAnnotations.put(annotation);
    await db.savedItems.put(record);
    if (vocabularyTracked) {
      await recordSavedVocabulary(text, createdAt);
    }
  });

  return record;
}

export async function updateSavedItemMetadata(
  id: string,
  input: UpdateSavedItemMetadataInput,
  updatedAt = Date.now(),
): Promise<SavedItemRecord | undefined> {
  const savedItemId = id.trim();
  if (!savedItemId) return undefined;

  return db.transaction('rw', [db.savedItems], async () => {
    const existing = await db.savedItems.get(savedItemId);
    if (!existing) return undefined;

    const record = createUpdatedSavedItemMetadata(existing, input, updatedAt);
    await db.savedItems.put(record);
    return record;
  });
}

export async function updatePdfHighlight(
  savedItemId: string,
  input: UpdatePdfHighlightInput,
  updatedAt = Date.now(),
): Promise<UpdatedPdfHighlight | undefined> {
  const normalizedSavedItemId = savedItemId.trim();
  if (!normalizedSavedItemId) return undefined;

  let result: UpdatedPdfHighlight | undefined;
  await db.transaction(
    'rw',
    [db.savedItems, db.pdfAnnotations],
    async () => {
      const existingSavedItem = await db.savedItems.get(normalizedSavedItemId);
      const annotationId = existingSavedItem?.pdfAnnotationId;
      if (!existingSavedItem || !annotationId) return;

      const existingAnnotation = await db.pdfAnnotations.get(annotationId);
      if (!existingAnnotation) return;

      const nextSavedItemTags = existingSavedItem.tags.includes('highlight')
        ? existingSavedItem.tags
        : [...existingSavedItem.tags, 'highlight'];
      const nextSavedItem: SavedItemRecord = {
        ...createUpdatedSavedItemMetadata(
          existingSavedItem,
          input,
          updatedAt,
        ),
        tags: nextSavedItemTags,
      };
      const nextAnnotation: PdfAnnotationRecord = {
        ...existingAnnotation,
        type: 'highlight',
        color: normalizePdfHighlightColor(input.color),
        updatedAt: Math.max(
          existingAnnotation.updatedAt ?? existingAnnotation.createdAt,
          updatedAt,
        ),
      };

      await db.pdfAnnotations.put(nextAnnotation);
      await db.savedItems.put(nextSavedItem);
      result = {
        annotation: nextAnnotation,
        savedItem: nextSavedItem,
      };
    },
  );

  return result;
}

export async function deleteSavedItem(id: string): Promise<boolean> {
  const savedItemId = id.trim();
  if (!savedItemId) return false;

  return db.transaction(
    'rw',
    [db.savedItems, db.pdfAnnotations, db.vocabExposures],
    async () => {
      const record = await db.savedItems.get(savedItemId);
      if (!record) return false;

      await db.savedItems.delete(record.id);
      if (record.pdfAnnotationId) {
        await db.pdfAnnotations.delete(record.pdfAnnotationId);
      }
      if (record.vocabularyTracked !== false) {
        await removeSavedVocabulary(record.text);
      }
      return true;
    },
  );
}

function createUpdatedSavedItemMetadata(
  existing: SavedItemRecord,
  input: UpdateSavedItemMetadataInput,
  updatedAt: number,
): SavedItemRecord {
  const note = normalizeNote(input.note);
  const userTags = normalizeUserTags(input.userTags);

  return {
    ...existing,
    ...(note ? { note } : { note: undefined }),
    ...(userTags.length > 0 ? { userTags } : { userTags: undefined }),
    updatedAt: Math.max(existing.updatedAt ?? existing.createdAt, updatedAt),
  };
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
  const lemmas = getSavedVocabularyLemmas(text);

  for (const lemma of lemmas) {
    const existing = await db.vocabExposures.get(lemma);
    await db.vocabExposures.put(createSavedVocabularyRecord(lemma, savedAt, existing));
  }
}

async function removeSavedVocabulary(text: string): Promise<void> {
  for (const lemma of getSavedVocabularyLemmas(text)) {
    const existing = await db.vocabExposures.get(lemma);
    if (!existing || existing.savedCount <= 0) continue;

    const savedCount = Math.max(0, existing.savedCount - 1);
    if (
      savedCount === 0
      && existing.seenCount === 0
      && existing.effectiveSeenCount === 0
      && existing.packTags.length === 0
      && existing.userStatus === 'learning'
    ) {
      await db.vocabExposures.delete(lemma);
      continue;
    }

    await db.vocabExposures.put({
      ...existing,
      savedCount,
    });
  }
}

function getSavedVocabularyLemmas(text: string): string[] {
  return Array.from(new Set(analyzeEnglishText(text).tokens.filter(isTrackableEnglishToken)));
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

function shouldTrackSavedVocabulary(type: SavedItemRecord['type']): boolean {
  return type === 'word' || type === 'phrase';
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

function normalizeHttpUrl(value: string | undefined): string | undefined {
  const input = value?.trim();
  if (!input) return undefined;

  try {
    const url = new URL(input);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function normalizeSingleLine(value: string | undefined): string | undefined {
  const normalized = value?.replace(/\s+/g, ' ').trim() ?? '';
  return normalized || undefined;
}

function normalizeNote(value: string): string {
  const note = value.replace(/\r\n?/g, '\n').trim();
  if (note.length > MAX_SAVED_ITEM_NOTE_LENGTH) {
    throw new RangeError(`Saved item notes must be at most ${MAX_SAVED_ITEM_NOTE_LENGTH} characters.`);
  }
  return note;
}

function normalizeUserTags(tags: string[]): string[] {
  if (tags.length > MAX_SAVED_ITEM_USER_TAGS) {
    throw new RangeError(`Saved items support at most ${MAX_SAVED_ITEM_USER_TAGS} user tags.`);
  }

  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const input of tags) {
    const tag = input.replace(/\s+/g, ' ').trim();
    if (!tag) continue;
    if (tag.length > MAX_SAVED_ITEM_USER_TAG_LENGTH) {
      throw new RangeError(
        `Saved item tags must be at most ${MAX_SAVED_ITEM_USER_TAG_LENGTH} characters.`,
      );
    }
    const key = tag.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(tag);
  }

  if (normalized.length > MAX_SAVED_ITEM_USER_TAGS) {
    throw new RangeError(`Saved items support at most ${MAX_SAVED_ITEM_USER_TAGS} user tags.`);
  }
  return normalized;
}
