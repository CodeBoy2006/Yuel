import { analyzeEnglishText, isTrackableEnglishToken } from '../analysis/english';
import type { ReadingEvent } from '../domain/events';
import { matchPackRules, type YuelPack } from '../domain/packs';
import type { ReadingEventBatchPayload } from '../messaging/contracts';
import techEnglishPack from '../packs/tech-english.pack.json';
import { db, type PageRecord, type TextChunkRecord, type VocabExposureRecord } from './schema';
import { summarizeReadingEventBatch } from './aggregateReading';

const ACTIVE_PACKS: YuelPack[] = [techEnglishPack as YuelPack];
const READING_EVENT_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;

export async function recordReadingEventBatch(payload: ReadingEventBatchPayload): Promise<void> {
  const now = Date.now();

  await db.transaction('rw', db.pages, db.textChunks, db.readingEvents, db.vocabExposures, db.dailyStats, async () => {
    const newEvents = await getNewReadingEvents(payload.events);
    if (payload.events.length > 0 && newEvents.length === 0) {
      await pruneExpiredReadingEvents(now);
      return;
    }

    const batchPayload = newEvents.length === payload.events.length ? payload : { ...payload, events: newEvents };
    const summary = summarizeReadingEventBatch(batchPayload);
    const chunkUpdatesById = new Map(summary.chunkUpdates.map((update) => [update.chunkId, update]));
    const firstEffectiveReadChunkIds = new Set<string>();

    const existingPage = await db.pages.get(payload.page.pageId);
    let effectiveWordsDelta = 0;

    const chunkRecords: TextChunkRecord[] = [];
    for (const chunk of payload.chunks) {
      const existingChunk = await db.textChunks.get(chunk.chunkId);
      const update = chunkUpdatesById.get(chunk.chunkId);
      const priorEffectiveWords = existingChunk?.effectiveWords ?? 0;
      const nextEffectiveWords = Math.min(chunk.wordCount, priorEffectiveWords + (update?.effectiveWords ?? 0));
      const newEffectiveWords = nextEffectiveWords - priorEffectiveWords;

      effectiveWordsDelta += newEffectiveWords;
      if (priorEffectiveWords === 0 && newEffectiveWords > 0) {
        firstEffectiveReadChunkIds.add(chunk.chunkId);
      }
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
    const vocabUpdates = payload.chunks.flatMap((chunk) => {
      if (!chunk.text || !firstEffectiveReadChunkIds.has(chunk.chunkId)) return [];
      return extractVocabExposureUpdates(chunk.text, now);
    });
    const lastReadAt = summary.dailyUpdates.length > 0 ? now : (existingPage?.lastReadAt ?? now);
    const pageDomain = normalizeStoredDomain(payload.page.domain);

    const pageRecord: PageRecord = {
      pageId: payload.page.pageId,
      domain: pageDomain,
      titleHash: payload.page.titleHash,
      urlHash: payload.page.urlHash,
      language: payload.page.language,
      totalWords: payload.page.totalWords,
      effectiveWords: (existingPage?.effectiveWords ?? 0) + effectiveWordsDelta,
      difficultyScore: existingPage?.difficultyScore ?? 0,
      firstSeenAt: existingPage?.firstSeenAt ?? payload.page.capturedAt,
      lastReadAt,
    };

    await db.pages.put(pageRecord);
    if (chunkRecords.length > 0) {
      await db.textChunks.bulkPut(chunkRecords);
    }
    if (newEvents.length > 0) {
      await db.readingEvents.bulkPut(newEvents);
    }
    await recordDailyStatIncrements(summary.dailyUpdates, effectiveWordsDelta, pageDomain);

    for (const update of vocabUpdates) {
      const existing = await db.vocabExposures.get(update.lemma);
      await db.vocabExposures.put(
        existing
          ? {
              ...existing,
              seenCount: existing.seenCount + update.seenCount,
              effectiveSeenCount: existing.effectiveSeenCount + update.effectiveSeenCount,
              lastSeenAt: now,
              packTags: mergeTags(existing.packTags, update.packTags),
            }
          : update,
      );
    }

    await pruneExpiredReadingEvents(now);
  });
}

async function getNewReadingEvents(events: ReadingEvent[]): Promise<ReadingEvent[]> {
  if (events.length === 0) {
    return [];
  }

  const existingEvents = await db.readingEvents.bulkGet(events.map((event) => event.id));
  const existingEventIds = new Set(
    existingEvents.filter((event): event is NonNullable<typeof event> => Boolean(event)).map((event) => event.id),
  );
  const seenIncomingEventIds = new Set<string>();

  return events.filter((event) => {
    if (existingEventIds.has(event.id) || seenIncomingEventIds.has(event.id)) {
      return false;
    }

    seenIncomingEventIds.add(event.id);
    return true;
  });
}

export async function pruneExpiredReadingEvents(now = Date.now()): Promise<void> {
  await db.readingEvents.where('occurredAt').below(now - READING_EVENT_RETENTION_MS).delete();
}

export async function clearLocalReadingData(): Promise<void> {
  await db.transaction(
    'rw',
    [db.pages, db.textChunks, db.readingEvents, db.vocabExposures, db.savedItems, db.dailyStats],
    async () => {
      await Promise.all([
        db.pages.clear(),
        db.textChunks.clear(),
        db.readingEvents.clear(),
        db.vocabExposures.clear(),
        db.savedItems.clear(),
        db.dailyStats.clear(),
      ]);
    },
  );
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
  const normalizedExisting = existing.map(normalizeExistingTopDomain).filter((value): value is string => Boolean(value));
  return Array.from(new Set([...normalizedExisting, domain])).slice(0, 8);
}

function normalizeStoredDomain(domain: string): string {
  const normalized = domain.trim();
  return normalized || 'unknown';
}

function normalizeExistingTopDomain(domain: string): string | undefined {
  const normalized = domain.trim();
  return normalized || undefined;
}

function extractVocabExposureUpdates(text: string, now: number): VocabExposureRecord[] {
  const counts = new Map<string, number>();
  const packTagsByLemma = collectPackTagsByLemma(text);
  const analysis = analyzeEnglishText(text);

  for (const token of analysis.tokens) {
    if (!isTrackableEnglishToken(token)) {
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
    packTags: packTagsByLemma.get(lemma) ?? [],
    userStatus: 'new',
  }));
}

function collectPackTagsByLemma(text: string): Map<string, string[]> {
  const tagsByLemma = new Map<string, Set<string>>();

  for (const pack of ACTIVE_PACKS) {
    for (const match of matchPackRules(pack, text)) {
      for (const lemma of analyzeEnglishText(match.text).tokens) {
        if (!isTrackableEnglishToken(lemma)) {
          continue;
        }

        const tags = tagsByLemma.get(lemma) ?? new Set<string>();
        for (const tag of match.tags) {
          tags.add(tag);
        }
        tagsByLemma.set(lemma, tags);
      }
    }
  }

  return new Map(Array.from(tagsByLemma, ([lemma, tags]) => [lemma, Array.from(tags)]));
}

function mergeTags(existing: string[], next: string[]): string[] {
  return Array.from(new Set([...existing, ...next]));
}
