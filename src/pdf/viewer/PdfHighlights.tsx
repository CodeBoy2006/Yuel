import {
  Highlighter,
  Check,
  Copy,
  Languages,
  LoaderCircle,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
} from 'react';
import type { FormEvent } from 'react';
import {
  useSelectionCapability,
} from '@embedpdf/plugin-selection/react';
import type {
  SelectionSelectionMenuProps,
} from '@embedpdf/plugin-selection/react';

import {
  type PdfStoredHighlight,
} from '../../storage/pdfAnnotations';
import {
  deleteSavedItem,
  MAX_SAVED_ITEM_NOTE_LENGTH,
  MAX_SAVED_ITEM_USER_TAG_LENGTH,
  MAX_SAVED_ITEM_USER_TAGS,
  savePdfSelectedTextItem,
  updatePdfHighlight,
} from '../../storage/saveItems';
import type { PdfHighlightColor } from '../../storage/schema';
import {
  startPdfCompanionTranslation,
  type PdfCompanionTranslationTask,
} from '../companion/localCompanion';
import type { PdfSourceMetadata } from '../source';
import { PdfSelectionCompanion } from './PdfSelectionCompanion';

const PDF_HIGHLIGHT_COLOR_OPTIONS = [
  { value: 'yellow', label: '黄色' },
  { value: 'green', label: '绿色' },
  { value: 'blue', label: '蓝色' },
  { value: 'rose', label: '玫红色' },
] as const satisfies ReadonlyArray<{
  value: PdfHighlightColor;
  label: string;
}>;

