import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  FileText,
  LoaderCircle,
  Pencil,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { FormEvent } from 'react';

import type { PdfReaderTarget } from '../../src/pdf/navigation';
import {
  MAX_SAVED_ITEM_NOTE_LENGTH,
  MAX_SAVED_ITEM_USER_TAG_LENGTH,
  MAX_SAVED_ITEM_USER_TAGS,
  type UpdateSavedItemMetadataInput,
} from '../../src/storage/saveItems';
import type { SavedItemLibraryItem } from '../../src/storage/savedItemLibrary';
import { formatDateTime } from '../../src/ui/formatters';
import {
  ActionButton,
  InlineNotice,
} from '../../src/ui/primitives';
import { SiteFavicon } from '../../src/ui/siteFavicon';

type SourceFilter = 'all' | 'web' | 'pdf';
type SortOrder = 'newest' | 'oldest';
type LibraryStatus = 'loading' | 'ready' | 'failed';

const INITIAL_VISIBLE_EXCERPTS = 8;
const VISIBLE_EXCERPT_STEP = 8;

export interface SavedExcerptLibraryProps {
  items: SavedItemLibraryItem[];
  status: LibraryStatus;
  copyTextToClipboard(text: string): Promise<void>;
  deleteItem(id: string): Promise<void>;
  openPdfReaderTarget(target: PdfReaderTarget): Promise<void>;
  openWebSource(url: string): Promise<void>;
  resolveFaviconUrl(domain: string): string | undefined;
  retry(): void;
  updateItem(id: string, input: UpdateSavedItemMetadataInput): Promise<void>;
}

