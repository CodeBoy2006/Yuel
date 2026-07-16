export const PDF_COMPANION_MAX_TEXT_LENGTH = 1_200;

const PDF_COMPANION_SOURCE_LANGUAGE = 'en';
const PDF_COMPANION_TARGET_LANGUAGE = 'zh';

export type PdfCompanionTranslationStatus =
  | 'preparing'
  | 'downloading'
  | 'translating'
  | 'ready'
  | 'unavailable'
  | 'invalid'
  | 'failed';

export type PdfCompanionTranslationReason =
  | 'unsupported'
  | 'not-english'
  | 'too-long'
  | 'empty'
  | 'failed';

export interface PdfCompanionTranslationSnapshot {
  status: PdfCompanionTranslationStatus;
  progress?: number;
  translatedText?: string;
  reason?: PdfCompanionTranslationReason;
}

export interface PdfCompanionTranslationTask {
  getSnapshot: () => PdfCompanionTranslationSnapshot;
  subscribe: (listener: () => void) => () => void;
  cancel: () => void;
}

interface BrowserTranslator {
  translate: (
    text: string,
    options?: { signal?: AbortSignal },
  ) => Promise<string>;
  destroy: () => void;
}

interface TranslatorDownloadMonitor {
  addEventListener: (
    type: 'downloadprogress',
    listener: (event: Event & { loaded: number }) => void,
  ) => void;
}

interface BrowserTranslatorConstructor {
  availability?: (options: {
    sourceLanguage: string;
    targetLanguage: string;
  }) => Promise<'unavailable' | 'downloadable' | 'downloading' | 'available'>;
  create: (options: {
    sourceLanguage: string;
    targetLanguage: string;
    signal?: AbortSignal;
    monitor?: (monitor: TranslatorDownloadMonitor) => void;
  }) => Promise<BrowserTranslator>;
}

export interface PdfCompanionTranslationRuntime {
  Translator?: BrowserTranslatorConstructor;
}

export interface PdfCompanionTranslationOptions {
  runtime?: PdfCompanionTranslationRuntime;
}

interface PdfCompanionSpeechSynthesis {
  cancel: () => void;
  getVoices: () => SpeechSynthesisVoice[];
  speak: (utterance: SpeechSynthesisUtterance) => void;
}

interface PdfCompanionSpeechUtteranceConstructor {
  new(text?: string): SpeechSynthesisUtterance;
}

export interface PdfCompanionSpeechRuntime {
  speechSynthesis?: PdfCompanionSpeechSynthesis;
  SpeechSynthesisUtterance?: PdfCompanionSpeechUtteranceConstructor;
}

export interface PdfCompanionSpeechCallbacks {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: () => void;
}

export interface PdfCompanionSpeechHandle {
  stop: () => void;
}

let cachedTranslator: BrowserTranslator | undefined;
let cachedTranslatorConstructor: BrowserTranslatorConstructor | undefined;
let translatorCacheEpoch = 0;

export function normalizePdfCompanionText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function startPdfCompanionTranslation(
  text: string,
  options: PdfCompanionTranslationOptions = {},
): PdfCompanionTranslationTask {
  const normalizedText = normalizePdfCompanionText(text);
  const validationReason = validatePdfCompanionText(normalizedText);
  if (validationReason) {
    return createSettledTranslationTask({
      status: 'invalid',
      reason: validationReason,
    });
  }

  const runtime = options.runtime ?? getDefaultTranslationRuntime();
  const Translator = runtime.Translator;
  if (!Translator) {
    return createSettledTranslationTask({
      status: 'unavailable',
      reason: 'unsupported',
    });
  }

  const listeners = new Set<() => void>();
  const controller = new AbortController();
  let active = true;
  let snapshot: PdfCompanionTranslationSnapshot = {
    status: 'preparing',
  };
  const update = (next: PdfCompanionTranslationSnapshot) => {
    if (!active) return;
    snapshot = next;
    listeners.forEach((listener) => listener());
  };
  const availabilityPromise = getTranslatorAvailability(Translator);

  // Translator.create must be invoked in the original user-activation turn.
  const translatorPromise = getOrCreateTranslator(
    Translator,
    controller.signal,
    (progress) => update({
      status: 'downloading',
      progress,
    }),
  );

  void translatorPromise.then(async (translator) => {
    if (!active || controller.signal.aborted) return;
    update({ status: 'translating' });
    const translatedText = normalizePdfCompanionText(
      await translator.translate(normalizedText, {
        signal: controller.signal,
      }),
    );
    if (!translatedText) {
      throw new Error('The local translator returned an empty result.');
    }
    update({
      status: 'ready',
      translatedText,
    });
  }).catch(async (error: unknown) => {
    if (!active || controller.signal.aborted || isAbortError(error)) return;
    const availability = await availabilityPromise;
    if (!active || controller.signal.aborted) return;
    if (availability === 'unavailable') {
      update({
        status: 'unavailable',
        reason: 'unsupported',
      });
      return;
    }
    update({
      status: 'failed',
      reason: 'failed',
    });
  });

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    cancel() {
      if (!active) return;
      active = false;
      controller.abort();
      listeners.clear();
    },
  };
}

export function canSpeakPdfCompanionText(
  runtime: PdfCompanionSpeechRuntime = getDefaultSpeechRuntime(),
): boolean {
  return Boolean(
    runtime.speechSynthesis
    && runtime.SpeechSynthesisUtterance,
  );
}

