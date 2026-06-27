import { analyzeEnglishText, isTrackableEnglishToken } from '../analysis/english';
import { getDomain, hashText } from '../domain/events';
import { db, type SavedItemRecord, type VocabExposureRecord } from './schema';

export interface SaveSelectedTextOptions {
  sourceUrl?: string;
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
    id: `saved_${createdAt.toString(36)}_${hashText(text)}`,
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
        lastSeenAt: savedAt,
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
        lookupCount: 0,
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