export function SavedExcerptLibrary({
  items,
  status,
  copyTextToClipboard,
  deleteItem,
  openPdfReaderTarget,
  openWebSource,
  resolveFaviconUrl,
  retry,
  updateItem,
}: SavedExcerptLibraryProps) {
  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const [visibleLimit, setVisibleLimit] = useState(INITIAL_VISIBLE_EXCERPTS);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [editingId, setEditingId] = useState<string>();
  const [deleteConfirmId, setDeleteConfirmId] = useState<string>();
  const [noteDraft, setNoteDraft] = useState('');
  const [tagsDraft, setTagsDraft] = useState('');
  const [editError, setEditError] = useState<string>();
  const [busyAction, setBusyAction] = useState<string>();
  const [copiedId, setCopiedId] = useState<string>();
  const [notice, setNotice] = useState<{
    message: string;
    tone: 'neutral' | 'positive' | 'danger';
  }>();
  const copiedTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    setVisibleLimit(INITIAL_VISIBLE_EXCERPTS);
  }, [query, sourceFilter, tagFilter, sortOrder]);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current !== undefined) {
        window.clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (tagFilter !== 'all' && !items.some((item) => item.userTags.includes(tagFilter))) {
      setTagFilter('all');
    }
  }, [items, tagFilter]);

  const availableTags = useMemo(
    () => Array.from(new Set(items.flatMap((item) => item.userTags)))
      .sort((left, right) => left.localeCompare(right, 'zh-CN')),
    [items],
  );
  const filteredItems = useMemo(() => {
    const normalizedQuery = query.replace(/\s+/g, ' ').trim().toLocaleLowerCase();
    const nextItems = items.filter((item) => {
      if (sourceFilter !== 'all' && item.sourceKind !== sourceFilter) return false;
      if (tagFilter !== 'all' && !item.userTags.includes(tagFilter)) return false;
      if (!normalizedQuery) return true;

      return [
        item.text,
        item.note ?? '',
        item.sourceTitle ?? '',
        item.sourceDomain,
        ...item.userTags,
      ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
    });

    return [...nextItems].sort((left, right) => (
      sortOrder === 'newest'
        ? right.createdAt - left.createdAt
        : left.createdAt - right.createdAt
    ));
  }, [items, query, sortOrder, sourceFilter, tagFilter]);
  const visibleItems = filteredItems.slice(0, visibleLimit);
  const hasActiveFilters = query.trim().length > 0
    || sourceFilter !== 'all'
    || tagFilter !== 'all'
    || sortOrder !== 'newest';

  const clearFilters = () => {
    setQuery('');
    setSourceFilter('all');
    setTagFilter('all');
    setSortOrder('newest');
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startEditing = (item: SavedItemLibraryItem) => {
    setEditingId(item.id);
    setDeleteConfirmId(undefined);
    setNoteDraft(item.note ?? '');
    setTagsDraft(item.userTags.join('，'));
    setEditError(undefined);
    setNotice(undefined);
  };

  const cancelEditing = () => {
    setEditingId(undefined);
    setNoteDraft('');
    setTagsDraft('');
    setEditError(undefined);
  };

  const saveEditing = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingId || busyAction) return;

    const userTags = tagsDraft.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean);
    const uniqueTags = Array.from(new Map(
      userTags.map((tag) => [tag.toLocaleLowerCase(), tag] as const),
    ).values());
    if (noteDraft.trim().length > MAX_SAVED_ITEM_NOTE_LENGTH) {
      setEditError(`笔记最多 ${MAX_SAVED_ITEM_NOTE_LENGTH} 个字符。`);
      return;
    }
    if (uniqueTags.length > MAX_SAVED_ITEM_USER_TAGS) {
      setEditError(`每条摘录最多添加 ${MAX_SAVED_ITEM_USER_TAGS} 个标签。`);
      return;
    }
    const longTag = uniqueTags.find((tag) => tag.length > MAX_SAVED_ITEM_USER_TAG_LENGTH);
    if (longTag) {
      setEditError(`标签“${longTag}”超过 ${MAX_SAVED_ITEM_USER_TAG_LENGTH} 个字符。`);
      return;
    }

    setBusyAction(`edit:${editingId}`);
    setEditError(undefined);
    try {
      await updateItem(editingId, {
        note: noteDraft,
        userTags: uniqueTags,
      });
      setNotice({ message: '笔记和标签已保存。', tone: 'positive' });
      cancelEditing();
    } catch {
      setEditError('保存失败，原笔记和标签未改变。请重试。');
    } finally {
      setBusyAction(undefined);
    }
  };

  const copyItem = async (item: SavedItemLibraryItem) => {
    if (busyAction) return;
    setBusyAction(`copy:${item.id}`);
    setNotice(undefined);
    try {
      await copyTextToClipboard(item.text);
      setCopiedId(item.id);
      setNotice({ message: '摘录已复制。', tone: 'positive' });
      if (copiedTimerRef.current !== undefined) {
        window.clearTimeout(copiedTimerRef.current);
      }
      copiedTimerRef.current = window.setTimeout(() => setCopiedId(undefined), 1_600);
    } catch {
      setNotice({ message: '复制失败，请允许剪贴板访问后重试。', tone: 'danger' });
    } finally {
      setBusyAction(undefined);
    }
  };

  const openSource = async (item: SavedItemLibraryItem) => {
    if (busyAction) return;
    setBusyAction(`open:${item.id}`);
    setNotice(undefined);
    try {
      if (item.pdfAnchor) {
        await openPdfReaderTarget({
          resourceId: item.pdfAnchor.resourceId,
          pageIndex: item.pdfAnchor.pageIndex,
          annotationId: item.pdfAnchor.annotationId,
          ...(item.pdfAnchor.pageCoordinates
            ? { pageCoordinates: item.pdfAnchor.pageCoordinates }
            : {}),
        });
      } else if (item.sourceUrl) {
        await openWebSource(item.sourceUrl);
      }
    } catch {
      setNotice({ message: '暂时无法打开原文，请稍后重试。', tone: 'danger' });
    } finally {
      setBusyAction(undefined);
    }
  };

  const confirmDelete = async (item: SavedItemLibraryItem) => {
    if (busyAction) return;
    setBusyAction(`delete:${item.id}`);
    setNotice(undefined);
    try {
      await deleteItem(item.id);
      setDeleteConfirmId(undefined);
      setEditingId(undefined);
      setNotice({ message: '摘录已删除。', tone: 'positive' });
    } catch {
      setNotice({ message: '删除失败，摘录仍保留在本地。请重试。', tone: 'danger' });
    } finally {
      setBusyAction(undefined);
    }
  };

  return (
    <div className="excerpt-library">
      <div className="excerpt-library__toolbar">
        <label className="excerpt-library__field excerpt-library__field--search">
          <span>搜索</span>
          <span className="excerpt-library__search-control">
            <Search aria-hidden="true" />
            <input
              type="search"
              value={query}
              placeholder="正文、来源、笔记或标签"
              onChange={(event) => setQuery(event.target.value)}
            />
            {query ? (
              <button
                type="button"
                aria-label="清除搜索"
                title="清除搜索"
                onClick={() => setQuery('')}
              >
                <X aria-hidden="true" />
              </button>
            ) : null}
          </span>
        </label>

        <div className="excerpt-library__field excerpt-library__field--source">
          <span id="excerpt-source-filter-label">来源</span>
          <div
            className="excerpt-library__segments"
            role="group"
            aria-labelledby="excerpt-source-filter-label"
          >
            {([
              ['all', '全部'],
              ['web', '网页'],
              ['pdf', 'PDF'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={sourceFilter === value}
                onClick={() => setSourceFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <label className="excerpt-library__field">
          <span>标签</span>
          <select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}>
            <option value="all">全部标签</option>
            {availableTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
          </select>
        </label>

        <label className="excerpt-library__field">
          <span>排序</span>
          <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value as SortOrder)}>
            <option value="newest">最近保存</option>
            <option value="oldest">最早保存</option>
          </select>
        </label>
      </div>

      <div className="excerpt-library__summary" aria-live="polite">
        <span>{filteredItems.length === items.length ? `共 ${items.length} 条` : `找到 ${filteredItems.length} 条`}</span>
        {hasActiveFilters ? (
          <button type="button" onClick={clearFilters}>清除筛选</button>
        ) : null}
      </div>

      {notice ? <InlineNotice tone={notice.tone}>{notice.message}</InlineNotice> : null}

      {status === 'loading' ? (
        <div className="excerpt-library__loading" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      ) : null}

      {status === 'failed' ? (
        <div className="excerpt-library__load-error">
          <InlineNotice tone="danger">摘录库暂时无法读取，其他阅读数据不受影响。</InlineNotice>
          <ActionButton variant="secondary" onClick={retry}>重新读取摘录</ActionButton>
        </div>
      ) : null}

      {status === 'ready' && items.length === 0 ? (
        <div className="excerpt-library__empty">
          <FileText aria-hidden="true" />
          <div>
            <h3>还没有摘录</h3>
            <p>在网页中选中文本并右键保存，或在 PDF 阅读器中使用“保存”操作。</p>
          </div>
        </div>
      ) : null}

      {status === 'ready' && items.length > 0 && filteredItems.length === 0 ? (
        <div className="excerpt-library__empty excerpt-library__empty--filtered">
          <Search aria-hidden="true" />
          <div>
            <h3>没有匹配的摘录</h3>
            <p>换一个关键词，或清除来源和标签筛选。</p>
          </div>
          <ActionButton variant="quiet" onClick={clearFilters}>清除筛选</ActionButton>
        </div>
      ) : null}

      {visibleItems.length > 0 ? (
        <div className="excerpt-library__list">
          {visibleItems.map((item) => {
            const expanded = expandedIds.has(item.id);
            const isCollapsible = item.text.length > 220;
            const isEditing = editingId === item.id;
            const isConfirmingDelete = deleteConfirmId === item.id;
            const sourceLabel = item.sourceTitle || item.sourceDomain;
            const hasSourceAction = Boolean(item.pdfAnchor || item.sourceUrl);
            const isOpening = busyAction === `open:${item.id}`;
            const isCopying = busyAction === `copy:${item.id}`;

            return (
              <article className="excerpt-row" key={item.id}>
                <div className="excerpt-row__header">
                  <div className="excerpt-row__source">
                    {item.sourceKind === 'pdf' ? (
                      <span className="excerpt-row__source-icon" aria-hidden="true">
                        <FileText />
                      </span>
                    ) : (
                      <SiteFavicon
                        className="excerpt-row__source-icon"
                        domain={item.sourceDomain}
                        resolveUrl={resolveFaviconUrl}
                      />
                    )}
                    <div>
                      <h3 title={sourceLabel}>{sourceLabel}</h3>
                      <p>
                        {formatSavedItemType(item.type)}
                        {item.sourceTitle && item.sourceTitle !== item.sourceDomain
                          ? ` · ${item.sourceDomain}`
                          : ''}
                      </p>
                    </div>
                  </div>
                  <time dateTime={new Date(item.createdAt).toISOString()}>
                    {formatDateTime(item.createdAt)}
                  </time>
                </div>

                <blockquote className={isCollapsible && !expanded ? 'is-collapsed' : undefined}>
                  “{item.text}”
                </blockquote>

                {item.note ? (
                  <div className="excerpt-row__note">
                    <span>笔记</span>
                    <p>{item.note}</p>
                  </div>
                ) : null}

                {item.userTags.length > 0 ? (
                  <div className="excerpt-row__tags" aria-label="摘录标签">
                    {item.userTags.map((tag) => <span key={tag}>{tag}</span>)}
                  </div>
                ) : null}

                <div className="excerpt-row__footer">
                  <div className="excerpt-row__disclosure">
                    {isCollapsible ? (
                      <button
                        type="button"
                        aria-expanded={expanded}
                        onClick={() => toggleExpanded(item.id)}
                      >
                        {expanded ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
                        {expanded ? '收起' : '展开全文'}
                      </button>
                    ) : null}
                    {hasSourceAction ? (
                      <button
                        type="button"
                        disabled={Boolean(busyAction)}
                        aria-busy={isOpening}
                        onClick={() => void openSource(item)}
                      >
                        {isOpening
                          ? <LoaderCircle className="is-spinning" aria-hidden="true" />
                          : <ExternalLink aria-hidden="true" />}
                        {item.sourceKind === 'pdf' && item.pdfAnchor
                          ? `第 ${item.pdfAnchor.pageIndex + 1} 页 · 回到原文`
                          : '打开网页原文'}
                      </button>
                    ) : (
                      <span className="excerpt-row__source-unavailable">未保存原文链接</span>
                    )}
                  </div>

                  <div className="excerpt-row__actions" aria-label="摘录操作">
                    <button
                      type="button"
                      disabled={Boolean(busyAction)}
                      aria-label={copiedId === item.id ? '摘录已复制' : '复制摘录'}
                      title={copiedId === item.id ? '已复制' : '复制摘录'}
                      onClick={() => void copyItem(item)}
                    >
                      {isCopying
                        ? <LoaderCircle className="is-spinning" aria-hidden="true" />
                        : copiedId === item.id
                          ? <Check aria-hidden="true" />
                          : <Copy aria-hidden="true" />}
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(busyAction)}
                      aria-label="编辑笔记和标签"
                      title="编辑笔记和标签"
                      onClick={() => startEditing(item)}
                    >
                      <Pencil aria-hidden="true" />
                    </button>
                    <button
                      className="excerpt-row__delete-button"
                      type="button"
                      disabled={Boolean(busyAction)}
                      aria-label="删除摘录"
                      title="删除摘录"
                      onClick={() => {
                        setDeleteConfirmId(item.id);
                        setEditingId(undefined);
                        setNotice(undefined);
                      }}
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {isEditing ? (
                  <form className="excerpt-editor" onSubmit={(event) => void saveEditing(event)}>
                    <label>
                      <span>笔记</span>
                      <textarea
                        autoFocus
                        rows={4}
                        value={noteDraft}
                        maxLength={MAX_SAVED_ITEM_NOTE_LENGTH + 1}
                        aria-describedby={`excerpt-note-help-${item.id}`}
                        onChange={(event) => setNoteDraft(event.target.value)}
                      />
                    </label>
                    <p id={`excerpt-note-help-${item.id}`}>
                      {noteDraft.trim().length} / {MAX_SAVED_ITEM_NOTE_LENGTH} 字符
                    </p>
                    <label>
                      <span>标签</span>
                      <input
                        type="text"
                        value={tagsDraft}
                        placeholder="例如：架构，写作，待复习"
                        aria-describedby={`excerpt-tags-help-${item.id}`}
                        onChange={(event) => setTagsDraft(event.target.value)}
                      />
                    </label>
                    <p id={`excerpt-tags-help-${item.id}`}>
                      最多 {MAX_SAVED_ITEM_USER_TAGS} 个标签，用逗号分隔；每个不超过 {MAX_SAVED_ITEM_USER_TAG_LENGTH} 个字符。
                    </p>
                    {editError ? <InlineNotice tone="danger">{editError}</InlineNotice> : null}
                    <div className="excerpt-editor__actions">
                      <ActionButton
                        type="button"
                        variant="quiet"
                        disabled={Boolean(busyAction)}
                        onClick={cancelEditing}
                      >
                        取消编辑
                      </ActionButton>
                      <ActionButton
                        type="submit"
                        variant="primary"
                        disabled={Boolean(busyAction)}
                        aria-busy={busyAction === `edit:${item.id}`}
                      >
                        {busyAction === `edit:${item.id}` ? '保存中...' : '保存笔记'}
                      </ActionButton>
                    </div>
                  </form>
                ) : null}

                {isConfirmingDelete ? (
                  <div className="excerpt-delete-confirmation" role="group" aria-label="确认删除摘录">
                    <div>
                      <strong>删除这条摘录？</strong>
                      <p>笔记、标签和 PDF 回链也会一起删除，无法恢复。</p>
                    </div>
                    <div>
                      <ActionButton
                        type="button"
                        variant="quiet"
                        disabled={Boolean(busyAction)}
                        onClick={() => setDeleteConfirmId(undefined)}
                      >
                        保留摘录
                      </ActionButton>
                      <ActionButton
                        type="button"
                        variant="danger"
                        disabled={Boolean(busyAction)}
                        aria-busy={busyAction === `delete:${item.id}`}
                        onClick={() => void confirmDelete(item)}
                      >
                        {busyAction === `delete:${item.id}` ? '删除中...' : '删除摘录'}
                      </ActionButton>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}

      {visibleItems.length < filteredItems.length ? (
        <div className="excerpt-library__more">
          <ActionButton
            variant="secondary"
            onClick={() => setVisibleLimit((current) => current + VISIBLE_EXCERPT_STEP)}
          >
            再显示 {Math.min(VISIBLE_EXCERPT_STEP, filteredItems.length - visibleItems.length)} 条
          </ActionButton>
        </div>
      ) : null}
    </div>
  );
}

function formatSavedItemType(type: SavedItemLibraryItem['type']): string {
  if (type === 'word') return '单词';
  if (type === 'phrase') return '短语';
  if (type === 'sentence') return '句子';
  return '长摘录';
}
