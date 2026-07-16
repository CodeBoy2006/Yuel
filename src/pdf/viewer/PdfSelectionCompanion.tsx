import {
  Languages,
  LoaderCircle,
  RotateCcw,
  Square,
  Volume2,
  X,
} from 'lucide-react';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';

import {
  canSpeakPdfCompanionText,
  PDF_COMPANION_MAX_TEXT_LENGTH,
  startPdfCompanionSpeech,
  type PdfCompanionSpeechHandle,
  type PdfCompanionTranslationSnapshot,
  type PdfCompanionTranslationTask,
} from '../companion/localCompanion';

const COMPANION_VIEWPORT_MARGIN = 10;
const COMPANION_MENU_OFFSET = 54;
const COMPANION_PREFERRED_HEIGHT = 286;

interface PdfSelectionCompanionPlacement {
  spaceAbove?: number;
  spaceBelow?: number;
}

export interface PdfSelectionCompanionServices {
  canSpeak: typeof canSpeakPdfCompanionText;
  startSpeech: typeof startPdfCompanionSpeech;
}

const defaultServices: PdfSelectionCompanionServices = {
  canSpeak: canSpeakPdfCompanionText,
  startSpeech: startPdfCompanionSpeech,
};

export function PdfSelectionCompanion({
  onClose,
  onRetry,
  pageNumber,
  placement,
  rectHeight,
  services = defaultServices,
  task,
  text,
}: {
  onClose: () => void;
  onRetry: () => void;
  pageNumber: number;
  placement: PdfSelectionCompanionPlacement;
  rectHeight: number;
  services?: PdfSelectionCompanionServices;
  task: PdfCompanionTranslationTask;
  text: string;
}) {
  const snapshot = useSyncExternalStore(
    task.subscribe,
    task.getSnapshot,
    task.getSnapshot,
  );
  const panelRef = useRef<HTMLElement>(null);
  const speechHandleRef = useRef<PdfCompanionSpeechHandle | undefined>(undefined);
  const [horizontalShift, setHorizontalShift] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [speechFailed, setSpeechFailed] = useState(false);
  const speechSupported = services.canSpeak();
  const panelSide = choosePanelSide(placement);
  const spaceAbove = placement.spaceAbove ?? 0;
  const spaceBelow = placement.spaceBelow ?? 0;
  const availableSpace = panelSide === 'above'
    ? spaceAbove
    : spaceBelow;
  const maxHeight = Math.max(
    128,
    Math.min(COMPANION_PREFERRED_HEIGHT, availableSpace - COMPANION_MENU_OFFSET),
  );

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  useEffect(() => () => {
    task.cancel();
  }, [task]);

  useEffect(() => {
    setSpeechFailed(false);
    return () => {
      speechHandleRef.current?.stop();
      speechHandleRef.current = undefined;
    };
  }, [text]);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const correctOverflow = () => {
      const bounds = panel.getBoundingClientRect();
      const pageBounds = panel
        .closest('.pdf-reader__page-layers')
        ?.getBoundingClientRect();
      const leftLimit = Math.max(
        COMPANION_VIEWPORT_MARGIN,
        (pageBounds?.left ?? 0) + COMPANION_VIEWPORT_MARGIN,
      );
      const rightLimit = Math.min(
        window.innerWidth - COMPANION_VIEWPORT_MARGIN,
        (pageBounds?.right ?? window.innerWidth) - COMPANION_VIEWPORT_MARGIN,
      );
      const leftOverflow = leftLimit - bounds.left;
      const rightOverflow = bounds.right
        - rightLimit;
      const correction = leftOverflow > 0
        ? leftOverflow
        : rightOverflow > 0
          ? -rightOverflow
          : 0;
      if (Math.abs(correction) >= 0.5) {
        setHorizontalShift((current) => Math.round(current + correction));
      }
    };

    correctOverflow();
    window.addEventListener('resize', correctOverflow);
    return () => window.removeEventListener('resize', correctOverflow);
  }, [snapshot, text]);

  const toggleSpeech = () => {
    if (speaking) {
      speechHandleRef.current?.stop();
      speechHandleRef.current = undefined;
      setSpeaking(false);
      return;
    }

    setSpeechFailed(false);
    setSpeaking(true);
    const handle = services.startSpeech(text, {
      onStart: () => setSpeaking(true),
      onEnd: () => {
        speechHandleRef.current = undefined;
        setSpeaking(false);
      },
      onError: () => {
        speechHandleRef.current = undefined;
        setSpeaking(false);
        setSpeechFailed(true);
      },
    });
    speechHandleRef.current = handle;
    if (!handle) setSpeaking(false);
  };

  const close = () => {
    speechHandleRef.current?.stop();
    speechHandleRef.current = undefined;
    onClose();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    close();
  };
  const panelStyle = {
    '--pdf-companion-shift-x': `${horizontalShift}px`,
    maxHeight,
    ...(panelSide === 'above'
      ? { bottom: COMPANION_MENU_OFFSET }
      : { top: rectHeight + COMPANION_MENU_OFFSET }),
  } as CSSProperties & { '--pdf-companion-shift-x': string };

  return (
    <section
      ref={panelRef}
      id="pdf-reader-selection-companion"
      className="pdf-reader__selection-companion"
      role="dialog"
      aria-labelledby="pdf-reader-selection-companion-title"
      data-pdf-reader-shortcuts-disabled=""
      data-side={panelSide}
      style={panelStyle}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      <header>
        <span className="pdf-reader__selection-companion-mark" aria-hidden="true">
          <Languages />
        </span>
        <div>
          <h2 id="pdf-reader-selection-companion-title">划词伴读</h2>
          <p>第 {pageNumber} 页 · 选区不保存</p>
        </div>
        <button
          type="button"
          data-no-interaction
          aria-label="关闭划词伴读"
          title="关闭"
          onClick={close}
        >
          <X aria-hidden="true" />
        </button>
      </header>

      <blockquote lang="en">“{text}”</blockquote>

      <div className="pdf-reader__selection-companion-actions">
        <button
          type="button"
          data-no-interaction
          aria-label={speaking ? '停止朗读英文' : '朗读所选英文'}
          aria-pressed={speaking}
          disabled={!speechSupported}
          title={speechSupported ? undefined : '当前浏览器没有可用的语音朗读'}
          onClick={toggleSpeech}
        >
          {speaking
            ? <Square aria-hidden="true" />
            : <Volume2 aria-hidden="true" />}
          {speaking ? '停止' : '朗读英文'}
        </button>
        {speechFailed ? (
          <span role="alert">朗读暂时不可用。</span>
        ) : null}
      </div>

      <div
        className="pdf-reader__selection-companion-translation"
        aria-label="中文翻译"
      >
        <div className="pdf-reader__selection-companion-section-label">
          <span>中文翻译</span>
          {snapshot.status === 'ready' ? <span>本地</span> : null}
        </div>
        <TranslationContent
          onRetry={onRetry}
          snapshot={snapshot}
        />
      </div>
    </section>
  );
}

