import Dexie, { type Table } from 'dexie';

import type { ReadingConfidence, ReadingEventKind, ReadingResourceType } from '../domain/events';
import type { ReadingContentType, ReadingPaceProfileSource } from '../domain/readingPace';

export interface PageRecord {
  pageId: string;
  domain: string;
  resourceType?: ReadingResourceType;
  resourceId?: string;
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
  sectionId?: string;
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

export interface ReadingSessionRecord {
  id: string;
  sessionId: string;
  date: string;
  pageId: string;
  domain: string;
  resourceType?: ReadingResourceType;
  startedAt: number;
  endedAt: number;
  effectiveReadingMs: number;
  effectiveWords: number;
  confidence: number;
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
  sourceUrl?: string;
  sourceTitle?: string;
  tags: string[];
  userTags?: string[];
  note?: string;
  pdfAnnotationId?: string;
  vocabularyTracked?: boolean;
  createdAt: number;
  updatedAt?: number;
}

export interface PdfSourceRectRecord {
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type PdfHighlightColor = 'yellow' | 'green' | 'blue' | 'rose';

export interface PdfAnnotationRecord {
  id: string;
  resourceId: string;
  pageIndex: number;
  type: 'excerpt' | 'highlight';
  color?: PdfHighlightColor;
  quote: string;
  textHash: string;
  sourceRects: PdfSourceRectRecord[];
  createdAt: number;
  updatedAt: number;
}

export type PdfReaderZoomLevel = 'automatic' | 'fit-page' | 'fit-width' | number;
export type PdfReaderScrollStrategy = 'vertical' | 'horizontal';

export interface PdfDocumentStateRecord {
  resourceId: string;
  sha256: string;
  kind: 'local' | 'remote';
  displayName: string;
  byteLength: number;
  mediaType: string;
  origin?: string;
  sourceUrl?: string;
  pageIndex: number;
  pageCoordinates?: {
    x: number;
    y: number;
  };
  zoomLevel: PdfReaderZoomLevel;
  scrollStrategy: PdfReaderScrollStrategy;
  rotation: 0 | 1 | 2 | 3;
  isPanMode: boolean;
  lastOpenedAt: number;
  updatedAt: number;
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
  adaptiveSampleCount: number;
  source: ReadingPaceProfileSource;
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
  maxScrollOffsetPx?: number;
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
  readingSessions!: Table<ReadingSessionRecord, string>;
  vocabExposures!: Table<VocabExposureRecord, string>;
  savedItems!: Table<SavedItemRecord, string>;
  pdfAnnotations!: Table<PdfAnnotationRecord, string>;
  pdfDocumentStates!: Table<PdfDocumentStateRecord, string>;
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
      chunkSessions: 'id, sessionId, chunkId',
      chunkDays: 'id, date, chunkId',
    });

    this.version(3).stores({
      readingPaceProfiles: 'id, language, contentType, source, updatedAt',
    });

    this.version(4).stores({
      metadata: 'key',
    });

    this.version(5).stores({
      readingPaceEpisodes: 'id, sessionId, pageId, lastObservedAt',
    });

    this.version(6).stores({
      readingSessions: 'id, sessionId, date, pageId, domain, startedAt, endedAt',
    });

    this.version(7).stores({
      pdfAnnotations: 'id, resourceId, pageIndex, createdAt',
      pdfDocumentStates: 'resourceId, kind, lastOpenedAt, updatedAt',
    });

    this.version(8).stores({
      savedItems: 'id, type, sourceDomain, createdAt, pdfAnnotationId',
    });
  }
}

export const db = new YuelDatabase();
