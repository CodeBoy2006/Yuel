import { analyzeEnglishText } from '../analysis/english';
import type { ReadingEventBatchPayload } from '../messaging/contracts';
import { db, type PageRecord, type TextChunkRecord, type VocabExposureRecord } from './schema';

const BASIC_STOP_WORDS = new Set(['a', 'an', 'and', 'are', 'as', 'be', 'for', 'in', 'is', 'of', 'on', 'or', 'the', 'to']);

export async function recordReadingEventBatch(payload: ReadingEventBatchPayload): Promise<void> {
  const now = Date.now();
  const pageRecord: PageRecord = {
    pageId: payload.page.pageId,
    domain: payload.page.domain,
    titleHash: payload.page.titleHash,
    urlHash: payload.page.urlHash,
    language: payload.page.language,
    totalWords: payload.page.totalWords,
    effectiveWords: 0,
    difficultyScore: 0,
    firstSeenAt: payload.page.capturedAt,
    lastReadAt: now,
  };

  const chunkRecords: TextChunkRecord[] = payload.chunks.map((chunk) => ({
    chunkId: chunk.chunkId,
    pageId: chunk.pageId,
    textHash: chunk.textHash,
    wordCount: chunk.wordCount,
    sentenceCount: chunk.sentenceCount,
    difficulty: 0,
    exposureSeconds: 0,
    effectiveWords: 0,
  }));

  const vocabUpdates = payload.chunks.flatMap((chunk) => {
    if (!chunk.text) return [];
    return extractVocabExposureUpdates(chunk.text, now);
  });

  await db.transaction('rw', db.pages, db.textChunks, db.readingEvents, db.vocabExposures, async () => {
    await db.pages.put(pageRecord);
    await db.textChunks.bulkPut(chunkRecords);
    await db.readingEvents.bulkPut(payload.events);

    for (const update of vocabUpdates) {
      const existing = await db.vocabExposures.get(update.lemma);
      await db.vocabExposures.put(
        existing
          ? {
              ...existing,
              seenCount: existing.seenCount + update.seenCount,
              effectiveSeenCount: existing.effectiveSeenCount + update.effectiveSeenCount,
              lastSeenAt: now,
            }
          : update,
      );
    }
  });
}

function extractVocabExposureUpdates(text: string, now: number): VocabExposureRecord[] {
  const counts = new Map<string, number>();
  const analysis = analyzeEnglishText(text);

  for (const token of analysis.tokens) {
    if (token.length < 4 || BASIC_STOP_WORDS.has(token) || /^\d+$/.test(token)) {
      continue;
    }

    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  return Array.from(counts, ([lemma, seenCount]) => ({
    lemma,
    language: 'en',
    seenCount,
    effectiveSeenCount: seenCount,
    lookupCount: 0,
    savedCount: 0,
    lastSeenAt: now,
    packTags: [],
    userStatus: 'new',
  }));
}