export function PdfSelectionMenu({
  documentId,
  context,
  menuWrapperProps,
  placement,
  rect,
  sourceMetadata,
}: SelectionSelectionMenuProps & {
  documentId: string;
  sourceMetadata?: PdfSourceMetadata;
}) {
  const { provides: selection } = useSelectionCapability();
  const [copied, setCopied] = useState(false);
  const [selectedText, setSelectedText] = useState<string>();
  const [selectedTextStatus, setSelectedTextStatus] = useState<
    'loading' | 'ready' | 'failed'
  >('loading');
  const [companion, setCompanion] = useState<{
    task: PdfCompanionTranslationTask;
    text: string;
  }>();
  const [highlightColor, setHighlightColor] = useState<PdfHighlightColor>('yellow');
  const [saveStatus, setSaveStatus] = useState<
    'idle' | 'saving' | 'saved' | 'failed'
  >('idle');
  const companionButtonRef = useRef<HTMLButtonElement>(null);
  const resetTimerRef = useRef<number | undefined>(undefined);
  const selectionKey = [
    context.pageIndex,
    rect.origin.x,
    rect.origin.y,
    rect.size.width,
    rect.size.height,
  ].join(':');

  useEffect(() => {
    setCopied(false);
    setHighlightColor('yellow');
    setSaveStatus('idle');
    setCompanion(undefined);
  }, [selectionKey]);

  useEffect(() => {
    const scope = selection?.forDocument(documentId);
    if (!scope) {
      setSelectedText(undefined);
      setSelectedTextStatus('failed');
      return;
    }

    let active = true;
    setSelectedText(undefined);
    setSelectedTextStatus('loading');
    void scope.getSelectedText().toPromise().then((lines) => {
      if (!active) return;
      const text = lines.join(' ').replace(/\s+/g, ' ').trim();
      setSelectedText(text || undefined);
      setSelectedTextStatus(text ? 'ready' : 'failed');
    }).catch(() => {
      if (!active) return;
      setSelectedText(undefined);
      setSelectedTextStatus('failed');
    });

    return () => {
      active = false;
    };
  }, [documentId, selection, selectionKey]);

  useEffect(() => {
    const scope = selection?.forDocument(documentId);
    if (!scope) return;

    return scope.onCopyToClipboard(() => {
      setCopied(true);
      scheduleSelectionReset(() => scope.clear());
    });
  }, [documentId, selection]);

  useEffect(() => () => {
    if (resetTimerRef.current !== undefined) {
      window.clearTimeout(resetTimerRef.current);
    }
  }, []);

  const scheduleSelectionReset = (clearSelection: () => void) => {
    if (resetTimerRef.current !== undefined) {
      window.clearTimeout(resetTimerRef.current);
    }
    resetTimerRef.current = window.setTimeout(() => {
      clearSelection();
      setCopied(false);
      setSaveStatus('idle');
    }, 900);
  };

  const saveSelection = async () => {
    const scope = selection?.forDocument(documentId);
    if (!scope || !sourceMetadata || saveStatus === 'saving') return;

    setSaveStatus('saving');
    try {
      const selectedText = (await scope.getSelectedText().toPromise()).join(' ');
      const sourceRects = scope.getFormattedSelection().flatMap((selectionPage) => {
        const rects = selectionPage.segmentRects.length > 0
          ? selectionPage.segmentRects
          : [selectionPage.rect];
        return rects.map((sourceRect) => ({
          pageIndex: selectionPage.pageIndex,
          x: sourceRect.origin.x,
          y: sourceRect.origin.y,
          width: sourceRect.size.width,
          height: sourceRect.size.height,
        }));
      });
      const savedItem = await savePdfSelectedTextItem(selectedText, {
        metadata: sourceMetadata,
        sourceRects,
        annotationType: 'highlight',
        highlightColor,
      });
      if (!savedItem) {
        setSaveStatus('failed');
        return;
      }

      setSaveStatus('saved');
      scheduleSelectionReset(() => scope.clear());
    } catch {
      setSaveStatus('failed');
    }
  };

  const openCompanion = () => {
    if (!selectedText || selectedTextStatus !== 'ready') return;

    // This call must stay directly inside the click turn so Chrome can use
    // transient user activation when a local translation model is first needed.
    const task = startPdfCompanionTranslation(selectedText);
    setCompanion({
      task,
      text: selectedText,
    });
  };
  const retryCompanion = () => {
    if (!companion) return;
    setCompanion({
      text: companion.text,
      task: startPdfCompanionTranslation(companion.text),
    });
  };
  const closeCompanion = () => {
    setCompanion(undefined);
    window.requestAnimationFrame(() => companionButtonRef.current?.focus());
  };

  return (
    <div {...menuWrapperProps}>
      <div
        className="pdf-reader__selection-menu"
        style={{
          top: placement.suggestTop ? -48 : rect.size.height + 8,
        }}
      >
        <button
          ref={companionButtonRef}
          type="button"
          data-no-interaction
          aria-label="打开划词伴读"
          aria-controls={companion ? 'pdf-reader-selection-companion' : undefined}
          aria-expanded={Boolean(companion)}
          title={selectedTextStatus === 'failed'
            ? '无法读取当前选区'
            : '划词伴读'}
          disabled={selectedTextStatus !== 'ready'}
          onClick={() => {
            if (companion) {
              closeCompanion();
            } else {
              openCompanion();
            }
          }}
        >
          {selectedTextStatus === 'loading'
            ? <LoaderCircle className="is-spinning" aria-hidden="true" />
            : <Languages aria-hidden="true" />}
          <span>伴读</span>
        </button>
        <span className="pdf-reader__selection-menu-divider" aria-hidden="true" />
        <div
          className="pdf-reader__highlight-swatches"
          role="radiogroup"
          aria-label="高亮颜色"
        >
          {PDF_HIGHLIGHT_COLOR_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              data-no-interaction
              data-color={option.value}
              role="radio"
              aria-checked={highlightColor === option.value}
              aria-label={`${option.label}高亮`}
              title={option.label}
              onClick={() => {
                setHighlightColor(option.value);
                if (saveStatus === 'failed') setSaveStatus('idle');
              }}
            >
              <span aria-hidden="true" />
            </button>
          ))}
        </div>
        <button
          type="button"
          data-no-interaction
          aria-label="高亮所选文本并保存到 Yuel"
          title={saveStatus === 'failed' ? '高亮失败，请重试' : '保存高亮'}
          disabled={!sourceMetadata || saveStatus === 'saving'}
          onClick={() => void saveSelection()}
        >
          {saveStatus === 'saving'
            ? <LoaderCircle className="is-spinning" aria-hidden="true" />
            : saveStatus === 'saved'
              ? <Check aria-hidden="true" />
              : <Highlighter aria-hidden="true" />}
          <span>
            {saveStatus === 'saving'
              ? '保存中'
              : saveStatus === 'saved'
                ? '已高亮'
                : saveStatus === 'failed'
                  ? '重试'
                  : '高亮'}
          </span>
        </button>
        <button
          type="button"
          data-no-interaction
          aria-label="复制所选文本"
          title="复制"
          onClick={() => selection?.forDocument(documentId).copyToClipboard()}
        >
          {copied
            ? <Check aria-hidden="true" />
            : <Copy aria-hidden="true" />}
          <span>{copied ? '已复制' : '复制'}</span>
        </button>
      </div>
      {companion ? (
        <PdfSelectionCompanion
          key={companion.text}
          onClose={closeCompanion}
          onRetry={retryCompanion}
          pageNumber={context.pageIndex + 1}
          placement={placement}
          rectHeight={rect.size.height}
          task={companion.task}
          text={companion.text}
        />
      ) : null}
    </div>
  );
}

