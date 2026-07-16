import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  destroyPdfCompanionTranslator,
  normalizePdfCompanionText,
  PDF_COMPANION_MAX_TEXT_LENGTH,
  startPdfCompanionSpeech,
  startPdfCompanionTranslation,
  type PdfCompanionTranslationSnapshot,
  type PdfCompanionTranslationTask,
} from './localCompanion';

afterEach(() => {
  destroyPdfCompanionTranslator();
});

describe('PDF selection companion translation', () => {
  it('normalizes transient selection text without persisting it', () => {
    expect(normalizePdfCompanionText('  Local\n PDFium   rendering  '))
      .toBe('Local PDFium rendering');
  });

  it('rejects empty, overly long, and non-English selections before creating a translator', () => {
    expect(startPdfCompanionTranslation('   ').getSnapshot()).toEqual({
      status: 'invalid',
      reason: 'empty',
    });
    expect(startPdfCompanionTranslation(
      'a'.repeat(PDF_COMPANION_MAX_TEXT_LENGTH + 1),
    ).getSnapshot()).toEqual({
      status: 'invalid',
      reason: 'too-long',
    });
    expect(startPdfCompanionTranslation('这是中文选区。').getSnapshot()).toEqual({
      status: 'invalid',
      reason: 'not-english',
    });
  });

  it('reports an unavailable state when Chrome does not expose Translator', () => {
    expect(startPdfCompanionTranslation('Local PDF rendering', {
      runtime: {},
    }).getSnapshot()).toEqual({
      status: 'unavailable',
      reason: 'unsupported',
    });
  });

  it('distinguishes an unavailable language pair from a transient failure', async () => {
    const task = startPdfCompanionTranslation('Unsupported language pair', {
      runtime: {
        Translator: {
          availability: async () => 'unavailable',
          create: vi.fn(async () => {
            throw new Error('Unsupported pair');
          }),
        },
      },
    });

    await expectTaskStatus(task, 'unavailable');
    expect(task.getSnapshot()).toEqual({
      status: 'unavailable',
      reason: 'unsupported',
    });
  });

  it('starts Translator.create synchronously and publishes the translated text', async () => {
    const translate = vi.fn(async (text: string) => `译文：${text}`);
    const create = vi.fn(() => Promise.resolve({
      translate,
      destroy: vi.fn(),
    }));

    const task = startPdfCompanionTranslation('Local PDF rendering', {
      runtime: {
        Translator: { create },
      },
    });

    expect(create).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      sourceLanguage: 'en',
      targetLanguage: 'zh',
    }));
    await expectTaskStatus(task, 'ready');
    expect(translate).toHaveBeenCalledWith(
      'Local PDF rendering',
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
    expect(task.getSnapshot()).toEqual({
      status: 'ready',
      translatedText: '译文：Local PDF rendering',
    });
  });

  it('ignores an availability probe failure when translation still succeeds', async () => {
    const task = startPdfCompanionTranslation('Translate despite probe failure', {
      runtime: {
        Translator: {
          availability: async () => {
            throw new Error('Capability probe failed');
          },
          create: async () => ({
            translate: async () => '能力探测失败后仍完成翻译',
            destroy: vi.fn(),
          }),
        },
      },
    });

    await expectTaskStatus(task, 'ready');
    expect(task.getSnapshot().translatedText).toBe('能力探测失败后仍完成翻译');
  });

  it('publishes bounded model download progress before translation', async () => {
    let reportDownload: ((event: Event & { loaded: number }) => void) | undefined;
    let resolveTranslator: ((translator: {
      translate: (text: string) => Promise<string>;
      destroy: () => void;
    }) => void) | undefined;
    const creation = new Promise<{
      translate: (text: string) => Promise<string>;
      destroy: () => void;
    }>((resolve) => {
      resolveTranslator = resolve;
    });
    const task = startPdfCompanionTranslation('Download a local model', {
      runtime: {
        Translator: {
          create: vi.fn((options) => {
            options.monitor?.({
              addEventListener: (
                _type: 'downloadprogress',
                listener: (event: Event & { loaded: number }) => void,
              ) => {
                reportDownload = listener;
              },
            });
            return creation;
          }),
        },
      },
    });

    reportDownload?.(Object.assign(new Event('downloadprogress'), {
      loaded: 1.4,
    }));
    expect(task.getSnapshot()).toEqual({
      status: 'downloading',
      progress: 1,
    });

    resolveTranslator?.({
      translate: async () => '下载本地模型',
      destroy: vi.fn(),
    });
    await expectTaskStatus(task, 'ready');
  });

  it('reuses one translator for consecutive selections', async () => {
    const create = vi.fn(() => Promise.resolve({
      translate: async (text: string) => `译文：${text}`,
      destroy: vi.fn(),
    }));
    const runtime = {
      Translator: { create },
    };

    const first = startPdfCompanionTranslation('First selection', { runtime });
    await expectTaskStatus(first, 'ready');
    const second = startPdfCompanionTranslation('Second selection', { runtime });
    await expectTaskStatus(second, 'ready');

    expect(create).toHaveBeenCalledOnce();
    expect(second.getSnapshot().translatedText).toBe('译文：Second selection');
  });

  it('cancels stale work without publishing a failure', async () => {
    let creationSignal: AbortSignal | undefined;
    const task = startPdfCompanionTranslation('Cancel this selection', {
      runtime: {
        Translator: {
          create: vi.fn((options) => {
            creationSignal = options.signal;
            return new Promise<{
              translate: (text: string) => Promise<string>;
              destroy: () => void;
            }>(() => undefined);
          }),
        },
      },
    });
    const initial = task.getSnapshot();

    task.cancel();
    await Promise.resolve();

    expect(creationSignal?.aborted).toBe(true);
    expect(task.getSnapshot()).toBe(initial);
  });

  it('starts a fresh translator after a cancelled initialization', async () => {
    let firstReject: ((error: Error) => void) | undefined;
    const create = vi.fn((options: { signal?: AbortSignal }) => {
      if (create.mock.calls.length === 1) {
        return new Promise<{
          translate: (text: string) => Promise<string>;
          destroy: () => void;
        }>((_resolve, reject) => {
          firstReject = reject;
          options.signal?.addEventListener('abort', () => {
            firstReject?.(new DOMException('Cancelled', 'AbortError'));
          }, { once: true });
        });
      }
      return Promise.resolve({
        translate: async () => '第二次翻译成功',
        destroy: vi.fn(),
      });
    });
    const runtime = {
      Translator: { create },
    };
    const first = startPdfCompanionTranslation('First selection', { runtime });

    first.cancel();
    const second = startPdfCompanionTranslation('Second selection', { runtime });

    await expectTaskStatus(second, 'ready');
    expect(create).toHaveBeenCalledTimes(2);
    expect(second.getSnapshot().translatedText).toBe('第二次翻译成功');
  });
});

