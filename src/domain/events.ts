export type ReadingConfidence = 'low' | 'medium' | 'high';
export type ReadingResourceType = 'web' | 'pdf';

export type ReadingEventKind =
  | 'PageVisible'
  | 'PageHidden'
  | 'TextBlockVisible'
  | 'TextBlockHidden'
  | 'TextViewportExposureTick'
  | 'ScrollVelocityChanged'
  | 'ScrollCoordinatesReset'
  | 'UserIdle'
  | 'UserActive'
  | 'TextSelected';

export interface PageSnapshot {
  pageId: string;
  domain: string;
  resourceType?: ReadingResourceType;
  resourceId?: string;
  titleHash: string;
  urlHash: string;
  language: string;
  totalWords: number;
  metricModelVersion?: number;
  capturedAt: number;
}

export interface TextChunkSnapshot {
  chunkId: string;
  pageId: string;
  sectionId?: string;
  textHash: string;
  text?: string;
  sourceKey?: string;
  wordCount: number;
  sentenceCount: number;
  selector: string;
}

export interface ReadingEvent {
  id: string;
  sessionId: string;
  pageId: string;
  chunkId?: string;
  kind: ReadingEventKind;
  occurredAt: number;
  confidence: ReadingConfidence;
  value?: Record<string, unknown>;
}

export function createSessionId(now = Date.now(), random = Math.random()): string {
  return `session_${now.toString(36)}_${Math.floor(random * 1_000_000).toString(36)}`;
}

export function createEventId(kind: ReadingEventKind, now = Date.now(), random = Math.random()): string {
  return `${kind}_${now.toString(36)}_${Math.floor(random * 1_000_000).toString(36)}`;
}

export function createPageId(url: string): string {
  const domain = getDomain(url);
  return `${domain}_${hashText(normalizeUrlForHashing(url))}`;
}

export function createChunkId(pageId: string, text: string, sourceKey?: string): string {
  const identity = sourceKey ? `${sourceKey}\u0000${text}` : text;
  return `${pageId}_${hashText(identity)}`;
}

export function createPageSnapshotId(
  page: PageSnapshot,
  chunks: TextChunkSnapshot[],
): string {
  const fingerprint = JSON.stringify({
    page: [
      page.pageId,
      page.domain,
      page.resourceType ?? '',
      page.resourceId ?? '',
      page.titleHash,
      page.urlHash,
      page.language,
      page.totalWords,
      page.metricModelVersion ?? 1,
      page.capturedAt,
    ],
    chunks: chunks.map((chunk) => [
      chunk.chunkId,
      chunk.pageId,
      chunk.sectionId ?? '',
      chunk.textHash,
      chunk.sourceKey ?? '',
      chunk.wordCount,
      chunk.sentenceCount,
      chunk.selector,
    ]),
  });

  return `page_snapshot_${Math.trunc(page.capturedAt).toString(36)}_${hashText(fingerprint)}`;
}

export function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}

export function hashText(value: string): string {
  let hash = 2_166_136_261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  return (hash >>> 0).toString(36);
}

function normalizeUrlForHashing(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return url;
  }
}