export function startPdfCompanionSpeech(
  text: string,
  callbacks: PdfCompanionSpeechCallbacks = {},
  runtime: PdfCompanionSpeechRuntime = getDefaultSpeechRuntime(),
): PdfCompanionSpeechHandle | undefined {
  const normalizedText = normalizePdfCompanionText(text);
  const synthesis = runtime.speechSynthesis;
  const Utterance = runtime.SpeechSynthesisUtterance;
  if (!normalizedText || !synthesis || !Utterance) {
    callbacks.onError?.();
    return undefined;
  }

  const utterance = new Utterance(normalizedText);
  utterance.lang = 'en-US';
  utterance.rate = 0.92;
  utterance.pitch = 1;
  utterance.voice = chooseEnglishVoice(synthesis.getVoices());

  let active = true;
  const end = () => {
    if (!active) return;
    active = false;
    callbacks.onEnd?.();
  };
  const fail = () => {
    if (!active) return;
    active = false;
    callbacks.onError?.();
  };
  utterance.onstart = () => {
    if (!active) return;
    callbacks.onStart?.();
  };
  utterance.onend = end;
  utterance.onerror = fail;

  try {
    synthesis.cancel();
    synthesis.speak(utterance);
  } catch {
    fail();
    return undefined;
  }

  return {
    stop() {
      if (!active) return;
      active = false;
      synthesis.cancel();
      callbacks.onEnd?.();
    },
  };
}

export function destroyPdfCompanionTranslator(): void {
  translatorCacheEpoch += 1;
  cachedTranslator?.destroy();
  cachedTranslator = undefined;
  cachedTranslatorConstructor = undefined;
}

function validatePdfCompanionText(
  text: string,
): PdfCompanionTranslationReason | undefined {
  if (!text) return 'empty';
  if (text.length > PDF_COMPANION_MAX_TEXT_LENGTH) return 'too-long';

  const latinLetterCount = countMatches(text, /[A-Za-z]/g);
  if (latinLetterCount === 0) return 'not-english';
  const cjkCharacterCount = countMatches(
    text,
    /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/g,
  );
  if (
    cjkCharacterCount > 0
    && latinLetterCount / (latinLetterCount + cjkCharacterCount) < 0.65
  ) {
    return 'not-english';
  }

  return undefined;
}

function createSettledTranslationTask(
  snapshot: PdfCompanionTranslationSnapshot,
): PdfCompanionTranslationTask {
  return {
    getSnapshot: () => snapshot,
    subscribe: () => () => undefined,
    cancel: () => undefined,
  };
}

function getOrCreateTranslator(
  Translator: BrowserTranslatorConstructor,
  signal: AbortSignal,
  onDownloadProgress: (progress: number) => void,
): Promise<BrowserTranslator> {
  if (
    cachedTranslator
    && cachedTranslatorConstructor === Translator
  ) {
    return Promise.resolve(cachedTranslator);
  }
  if (
    cachedTranslatorConstructor
    && cachedTranslatorConstructor !== Translator
  ) {
    destroyPdfCompanionTranslator();
  }
  cachedTranslatorConstructor = Translator;
  const cacheEpoch = translatorCacheEpoch;

  let creation: Promise<BrowserTranslator>;
  try {
    creation = Translator.create({
      sourceLanguage: PDF_COMPANION_SOURCE_LANGUAGE,
      targetLanguage: PDF_COMPANION_TARGET_LANGUAGE,
      signal,
      monitor(monitor) {
        monitor.addEventListener('downloadprogress', (event) => {
          onDownloadProgress(clampProgress(event.loaded));
        });
      },
    });
  } catch (error) {
    return Promise.reject(error);
  }

  return creation.then((translator) => {
    if (signal.aborted || cacheEpoch !== translatorCacheEpoch) {
      translator.destroy();
      throw new DOMException('Translation was canceled.', 'AbortError');
    }
    if (
      cachedTranslator
      && cachedTranslatorConstructor === Translator
    ) {
      translator.destroy();
      return cachedTranslator;
    }

    cachedTranslator = translator;
    cachedTranslatorConstructor = Translator;
    return translator;
  });
}

function getTranslatorAvailability(
  Translator: BrowserTranslatorConstructor,
): Promise<'unavailable' | 'downloadable' | 'downloading' | 'available' | undefined> {
  try {
    return Translator.availability?.({
      sourceLanguage: PDF_COMPANION_SOURCE_LANGUAGE,
      targetLanguage: PDF_COMPANION_TARGET_LANGUAGE,
    }).catch(() => undefined) ?? Promise.resolve(undefined);
  } catch {
    return Promise.resolve(undefined);
  }
}

function chooseEnglishVoice(
  voices: SpeechSynthesisVoice[],
): SpeechSynthesisVoice | null {
  const englishVoices = voices.filter((voice) =>
    voice.lang.toLocaleLowerCase().startsWith('en'));
  return englishVoices.find((voice) => voice.localService)
    ?? englishVoices[0]
    ?? null;
}

function getDefaultTranslationRuntime(): PdfCompanionTranslationRuntime {
  return globalThis as typeof globalThis & PdfCompanionTranslationRuntime;
}

function getDefaultSpeechRuntime(): PdfCompanionSpeechRuntime {
  return globalThis as typeof globalThis & PdfCompanionSpeechRuntime;
}

function clampProgress(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function countMatches(text: string, pattern: RegExp): number {
  return Array.from(text.matchAll(pattern)).length;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}
