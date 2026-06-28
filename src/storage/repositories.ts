import { analyzeEnglishText, isTrackableEnglishToken } from '../analysis/english';
import type { ReadingEvent } from '../domain/events';
import { matchPackRules, type YuelPack } from '../domain/packs';
import type { ReadingEventBatchPayload } from '../messaging/contracts';
import techEnglishPack from '../packs/tech-english.pack.json';
import { db, type ChunkDayRecord, type ChunkSessionRecord, type PageRecord, type TextChunkRecord, type VocabExposureRecord } from './schema';
import { summarizeReadingEventBatch, type ChunkDayReadingState, type ChunkReadingState } from './aggregateReading';

const ACTIVE_PACKS: YuelPack[] = [techEnglishPack as YuelPack];
const READING_EVENT_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;

export async function recordReadingEventBatch(payload: ReadingEventBatchPayload): Promise<void> {
  const now = Date.now();

  await db.transaction('rw', [db.pages, db.textChunks, db.chunkSessions, db.chunkDays, db.readingEvents, db.vocabExposures, db.dailyStats], async () => {
    const newEvents = await getNewReadingEvents(payload.events);
    if (payload.events.length > 0 && newEvents.length === 0) {
      await pruneExpiredReadingEvents(now);
      return;
    }

    const batchPayload = newEvents.length === payload.events.length ? payload : { ...payload, events: newEvents };
    const existingChunks = new Map<string, TextChunkRecord | undefined>();
    const existingSessionChunks = new Map<string, ChunkSessionRecord | undefined>();
    const existingDayChunks = new Map<string, ChunkDayRecord | undefined>();
    const eventDates = getEventDates(batchPayload);
    const sessionId = batchPayload.events[0]?.sessionId;
    const chunkStates = new Map<string, ChunkReadingState>();
    const chunkDayStates = new Map<string, Map<string, ChunkDayReadingState>>();

    for (const chunk of payload.chunks) {
      const existingChunk = await db.textChunks.get(chunk.chunkId);
      const existingSessionChunk = sessionId ? await db.chunkSessions.get(createChunkSessionId(sessionId, chunk.chunkId)) : undefined;
      existingChunks.set(chunk.chunkId, existingChunk);
      existingSessionChunks.set(chunk.chunkId, existingSessionChunk);
      chunkStates.set(chunk.chunkId, {
        sessionEffectiveWords: existingSessionChunk?.effectiveWords ?? 0,
        todayEffectiveWords: 0,
        lifetimeEffectiveWords: existingChunk?.effectiveWords ?? 0,
      });

      for (const date of eventDates) {
        const existingDayChunk = await db.chunkDays.get(createChunkDayId(date, chunk.chunkId));
        existingDayChunks.set(createChunkDayId(date, chunk.chunkId), existingDayChunk);
        const dayStates = chunkDayStates.get(date) ?? new Map();
        dayStates.set(chunk.chunkId, {
          effectiveWords: existingDayChunk?.effectiveWords ?? 0,
        });
        chunkDayStates.set(date, dayStates);
      }
    }

    const summary = summarizeReadingEventBatch(batchPayload, { chunkStates, chunkDayStates });
    const chunkUpdatesById = new Map(summary.chunkUpdates.map((update) => [update.chunkId, update]));

    const existingPage = await db.pages.get(payload.page.pageId);

    const chunkRecords: TextChunkRecord[] = [];
    for (const chunk of payload.chunks) {
      const existingChunk = existingChunks.get(chunk.chunkId);
      const update = chunkUpdatesById.get(chunk.chunkId);
      const priorLifetimeEffectiveWords = existingChunk?.effectiveWords ?? 0;
      const nextLifetimeEffectiveWords = Math.min(chunk.wordCount, priorLifetimeEffectiveWords + (update?.newWords ?? 0));
      const priorRawExposureMs = existingChunk?.rawExposureMs ?? (existingChunk?.exposureSeconds ?? 0) * 1_000;
      const nextRawExposureMs = priorRawExposureMs + (update?.rawExposureMs ?? 0);
      chunkRecords.push({
        chunkId: chunk.chunkId,
        pageId: chunk.pageId,
        textHash: chunk.textHash,
        wordCount: chunk.wordCount,
        sentenceCount: chunk.sentenceCount,
        difficulty: existingChunk?.difficulty ?? 0,
        exposureSeconds: nextRawExposureMs / 1_000,
        rawExposureMs: nextRawExposureMs,
        effectiveReadingMs: (existingChunk?.effectiveReadingMs ?? 0) + (update?.effectiveReadingMs ?? 0),
        effectiveWords: nextLifetimeEffectiveWords,
        newWords: (existingChunk?.newWords ?? 0) + (update?.newWords ?? 0),
        reviewWords: (existingChunk?.reviewWords ?? 0) + (update?.reviewWords ?? 0),
        confidence: weightedAverageConfidence(
          existingChunk?.confidence ?? 0,
          existingChunk?.effectiveWords ?? 0,
          update?.confidence ?? 0,
          update?.effectiveWords ?? 0,
        ),
      });
    }
    const vocabUpdates = payload.chunks.flatMap((chunk) => {
      const update = chunkUpdatesById.get(chunk.chunkId);
      if (!chunk.text || !update || update.effectiveWords <= 0) return [];
      return extractVocabExposureUpdates(chunk.text, now, update.effectiveWords / chunk.wordCount);
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
      effectiveWords: (existingPage?.effectiveWords ?? 0) + summary.pageEffectiveWords,
      newWords: (existingPage?.newWords ?? 0) + summary.pageNewWords,
      reviewWords: (existingPage?.reviewWords ?? 0) + summary.pageReviewWords,
      rawExposureMs: (existingPage?.rawExposureMs ?? 0) + summary.totalRawExposureMs,
      effectiveReadingMs: (existingPage?.effectiveReadingMs ?? 0) + summary.totalEffectiveReadingMs,
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
    await recordChunkCapIncrements(summary, existingSessionChunks, existingDayChunks, sessionId);
    await recordDailyStatIncrements(summary.dailyUpdates, pageDomain);

    for (const update of vocabUpdates) {
      const existing = await db.vocabExposures.get(update.lemma);
      if (existing?.userStatus === 'ignored') {
        continue;
      }

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
    [db.pages, db.textChunks, db.chunkSessions, db.chunkDays, db.readingEvents, db.vocabExposures, db.savedItems, db.dailyStats],
    async () => {
      await Promise.all([
        db.pages.clear(),
        db.textChunks.clear(),
        db.chunkSessions.clear(),
        db.chunkDays.clear(),
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
  domain: string,
): Promise<void> {
  for (const update of updates) {
    const existing = await db.dailyStats.get(update.date);
    await db.dailyStats.put({
      date: update.date,
      effectiveWords: (existing?.effectiveWords ?? 0) + update.effectiveWords,
      newWords: (existing?.newWords ?? 0) + update.newWords,
      reviewWords: (existing?.reviewWords ?? 0) + update.reviewWords,
      minutes: (existing?.minutes ?? 0) + update.minutes,
      rawExposureMs: (existing?.rawExposureMs ?? 0) + update.rawExposureMs,
      effectiveReadingMs: (existing?.effectiveReadingMs ?? 0) + update.effectiveReadingMs,
      advancedWords: existing?.advancedWords ?? 0,
      expressions: existing?.expressions ?? 0,
      streak: existing?.streak ?? 0,
      topDomains: mergeTopDomains(existing?.topDomains ?? [], domain),
    });
  }
}

async function recordChunkCapIncrements(
  summary: ReturnType<typeof summarizeReadingEventBatch>,
  existingSessionChunks: Map<string, ChunkSessionRecord | undefined>,
  existingDayChunks: Map<string, ChunkDayRecord | undefined>,
  sessionId: string | undefined,
): Promise<void> {
  if (sessionId) {
    for (const update of summary.chunkUpdates) {
      if (update.effectiveWords <= 0) {
        continue;
      }

      const existing = existingSessionChunks.get(update.chunkId);
      await db.chunkSessions.put({
        id: createChunkSessionId(sessionId, update.chunkId),
        sessionId,
        chunkId: update.chunkId,
        effectiveWords: (existing?.effectiveWords ?? 0) + update.effectiveWords,
      });
    }
  }

  for (const update of summary.chunkDayUpdates) {
    if (update.rawExposureMs <= 0) {
      continue;
    }

    const id = createChunkDayId(update.date, update.chunkId);
    const existing = existingDayChunks.get(id);
    await db.chunkDays.put({
      id,
      date: update.date,
      chunkId: update.chunkId,
      effectiveWords: (existing?.effectiveWords ?? 0) + update.effectiveWords,
      newWords: (existing?.newWords ?? 0) + update.newWords,
      reviewWords: (existing?.reviewWords ?? 0) + update.reviewWords,
      rawExposureMs: (existing?.rawExposureMs ?? 0) + update.rawExposureMs,
      effectiveReadingMs: (existing?.effectiveReadingMs ?? 0) + update.effectiveReadingMs,
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

function getEventDates(payload: ReadingEventBatchPayload): string[] {
  return Array.from(new Set(payload.events.map((event) => formatLocalDate(event.occurredAt))));
}

function createChunkSessionId(sessionId: string, chunkId: string): string {
  return `${sessionId}:${chunkId}`;
}

function createChunkDayId(date: string, chunkId: string): string {
  return `${date}:${chunkId}`;
}

function weightedAverageConfidence(
  existingConfidence: number,
  existingWords: number,
  nextConfidence: number,
  nextWords: number,
): number {
  const totalWords = existingWords + nextWords;
  if (totalWords <= 0) {
    return nextConfidence;
  }

  return (existingConfidence * existingWords + nextConfidence * nextWords) / totalWords;
}

function formatLocalDate(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function extractVocabExposureUpdates(text: string, now: number, coverage: number): VocabExposureRecord[] {
  const boundedCoverage = Math.min(1, Math.max(0, Number.isFinite(coverage) ? coverage : 0));
  if (boundedCoverage <= 0) {
    return [];
  }

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
    seenCount: seenCount * boundedCoverage,
    effectiveSeenCount: seenCount * boundedCoverage,
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