export function PdfPersistentHighlightLayer({
  editingSavedItemId,
  highlights,
  onEdit,
  pageIndex,
  scale,
}: {
  editingSavedItemId?: string;
  highlights: PdfStoredHighlight[];
  onEdit: (savedItemId: string) => void;
  pageIndex: number;
  scale: number;
}) {
  const pageHighlights = highlights.flatMap((highlight) =>
    highlight.annotation.sourceRects
      .filter((rect) => rect.pageIndex === pageIndex)
      .map((rect, rectIndex) => ({ highlight, rect, rectIndex })));
  if (pageHighlights.length === 0) return null;

  return (
    <div className="pdf-reader__stored-highlight-layer">
      {pageHighlights.map(({ highlight, rect, rectIndex }) => (
        <button
          key={`${highlight.annotation.id}:${rectIndex}`}
          className="pdf-reader__stored-highlight"
          type="button"
          data-color={highlight.color}
          data-pdf-highlight-id={highlight.annotation.id}
          aria-label={`编辑高亮：${createInlinePreview(highlight.savedItem.text)}`}
          aria-pressed={editingSavedItemId === highlight.savedItem.id}
          tabIndex={rectIndex === 0 ? 0 : -1}
          title="编辑高亮、笔记和标签"
          style={{
            left: rect.x * scale,
            top: rect.y * scale,
            width: rect.width * scale,
            height: rect.height * scale,
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onEdit(highlight.savedItem.id);
          }}
        />
      ))}
    </div>
  );
}