function TranslationContent({
  onRetry,
  snapshot,
}: {
  onRetry: () => void;
  snapshot: PdfCompanionTranslationSnapshot;
}) {
  if (snapshot.status === 'preparing' || snapshot.status === 'translating') {
    return (
      <div
        className="pdf-reader__selection-companion-status"
        role="status"
        aria-live="polite"
      >
        <LoaderCircle className="is-spinning" aria-hidden="true" />
        <span>
          {snapshot.status === 'preparing'
            ? '准备本地翻译'
            : '正在翻译'}
        </span>
      </div>
    );
  }

  if (snapshot.status === 'downloading') {
    const percentage = Math.round((snapshot.progress ?? 0) * 100);
    return (
      <div
        className="pdf-reader__selection-companion-download"
        role="status"
        aria-live="polite"
      >
        <div>
          <span>准备本地翻译</span>
          <strong>{percentage}%</strong>
        </div>
        <progress
          max={100}
          value={percentage}
          aria-label="本地翻译模型下载进度"
        />
      </div>
    );
  }

  if (snapshot.status === 'ready') {
    return (
      <p
        className="pdf-reader__selection-companion-result"
        lang="zh-CN"
        role="status"
        aria-live="polite"
      >
        {snapshot.translatedText}
      </p>
    );
  }

  if (snapshot.status === 'failed') {
    return (
      <div
        className="pdf-reader__selection-companion-fallback"
        role="alert"
      >
        <p>翻译暂时失败，英文朗读仍可使用。</p>
        <button
          type="button"
          data-no-interaction
          onClick={onRetry}
        >
          <RotateCcw aria-hidden="true" />
          重试翻译
        </button>
      </div>
    );
  }

  return (
    <p
      className="pdf-reader__selection-companion-fallback"
      role="status"
      aria-live="polite"
    >
      {createUnavailableMessage(snapshot)}
    </p>
  );
}

function createUnavailableMessage(
  snapshot: PdfCompanionTranslationSnapshot,
): string {
  if (snapshot.reason === 'too-long') {
    return `选区过长，请缩短至 ${PDF_COMPANION_MAX_TEXT_LENGTH} 个字符以内。`;
  }
  if (snapshot.reason === 'not-english') {
    return '当前选区不像英文，暂不翻译。';
  }
  if (snapshot.reason === 'empty') {
    return '没有可供伴读的文本。';
  }
  return '当前 Chrome 未提供本地英中翻译，英文朗读仍可使用。';
}

function choosePanelSide(
  placement: PdfSelectionCompanionPlacement,
): 'above' | 'below' {
  const spaceAbove = placement.spaceAbove ?? 0;
  const spaceBelow = placement.spaceBelow ?? 0;
  if (spaceBelow >= COMPANION_PREFERRED_HEIGHT + COMPANION_MENU_OFFSET) {
    return 'below';
  }
  return spaceAbove > spaceBelow ? 'above' : 'below';
}
