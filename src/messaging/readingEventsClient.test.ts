import { describe, expect, it, vi } from 'vitest';

import { analyzeEnglishText } from '../analysis/english';
import {
  createChunkId,
  createPageId,
  hashText,
} from '../domain/events';
import {
  MESSAGE_TYPES,
  type ReadingEventBatchPayload,
} from './contracts';
import {
  createReadingEventBatchDelivery,
  type ReadingEventsRuntime,
} from './readingEventsClient';

function createPayload(
  eventId = 'PageVisible_event-1',
  eventKind: ReadingEventBatchPayload['events'][number]['kind'] = 'PageVisible',
): ReadingEventBatchPayload {
  const url = 'https://docs.example.com/protocol';
  const pageId = createPageId(url);
  const text = 'Snapshot registration prevents repeated full page text delivery across reading event flushes.';
  const analysis = analyzeEnglishText(text);
  const chunkId = createChunkId(pageId, text);

  return {
    page: {
      pageId,
      domain: 'docs.example.com',
      titleHash: hashText('Protocol'),
      urlHash: hashText(url),
      language: 'en',
      totalWords: analysis.wordCount,
      capturedAt: 1_000,
    },
    chunks: [{
      chunkId,
      pageId,
      textHash: hashText(text),
      text,
      wordCount: analysis.wordCount,
      sentenceCount: analysis.sentenceCount,
      selector: 'article > p',
    }],
    events: [{
      id: eventId,
      sessionId: 'session_protocol',
      pageId,
      kind: eventKind,
      occurredAt: 2_000,
      confidence: 'medium',
    }],
  };
}

function createRuntime(...responses: unknown[]): {
  runtime: ReadingEventsRuntime;
  sendMessage: ReturnType<typeof vi.fn>;
} {
  const sendMessage = vi.fn();
  for (const response of responses) {
    sendMessage.mockResolvedValueOnce(response);
  }
  return {
    runtime: { sendMessage },
    sendMessage,
  };
}

describe('createReadingEventBatchDelivery', () => {
  it('registers web text once and sends later batches by snapshot reference', async () => {
    const payload = createPayload();
    const secondPayload = {
      ...payload,
      events: [{
        ...payload.events[0],
        id: 'PageHidden_event-2',
        kind: 'PageHidden' as const,
        occurredAt: 3_000,
      }],
    };
    const { runtime, sendMessage } = createRuntime({ ok: true }, { ok: true });
    const deliver = createReadingEventBatchDelivery(runtime);

    await expect(deliver(payload)).resolves.toBe(true);
    await expect(deliver(secondPayload)).resolves.toBe(true);

    expect(sendMessage).toHaveBeenCalledTimes(2);
    const registration = sendMessage.mock.calls[0][0];
    const reference = sendMessage.mock.calls[1][0];
    expect(registration).toEqual(expect.objectContaining({
      type: MESSAGE_TYPES.readingPageSnapshotRegister,
      payload: expect.objectContaining({
        page: payload.page,
        chunks: payload.chunks,
        events: payload.events,
        snapshotId: expect.stringMatching(/^page_snapshot_/),
      }),
    }));
    expect(reference).toEqual({
      type: MESSAGE_TYPES.readingEventsReferenceBatch,
      payload: {
        snapshotId: registration.payload.snapshotId,
        events: secondPayload.events,
      },
    });
    expect(reference.payload).not.toHaveProperty('page');
    expect(reference.payload).not.toHaveProperty('chunks');
    expect(JSON.stringify(reference)).not.toContain(payload.chunks[0].text);
  });

  it('re-registers the same snapshot when the background cache was restarted', async () => {
    const payload = createPayload();
    const { runtime, sendMessage } = createRuntime(
      { ok: true },
      { ok: false, reason: 'snapshot-missing' },
      { ok: true },
    );
    const deliver = createReadingEventBatchDelivery(runtime);

    await expect(deliver(payload)).resolves.toBe(true);
    await expect(deliver({
      ...payload,
      events: [{
        ...payload.events[0],
        id: 'PageHidden_event-2',
        kind: 'PageHidden',
        occurredAt: 3_000,
      }],
    })).resolves.toBe(true);

    expect(sendMessage.mock.calls.map((call) => call[0].type)).toEqual([
      MESSAGE_TYPES.readingPageSnapshotRegister,
      MESSAGE_TYPES.readingEventsReferenceBatch,
      MESSAGE_TYPES.readingPageSnapshotRegister,
    ]);
  });

  it('retries a failed first write by reference after the snapshot was accepted', async () => {
    const payload = createPayload();
    const { runtime, sendMessage } = createRuntime(
      { ok: false, snapshotRegistered: true },
      { ok: true },
    );
    const deliver = createReadingEventBatchDelivery(runtime);

    await expect(deliver(payload)).resolves.toBe(false);
    await expect(deliver(payload)).resolves.toBe(true);

    expect(sendMessage.mock.calls.map((call) => call[0].type)).toEqual([
      MESSAGE_TYPES.readingPageSnapshotRegister,
      MESSAGE_TYPES.readingEventsReferenceBatch,
    ]);
  });

  it('suppresses later sends when the background rejects the snapshot authorization', async () => {
    const payload = createPayload();
    const { runtime, sendMessage } = createRuntime({ ok: true, accepted: false });
    const deliver = createReadingEventBatchDelivery(runtime);

    await expect(deliver(payload)).resolves.toBe(true);
    await expect(deliver(payload)).resolves.toBe(true);

    expect(sendMessage).toHaveBeenCalledOnce();
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: MESSAGE_TYPES.readingPageSnapshotRegister,
    }));
  });

  it('keeps PDF delivery on the existing sparse full-batch protocol', async () => {
    const payload = createPayload();
    payload.page.resourceType = 'pdf';
    payload.page.resourceId = 'pdf_protocol';
    payload.chunks[0].sectionId = 'pdf_protocol_page_1';
    const { runtime, sendMessage } = createRuntime({ ok: true });
    const deliver = createReadingEventBatchDelivery(runtime);

    await expect(deliver(payload)).resolves.toBe(true);
    expect(sendMessage).toHaveBeenCalledWith({
      type: MESSAGE_TYPES.readingEventsBatch,
      payload,
    });
  });
});
