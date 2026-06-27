import { analyzeEnglishText } from '../analysis/english';
import type { ReadingEventBatchPayload } from '../messaging/contracts';
import { db, type PageRecord, type TextChunkRecord, type VocabExposureRecord } from './schema';
import { summarizeReadingEventBatch } from './aggregateReading';

const BASIC_STOP_WORDS = new Set(['a', 'an', 'and', 'are', 'as', 'be', 'for', 'in', 'is', 'of', 'on', 'or', 'the', 'to']);

export async function recordReadingEventBatch(payload: ReadingEventBatchPayload): Promise<void> {
  const now = Date.now();
  const summary = summarizeReadingEventBatch(payload);
  const chunkUpdatesById = new Map(summary.chunkUpdates.map((update) => [update.chunkId, update]));
  const exposedChunkIds = new Set(chunkUpdatesById.keys());

  const vocabUpdates = payload.chunks.flatMap((chunk) => {
    if (!chunk.text || !exposedChunkIds.has(chunk.chunkId)) return [];
    return extractVocabExposureUpdates(chunk.text, now);
  });

  await db.transaction('rw', db.pages, db.textChunks, db.readingEvents, db.vocabExposures, db.dailyStats, async () => {
    const existingPage = await db.pages.get(payload.page.pageId);
    let effectiveWordsDelta = 0;

    const chunkRecords: TextChunkRecord[] = [];
    for (const chunk of payload.chunks) {
      const existingChunk = await db.textChunks.get(chunk.chunkId);
      const update = chunkUpdatesById.get(chunk.chunkId);
      const priorEffectiveWords = existingChunk?.effectiveWords ?? 0;
      const nextEffectiveWords = Math.min(chunk.wordCount, priorEffectiveWords + (update?.effectiveWords ?? 0));

      effectiveWordsDelta += nextEffectiveWords - priorEffectiveWords;
      chunkRecords.push({
        chunkId: chunk.chunkId,
        pageId: chunk.pageId,
        textHash: chunk.textHash,
        wordCount: chunk.wordCount,
        sentenceCount: chunk.sentenceCount,
        difficulty: existingChunk?.difficulty ?? 0,
        exposureSeconds: (existingChunk?.exposureSeconds ?? 0) + (update?.exposureSeconds ?? 0),
        effectiveWords: nextEffectiveWords,
      });
    }

    const pageRecord: PageRecord = {
      pageId: payload.page.pageId,
      domain: payload.page.domain,
      titleHash: payload.page.titleHash,
      urlHash: payload.page.urlHash,
      language: payload.page.language,
      totalWords: payload.page.totalWords,
      effectiveWords: (existingPage?.effectiveWords ?? 0) + effectiveWordsDelta,
      difficultyScore: existingPage?.difficultyScore ?? 0,
      firstSeenAt: existingPage?.firstSeenAt ?? payload.page.capturedAt,
      lastReadAt: now,
    };

    await db.pages.put(pageRecord);
    if (chunkRecords.length > 0) {
      await db.textChunks.bulkPut(chunkRecords);
    }
    if (payload.events.length > 0) {
      await db.readingEvents.bulkPut(payload.events);
    }
    await recordDailyStatIncrements(summary.dailyUpdates, effectiveWordsDelta, payload.page.domain);

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

async function recordDailyStatIncrements(
  updates: ReturnType<typeof summarizeReadingEventBatch>['dailyUpdates'],
  effectiveWordsDelta: number,
  domain: string,
): Promise<void> {
  let remainingEffectiveWords = effectiveWordsDelta;
  const proposedEffectiveWords = updates.reduce((sum, update) => sum + update.effectiveWords, 0);

  for (const [index, update] of updates.entries()) {
    const isLast = index === updates.length - 1;
    const effectiveWords =
      isLast || proposedEffectiveWords === 0
        ? remainingEffectiveWords
        : Math.min(remainingEffectiveWords, Math.round((update.effectiveWords / proposedEffectiveWords) * effectiveWordsDelta));
    remainingEffectiveWords -= effectiveWords;

    const existing = await db.dailyStats.get(update.date);
    await db.dailyStats.put({
      date: update.date,
      effectiveWords: (existing?.effectiveWords ?? 0) + effectiveWords,
      minutes: (existing?.minutes ?? 0) + update.minutes,
      advancedWords: existing?.advancedWords ?? 0,
      expressions: existing?.expressions ?? 0,
      streak: existing?.streak ?? 0,
      topDomains: mergeTopDomains(existing?.topDomains ?? [], domain),
    });
  }
}

function mergeTopDomains(existing: string[], domain: string): string[] {
  return Array.from(new Set([...existing, domain])).slice(0, 8);
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