describe('PDF selection companion speech', () => {
  it('prefers a local English voice and restores state when stopped', () => {
    const localVoice = createVoice('Local English', 'en-US', true);
    const remoteVoice = createVoice('Remote English', 'en-GB', false);
    let spokenUtterance: SpeechSynthesisUtterance | undefined;
    const onStart = vi.fn();
    const onEnd = vi.fn();
    const onError = vi.fn();
    const cancel = vi.fn();

    const handle = startPdfCompanionSpeech('  Read this aloud. ', {
      onStart,
      onEnd,
      onError,
    }, {
      SpeechSynthesisUtterance: FakeSpeechSynthesisUtterance as unknown as
        typeof SpeechSynthesisUtterance,
      speechSynthesis: {
        cancel,
        getVoices: () => [remoteVoice, localVoice],
        speak: (utterance) => {
          spokenUtterance = utterance;
          utterance.onstart?.(new Event('start') as SpeechSynthesisEvent);
        },
      },
    });

    expect(spokenUtterance?.text).toBe('Read this aloud.');
    expect(spokenUtterance?.lang).toBe('en-US');
    expect(spokenUtterance?.rate).toBe(0.92);
    expect(spokenUtterance?.voice).toBe(localVoice);
    expect(onStart).toHaveBeenCalledOnce();

    handle?.stop();
    expect(cancel).toHaveBeenCalledTimes(2);
    expect(onEnd).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });

  it('reports unsupported speech without throwing', () => {
    const onError = vi.fn();

    expect(startPdfCompanionSpeech('Read this.', { onError }, {})).toBeUndefined();
    expect(onError).toHaveBeenCalledOnce();
  });

  it('ignores a late speech start event after the utterance was stopped', () => {
    let spokenUtterance: SpeechSynthesisUtterance | undefined;
    const onStart = vi.fn();
    const handle = startPdfCompanionSpeech('Stop before start.', { onStart }, {
      SpeechSynthesisUtterance: FakeSpeechSynthesisUtterance as unknown as
        typeof SpeechSynthesisUtterance,
      speechSynthesis: {
        cancel: vi.fn(),
        getVoices: () => [],
        speak: (utterance) => {
          spokenUtterance = utterance;
        },
      },
    });

    handle?.stop();
    spokenUtterance?.onstart?.(new Event('start') as SpeechSynthesisEvent);

    expect(onStart).not.toHaveBeenCalled();
  });
});

async function expectTaskStatus(
  task: PdfCompanionTranslationTask,
  expected: PdfCompanionTranslationSnapshot['status'],
): Promise<void> {
  if (task.getSnapshot().status === expected) return;

  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      unsubscribe();
      reject(new Error(`Timed out waiting for translation status ${expected}`));
    }, 1_000);
    const unsubscribe = task.subscribe(() => {
      if (task.getSnapshot().status !== expected) return;
      window.clearTimeout(timeout);
      unsubscribe();
      resolve();
    });
  });
}

function createVoice(
  name: string,
  lang: string,
  localService: boolean,
): SpeechSynthesisVoice {
  return {
    default: false,
    lang,
    localService,
    name,
    voiceURI: name,
  };
}

class FakeSpeechSynthesisUtterance {
  lang = '';
  onboundary: ((this: SpeechSynthesisUtterance, ev: SpeechSynthesisEvent) => unknown) | null = null;
  onend: ((this: SpeechSynthesisUtterance, ev: SpeechSynthesisEvent) => unknown) | null = null;
  onerror: ((this: SpeechSynthesisUtterance, ev: SpeechSynthesisErrorEvent) => unknown) | null = null;
  onmark: ((this: SpeechSynthesisUtterance, ev: SpeechSynthesisEvent) => unknown) | null = null;
  onpause: ((this: SpeechSynthesisUtterance, ev: SpeechSynthesisEvent) => unknown) | null = null;
  onresume: ((this: SpeechSynthesisUtterance, ev: SpeechSynthesisEvent) => unknown) | null = null;
  onstart: ((this: SpeechSynthesisUtterance, ev: SpeechSynthesisEvent) => unknown) | null = null;
  pitch = 1;
  rate = 1;
  text: string;
  voice: SpeechSynthesisVoice | null = null;
  volume = 1;

  constructor(text = '') {
    this.text = text;
  }
}
