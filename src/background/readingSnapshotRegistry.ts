import type {
  PageSnapshot,
  TextChunkSnapshot,
} from '../domain/events';
import type { ReadingMessageSender } from './readingAccess';

const DEFAULT_MAX_SNAPSHOTS = 32;
const DEFAULT_SNAPSHOT_TTL_MS = 30 * 60_000;

export interface RegisteredReadingPageSnapshot {
  page: PageSnapshot;
  chunks: TextChunkSnapshot[];
}

export interface ReadingPageSnapshotRegistry {
  register: (
    snapshotId: string,
    snapshot: RegisteredReadingPageSnapshot,
    sender: ReadingMessageSender | undefined,
  ) => boolean;
  resolve: (
    snapshotId: string,
    sender: ReadingMessageSender | undefined,
  ) => RegisteredReadingPageSnapshot | undefined;
}

interface StoredReadingPageSnapshot {
  snapshot: RegisteredReadingPageSnapshot;
  lastAccessedAt: number;
}

export interface InMemoryReadingPageSnapshotRegistryOptions {
  maxSnapshots?: number;
  snapshotTtlMs?: number;
  now?: () => number;
}

export class InMemoryReadingPageSnapshotRegistry implements ReadingPageSnapshotRegistry {
  private readonly entries = new Map<string, StoredReadingPageSnapshot>();
  private readonly maxSnapshots: number;
  private readonly snapshotTtlMs: number;
  private readonly now: () => number;

  constructor({
    maxSnapshots = DEFAULT_MAX_SNAPSHOTS,
    snapshotTtlMs = DEFAULT_SNAPSHOT_TTL_MS,
    now = Date.now,
  }: InMemoryReadingPageSnapshotRegistryOptions = {}) {
    this.maxSnapshots = Math.max(1, Math.trunc(maxSnapshots));
    this.snapshotTtlMs = Math.max(1, Math.trunc(snapshotTtlMs));
    this.now = now;
  }

  register(
    snapshotId: string,
    snapshot: RegisteredReadingPageSnapshot,
    sender: ReadingMessageSender | undefined,
  ): boolean {
    const key = createRegistryKey(snapshotId, sender);
    if (!key) {
      return false;
    }

    const now = this.now();
    this.pruneExpired(now);
    this.entries.delete(key);
    while (this.entries.size >= this.maxSnapshots) {
      const oldestKey = this.entries.keys().next().value;
      if (typeof oldestKey !== 'string') {
        break;
      }
      this.entries.delete(oldestKey);
    }
    this.entries.set(key, {
      snapshot,
      lastAccessedAt: now,
    });
    return true;
  }

  resolve(
    snapshotId: string,
    sender: ReadingMessageSender | undefined,
  ): RegisteredReadingPageSnapshot | undefined {
    const key = createRegistryKey(snapshotId, sender);
    if (!key) {
      return undefined;
    }

    const now = this.now();
    this.pruneExpired(now);
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }

    entry.lastAccessedAt = now;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.snapshot;
  }

  private pruneExpired(now: number): void {
    for (const [key, entry] of this.entries) {
      if (now - entry.lastAccessedAt >= this.snapshotTtlMs) {
        this.entries.delete(key);
      }
    }
  }
}

export const readingPageSnapshotRegistry = new InMemoryReadingPageSnapshotRegistry();

function createRegistryKey(
  snapshotId: string,
  sender: ReadingMessageSender | undefined,
): string | undefined {
  const scope = createReadingSenderScope(sender);
  return scope ? `${scope}\u0000${snapshotId}` : undefined;
}

export function createReadingSenderScope(
  sender: ReadingMessageSender | undefined,
): string | undefined {
  if (sender?.documentId) {
    return `document:${sender.documentId}`;
  }

  const frameId = Number.isInteger(sender?.frameId) ? sender?.frameId : 0;
  if (Number.isInteger(sender?.tab?.id)) {
    return `tab:${sender?.tab?.id}:frame:${frameId}`;
  }

  const senderUrl = sender?.url ?? sender?.tab?.url;
  if (!senderUrl) {
    return undefined;
  }

  try {
    const parsed = new URL(senderUrl);
    const origin = parsed.origin === 'null'
      ? `${parsed.protocol}//${parsed.host}`
      : parsed.origin;
    return `origin:${origin}:frame:${frameId}`;
  } catch {
    return undefined;
  }
}
