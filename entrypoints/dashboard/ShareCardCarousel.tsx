import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Ref } from 'react';

import type { ShareCardContent } from '../../src/ui/shareCardContent';

export type ShareCardThemeId = 'forest' | 'mist' | 'midnight' | 'berry';

interface ShareCardTheme {
  id: ShareCardThemeId;
  name: string;
  description: string;
}

export const SHARE_CARD_THEMES: readonly ShareCardTheme[] = [
  { id: 'forest', name: '松影', description: '深绿与柔和微光，沉静耐看。' },
  { id: 'mist', name: '雾白', description: '清晰留白与编辑感，轻盈克制。' },
  { id: 'midnight', name: '星夜', description: '深蓝高对比，数据感更利落。' },
  { id: 'berry', name: '莓影', description: '深莓与珊瑚色，温润而醒目。' },
];

export const DEFAULT_SHARE_CARD_THEME: ShareCardThemeId = 'forest';

export function getShareCardTheme(themeId: ShareCardThemeId): ShareCardTheme {
  return SHARE_CARD_THEMES.find((theme) => theme.id === themeId) ?? SHARE_CARD_THEMES[0];
}

export function ShareCardCarousel({
  cardRef,
  content,
  disabled = false,
  onThemeChange,
  selectedTheme,
}: {
  cardRef: Ref<HTMLDivElement>;
  content: ShareCardContent;
  disabled?: boolean;
  onThemeChange: (theme: ShareCardThemeId) => void;
  selectedTheme: ShareCardThemeId;
}) {
  const activeIndex = Math.max(0, SHARE_CARD_THEMES.findIndex((theme) => theme.id === selectedTheme));
  const activeTheme = SHARE_CARD_THEMES[activeIndex];

  const moveToAdjacentTheme = (offset: number) => {
    const nextIndex = (activeIndex + offset + SHARE_CARD_THEMES.length) % SHARE_CARD_THEMES.length;
    onThemeChange(SHARE_CARD_THEMES[nextIndex].id);
  };

  return (
    <div className="share-carousel">
      <div
        className="share-carousel__stage"
        role="region"
        aria-roledescription="卡片轮播"
        aria-label="打卡卡片样式预览"
      >
        <div className="share-carousel__viewport">
          <div
            className="share-carousel__track"
            style={{ transform: `translate3d(-${activeIndex * 100}%, 0, 0)` }}
          >
            {SHARE_CARD_THEMES.map((theme) => {
              const selected = theme.id === selectedTheme;

              return (
                <div
                  key={theme.id}
                  className="share-carousel__slide"
                  aria-hidden={!selected}
                >
                  <ShareCardPreview
                    ref={selected ? cardRef : undefined}
                    content={content}
                    theme={theme.id}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="share-carousel__controls">
        <div className="share-carousel__caption" aria-live="polite" aria-atomic="true">
          <span>{String(activeIndex + 1).padStart(2, '0')} / {String(SHARE_CARD_THEMES.length).padStart(2, '0')}</span>
          <strong>{activeTheme.name}</strong>
          <p>{activeTheme.description}</p>
        </div>
        <div className="share-carousel__arrows" aria-label="切换卡片样式">
          <button
            type="button"
            disabled={disabled}
            aria-label="上一种卡片样式"
            onClick={() => moveToAdjacentTheme(-1)}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <button
            type="button"
            disabled={disabled}
            aria-label="下一种卡片样式"
            onClick={() => moveToAdjacentTheme(1)}
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      </div>

      <fieldset className="share-theme-picker" disabled={disabled}>
        <legend>选择卡片样式</legend>
        <div className="share-theme-picker__options">
          {SHARE_CARD_THEMES.map((theme) => (
            <label key={theme.id} className="share-theme-option">
              <input
                type="radio"
                name="share-card-theme"
                value={theme.id}
                checked={theme.id === selectedTheme}
                onChange={() => onThemeChange(theme.id)}
              />
              <span className="share-theme-option__swatch" data-theme={theme.id} aria-hidden="true">
                <span />
              </span>
              <span>{theme.name}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

const ShareCardPreview = ({
  ref,
  content,
  theme,
}: {
  ref?: Ref<HTMLDivElement>;
  content: ShareCardContent;
  theme: ShareCardThemeId;
}) => (
  <div
    ref={ref}
    className={`share-card-preview share-card-preview--${theme}`}
    data-card-theme={theme}
    role="group"
    aria-label={`${getShareCardTheme(theme).name}样式打卡卡片`}
  >
    <span className="share-card-preview__accent" aria-hidden="true" />
    <header className="share-card-preview__header">
      <div className="share-card-preview__brand">
        <span className="share-card-preview__mark" aria-hidden="true">
          <img src="/logo.svg" alt="" />
        </span>
        <span>
          <strong>阅量</strong>
          <small>Yuel</small>
        </span>
      </div>
      <time dateTime={content.date}>{content.date.replace(/-/g, '.')}</time>
    </header>

    <div className="share-card-preview__main">
      <p>今天计入</p>
      <div className="share-card-preview__statement">
        <strong>{content.effectiveWords}</strong>
        <span>个英文词</span>
      </div>
      <small>今日英文阅读</small>
    </div>

    <dl className="share-card-preview__metrics">
      <div><dt>阅读时间</dt><dd>{content.readingTime}</dd></div>
      <div><dt>今日页面</dt><dd>{content.pages} 页</dd></div>
      <div><dt>学习词汇</dt><dd>{content.learningWords} 个</dd></div>
    </dl>

    <footer className="share-card-preview__footer">
      <div>
        <span>今日网站</span>
        <strong title={content.domain}>{content.domain}</strong>
      </div>
      <span>阅读记录</span>
    </footer>
  </div>
);
