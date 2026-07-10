import Dexie, { type Table } from 'dexie';

import type { ReadingConfidence, ReadingEventKind } from '../domain/events';
import type { ReadingContentType, ReadingPaceProfileSource } from '../domain/readingPace';

export interface PageRecord {
  pageId: string;
  domain: string;
  titleHash: string;
  urlHash: string;
  language: string;
  totalWords: number;
  metricModelVersion?: number;
  effectiveWords: number;
  coveredWords?: number;
  newWords?: number;
  reviewWords?: number;
  rawExposureMs?: number;
  effectiveReadingMs?: number;
  confidence?: number;
  firstSeenAt: number;
  lastReadAt: number;
  snapshotCapturedAt?: number;
}

export interface TextChunkRecord {
  chunkId: string;
  pageId: string;
  textHash: string;
  wordCount: number;
  metricModelVersion?: number;
  sentenceCount: number;
  exposureSeconds: number;
  rawExposureMs?: number;
  effectiveReadingMs?: number;
  effectiveWords: number;
  newWords?: number;
  reviewWords?: number;
  confidence?: number;
}

export interface ChunkSessionRecord {
  id: string;
  sessionId: string;
  chunkId: string;
  effectiveWords: number;
}

export interface ChunkDayRecord {
  id: string;
  date: string;
  chunkId: string;
  effectiveWords: number;
  newWords: number;
  reviewWords: number;
  rawExposureMs: number;
  effectiveReadingMs: number;
}

export interface ReadingEventRecord {
  id: string;
  sessionId: string;
  pageId: string;
  chunkId?: string;
  kind: ReadingEventKind;
  occurredAt: number;
  confidence: ReadingConfidence;
  value?: Record<string, unknown>;
}

export interface VocabExposureRecord {
  lemma: string;
  language: string;
  seenCount: number;
  effectiveSeenCount: number;
  savedCount: number;
  lastSeenAt: number;
  packTags: string[];
  userStatus: 'new' | 'known' | 'learning' | 'ignored';
}

export interface SavedItemRecord {
  id: string;
  text: string;
  type: 'word' | 'phrase' | 'sentence' | 'quote';
  sourceDomain: string;
  tags: string[];
  createdAt: number;
}

export interface DailyStatRecord {
  date: string;
  effectiveWords: number;
  checkInThresholdWords?: number;
  metricModelVersion?: number;
  newWords?: number;
  reviewWords?: number;
  minutes: number;
  rawExposureMs?: number;
  effectiveReadingMs?: number;
  confidence?: number;
  streak: number;
  topDomains: string[];
}

export interface ReadingPaceProfileRecord {
  id: string;
  language: string;
  contentType: ReadingContentType;
  baseWordsPerMinute: number;
  sampleCount: number;
  source: ReadingPaceProfileSource;
  recentAdaptiveWordsPerMinute?: number[];
  updatedAt: number;
}

export interface ReadingPaceEpisodeSegmentState {
  wordCount: number;
  centerDwellMs: number;
  lastViewportY: number;
  lastSeenAt: number;
}

export interface ReadingPaceEpisodeRecord {
  id: string;
  sessionId: string;
  pageId: string;
  language: string;
  startedAt: number;
  lastObservedAt: number;
  activeMs: number;
  completedWords: number;
  completedSegmentIds: string[];
  segmentStates: Record<string, ReadingPaceEpisodeSegmentState>;
  lastScrollDirection: -1 | 0 | 1;
}

export interface MetadataRecord {
  key: string;
  numberValue: number;
}

export class YuelDatabase extends Dexie {
  pages!: Table<PageRecord, string>;
  textChunks!: Table<TextChunkRecord, string>;
  chunkSessions!: Table<ChunkSessionRecord, string>;
  chunkDays!: Table<ChunkDayRecord, string>;
  readingEvents!: Table<ReadingEventRecord, string>;
  vocabExposures!: Table<VocabExposureRecord, string>;
  savedItems!: Table<SavedItemRecord, string>;
  dailyStats!: Table<DailyStatRecord, string>;
  readingPaceProfiles!: Table<ReadingPaceProfileRecord, string>;
  readingPaceEpisodes!: Table<ReadingPaceEpisodeRecord, string>;
  metadata!: Table<MetadataRecord, string>;

  constructor() {
    super('yuel-local');

    this.version(1).stores({
      pages: 'pageId, domain, language, lastReadAt',
      textChunks: 'chunkId, pageId, textHash',
      readingEvents: 'id, sessionId, pageId, chunkId, kind, occurredAt',
      vocabExposures: 'lemma, language, lastSeenAt, userStatus',
      savedItems: 'id, type, sourceDomain, createdAt',
      dailyStats: 'date',
    });

    this.version(2).stores({
      pages: 'pageId, domain, language, lastReadAt',
      textChunks: 'chunkId, pageId, textHash',
      chunkSessions: 'id, sessionId, chunkId',
      chunkDays: 'id, date, chunkId',
      readingEvents: 'id, sessionId, pageId, chunkId, kind, occurredAt',
      vocabExposures: 'lemma, language, lastSeenAt, userStatus',
      savedItems: 'id, type, sourceDomain, createdAt',
      dailyStats: 'date',
    });

    this.version(3).stores({
      pages: 'pageId, domain, language, lastReadAt',
      textChunks: 'chunkId, pageId, textHash',
      chunkSessions: 'id, sessionId, chunkId',
      chunkDays: 'id, date, chunkId',
      readingEvents: 'id, sessionId, pageId, chunkId, kind, occurredAt',
      vocabExposures: 'lemma, language, lastSeenAt, userStatus',
      savedItems: 'id, type, sourceDomain, createdAt',
      dailyStats: 'date',
      readingPaceProfiles: 'id, language, contentType, source, updatedAt',
    });

    this.version(4).stores({
      pages: 'pageId, domain, language, lastReadAt',
      textChunks: 'chunkId, pageId, textHash',
      chunkSessions: 'id, sessionId, chunkId',
      chunkDays: 'id, date, chunkId',
      readingEvents: 'id, sessionId, pageId, chunkId, kind, occurredAt',
      vocabExposures: 'lemma, language, lastSeenAt, userStatus',
      savedItems: 'id, type, sourceDomain, createdAt',
      dailyStats: 'date',
      readingPaceProfiles: 'id, language, contentType, source, updatedAt',
      metadata: 'key',
    });

    this.version(5).stores({
      pages: 'pageId, domain, language, lastReadAt',
      textChunks: 'chunkId, pageId, textHash',
      chunkSessions: 'id, sessionId, chunkId',
      chunkDays: 'id, date, chunkId',
      readingEvents: 'id, sessionId, pageId, chunkId, kind, occurredAt',
      vocabExposures: 'lemma, language, lastSeenAt, userStatus',
      savedItems: 'id, type, sourceDomain, createdAt',
      dailyStats: 'date',
      readingPaceProfiles: 'id, language, contentType, source, updatedAt',
      readingPaceEpisodes: 'id, sessionId, pageId, lastObservedAt',
      metadata: 'key',
    });
  }
}

export const db = new YuelDatabase();
