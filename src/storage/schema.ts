import Dexie, { type Table } from 'dexie';

import type { ReadingConfidence, ReadingEventKind } from '../domain/events';

export interface PageRecord {
  pageId: string;
  domain: string;
  titleHash: string;
  urlHash: string;
  language: string;
  totalWords: number;
  effectiveWords: number;
  newWords?: number;
  reviewWords?: number;
  rawExposureMs?: number;
  effectiveReadingMs?: number;
  confidence?: number;
  difficultyScore: number;
  firstSeenAt: number;
  lastReadAt: number;
}

export interface TextChunkRecord {
  chunkId: string;
  pageId: string;
  textHash: string;
  wordCount: number;
  sentenceCount: number;
  difficulty: number;
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
  lookupCount: number;
  savedCount: number;
  lastSeenAt: number;
  packTags: string[];
  userStatus: 'new' | 'known' | 'learning' | 'ignored';
}

export interface SavedItemRecord {
  id: string;
  text: string;
  type: 'word' | 'phrase' | 'sentence' | 'quote';
  context?: string;
  sourceDomain: string;
  tags: string[];
  createdAt: number;
}

export interface DailyStatRecord {
  date: string;
  effectiveWords: number;
  newWords?: number;
  reviewWords?: number;
  minutes: number;
  rawExposureMs?: number;
  effectiveReadingMs?: number;
  confidence?: number;
  advancedWords: number;
  expressions: number;
  streak: number;
  topDomains: string[];
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
  }
}

export const db = new YuelDatabase();