export function PdfHighlightEditor({
  highlight,
  onClose,
}: {
  highlight: PdfStoredHighlight;
  onClose: () => void;
}) {
  const [color, setColor] = useState<PdfHighlightColor>(highlight.color);
  const [noteDraft, setNoteDraft] = useState(highlight.savedItem.note ?? '');
  const [tagsDraft, setTagsDraft] = useState(
    (highlight.savedItem.userTags ?? []).join('，'),
  );
  const [error, setError] = useState<string>();
  const [busyAction, setBusyAction] = useState<'save' | 'delete'>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const editorRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (busyAction) return;
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const editor = editorRef.current;
      if (!editor) return;
      const focusable = Array.from(
        editor.querySelectorAll<HTMLElement>(
          'button:not(:disabled), textarea:not(:disabled), input:not(:disabled)',
        ),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        editor.focus();
        return;
      }

      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (!editor.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [busyAction, onClose]);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busyAction) return;

    const validation = validateHighlightMetadata(noteDraft, tagsDraft);
    if ('error' in validation) {
      setError(validation.error);
      return;
    }

    setBusyAction('save');
    setError(undefined);
    try {
      const updated = await updatePdfHighlight(highlight.savedItem.id, {
        color,
        note: noteDraft,
        userTags: validation.userTags,
      });
      if (!updated) throw new Error('PDF highlight no longer exists.');
      onClose();
    } catch {
      setError('保存失败，原高亮仍保留在本地。请重试。');
    } finally {
      setBusyAction(undefined);
    }
  };

  const remove = async () => {
    if (busyAction) return;
    setBusyAction('delete');
    setError(undefined);
    try {
      const deleted = await deleteSavedItem(highlight.savedItem.id);
      if (!deleted) throw new Error('PDF highlight no longer exists.');
      onClose();
    } catch {
      setError('删除失败，高亮仍保留在本地。请重试。');
      setConfirmDelete(false);
    } finally {
      setBusyAction(undefined);
    }
  };

  return (
    <div
      className="pdf-reader__highlight-editor-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !busyAction) onClose();
      }}
    >
      <section
        ref={editorRef}
        className="pdf-reader__highlight-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pdf-reader-highlight-editor-title"
        aria-busy={Boolean(busyAction)}
        data-pdf-reader-shortcuts-disabled=""
        tabIndex={-1}
      >
        <header>
          <span
            className="pdf-reader__highlight-editor-mark"
            data-color={color}
            aria-hidden="true"
          >
            <Highlighter />
          </span>
          <div>
            <h2 id="pdf-reader-highlight-editor-title">高亮与笔记</h2>
            <p>第 {highlight.annotation.pageIndex + 1} 页</p>
          </div>
          <button
            type="button"
            aria-label="关闭高亮编辑"
            title="关闭"
            disabled={Boolean(busyAction)}
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </button>
        </header>

        <blockquote>“{highlight.savedItem.text}”</blockquote>

        <form onSubmit={(event) => void save(event)}>
          <fieldset>
            <legend>高亮颜色</legend>
            <div
              className="pdf-reader__highlight-editor-swatches"
              role="radiogroup"
              aria-label="高亮颜色"
            >
              {PDF_HIGHLIGHT_COLOR_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  data-color={option.value}
                  role="radio"
                  aria-checked={color === option.value}
                  aria-label={option.label}
                  title={option.label}
                  disabled={Boolean(busyAction)}
                  onClick={() => setColor(option.value)}
                >
                  <span aria-hidden="true" />
                </button>
              ))}
            </div>
          </fieldset>

          <label>
            <span>笔记</span>
            <textarea
              autoFocus
              rows={5}
              value={noteDraft}
              maxLength={MAX_SAVED_ITEM_NOTE_LENGTH + 1}
              disabled={Boolean(busyAction)}
              aria-describedby="pdf-reader-highlight-note-help"
              onChange={(event) => setNoteDraft(event.target.value)}
            />
          </label>
          <p id="pdf-reader-highlight-note-help">
            {noteDraft.trim().length} / {MAX_SAVED_ITEM_NOTE_LENGTH} 字符
          </p>

          <label>
            <span>标签</span>
            <input
              type="text"
              value={tagsDraft}
              placeholder="例如：架构，写作，待复习"
              disabled={Boolean(busyAction)}
              aria-describedby="pdf-reader-highlight-tags-help"
              onChange={(event) => setTagsDraft(event.target.value)}
            />
          </label>
          <p id="pdf-reader-highlight-tags-help">
            最多 {MAX_SAVED_ITEM_USER_TAGS} 个标签，每个不超过 {MAX_SAVED_ITEM_USER_TAG_LENGTH} 个字符。
          </p>

          {error ? (
            <p className="pdf-reader__highlight-editor-error" role="alert">
              {error}
            </p>
          ) : null}

          {confirmDelete ? (
            <div
              className="pdf-reader__highlight-delete-confirmation"
              role="group"
              aria-label="确认删除高亮"
            >
              <p>删除后，高亮、笔记、标签和摘录回链都会移除。</p>
              <div>
                <button
                  className="pdf-reader__button pdf-reader__button--secondary"
                  type="button"
                  autoFocus
                  disabled={Boolean(busyAction)}
                  onClick={() => setConfirmDelete(false)}
                >
                  取消
                </button>
                <button
                  className="pdf-reader__button pdf-reader__button--danger"
                  type="button"
                  disabled={Boolean(busyAction)}
                  onClick={() => void remove()}
                >
                  {busyAction === 'delete'
                    ? <LoaderCircle className="is-spinning" aria-hidden="true" />
                    : <Trash2 aria-hidden="true" />}
                  删除高亮
                </button>
              </div>
            </div>
          ) : (
            <footer>
              <button
                className="pdf-reader__button pdf-reader__button--danger-quiet"
                type="button"
                disabled={Boolean(busyAction)}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 aria-hidden="true" />
                删除
              </button>
              <div>
                <button
                  className="pdf-reader__button pdf-reader__button--secondary"
                  type="button"
                  disabled={Boolean(busyAction)}
                  onClick={onClose}
                >
                  取消
                </button>
                <button
                  className="pdf-reader__button pdf-reader__button--primary"
                  type="submit"
                  disabled={Boolean(busyAction)}
                >
                  {busyAction === 'save'
                    ? <LoaderCircle className="is-spinning" aria-hidden="true" />
                    : <Save aria-hidden="true" />}
                  {busyAction === 'save' ? '保存中' : '保存更改'}
                </button>
              </div>
            </footer>
          )}
        </form>
      </section>
    </div>
  );
}

function validateHighlightMetadata(
  note: string,
  tags: string,
): { userTags: string[] } | { error: string } {
  if (note.trim().length > MAX_SAVED_ITEM_NOTE_LENGTH) {
    return { error: `笔记最多 ${MAX_SAVED_ITEM_NOTE_LENGTH} 个字符。` };
  }

  const userTags = Array.from(new Map(
    tags
      .split(/[,，]/)
      .map((tag) => tag.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .map((tag) => [tag.toLocaleLowerCase(), tag] as const),
  ).values());
  if (userTags.length > MAX_SAVED_ITEM_USER_TAGS) {
    return { error: `每条高亮最多添加 ${MAX_SAVED_ITEM_USER_TAGS} 个标签。` };
  }
  const longTag = userTags.find((tag) =>
    tag.length > MAX_SAVED_ITEM_USER_TAG_LENGTH);
  if (longTag) {
    return {
      error: `标签“${longTag}”超过 ${MAX_SAVED_ITEM_USER_TAG_LENGTH} 个字符。`,
    };
  }

  return { userTags };
}

function createInlinePreview(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > 48
    ? `${normalized.slice(0, 47)}…`
    : normalized;
}
