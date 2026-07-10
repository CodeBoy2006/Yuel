import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CdpClient } from '../../smoke/browserLoadedSmoke';

class FakeWebSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static latest: FakeWebSocket | undefined;

  readonly sentMessages: string[] = [];
  readyState = FakeWebSocket.CONNECTING;

  constructor(readonly url: string) {
    super();
    FakeWebSocket.latest = this;
    queueMicrotask(() => {
      this.readyState = FakeWebSocket.OPEN;
      this.dispatchEvent(new Event('open'));
    });
  }

  send(data: string): void {
    this.sentMessages.push(data);
  }

  close(): void {
    if (this.readyState === FakeWebSocket.CLOSED) return;
    this.readyState = FakeWebSocket.CLOSED;
    this.dispatchEvent(new Event('close'));
  }

  respond(id: number, result: unknown): void {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ id, result }) }));
  }

  fail(): void {
    this.dispatchEvent(new Event('error'));
  }

  disconnect(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.dispatchEvent(new Event('close'));
  }
}

describe('browser smoke CDP client', () => {
  beforeEach(() => {
    FakeWebSocket.latest = undefined;
    vi.stubGlobal('WebSocket', FakeWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('times out a command that never receives a CDP response', async () => {
    const client = await CdpClient.connect('ws://cdp.test', 1_000);

    await expect(client.send('Runtime.neverResponds', undefined, undefined, 10)).rejects.toThrow(
      'Chrome DevTools Protocol command timed out after 10ms: Runtime.neverResponds',
    );
    client.close();
  });

  it('resolves a command response and clears its pending timeout', async () => {
    const client = await CdpClient.connect('ws://cdp.test', 1_000);
    const socket = FakeWebSocket.latest!;
    const response = client.send<{ ok: boolean }>('Runtime.responds', undefined, undefined, 20);
    const { id } = JSON.parse(socket.sentMessages[0]) as { id: number };

    socket.respond(id, { ok: true });

    await expect(response).resolves.toEqual({ ok: true });
    client.close();
  });

  it('rejects every pending command when the socket errors', async () => {
    const client = await CdpClient.connect('ws://cdp.test', 1_000);
    const first = client.send('Runtime.first', undefined, undefined, 1_000);
    const second = client.send('Runtime.second', undefined, undefined, 1_000);
    const firstResult = expect(first).rejects.toThrow('Chrome DevTools Protocol connection failed');
    const secondResult = expect(second).rejects.toThrow('Chrome DevTools Protocol connection failed');

    FakeWebSocket.latest!.fail();

    await Promise.all([firstResult, secondResult]);
    client.close();
  });

  it('rejects pending commands when the socket closes', async () => {
    const client = await CdpClient.connect('ws://cdp.test', 1_000);
    const pending = client.send('Runtime.pending', undefined, undefined, 1_000);
    const result = expect(pending).rejects.toThrow('Chrome DevTools Protocol connection closed');

    FakeWebSocket.latest!.disconnect();

    await result;
  });
});
