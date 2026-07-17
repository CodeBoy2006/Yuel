import { CalendarCheck2, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Ref } from 'react';

import type {
  ShareCardSettings,
  ShareCardThemeId,
} from '../../src/storage/shareCardSettings';
import type { ShareCardContent } from '../../src/ui/shareCardContent';
import { SiteFavicon, type WebsiteFaviconUrlResolver } from '../../src/ui/siteFavicon';

export type { ShareCardThemeId } from '../../src/storage/shareCardSettings';

interface ShareCardTheme {
  id: ShareCardThemeId;
  name: string;
}

export const SHARE_CARD_THEMES: readonly ShareCardTheme[] = [
  { id: 'forest', name: '松影' },
  { id: 'mist', name: '雾白' },
  { id: 'midnight', name: '星夜' },
  { id: 'berry', name: '莓影' },
];

export function getShareCardTheme(themeId: ShareCardThemeId): ShareCardTheme {
  return SHARE_CARD_THEMES.find((theme) => theme.id === themeId) ?? SHARE_CARD_THEMES[0];
}

export function ShareCardCarousel({
  cardRef,
  content,
  disabled = false,
  onThemeChange,
  resolveFaviconUrl,
  selectedTheme,
  settings,
}: {
  cardRef: Ref<HTMLDivElement>;
  content: ShareCardContent;
  disabled?: boolean;
  onThemeChange: (theme: ShareCardThemeId) => void;
  resolveFaviconUrl: WebsiteFaviconUrlResolver;
  selectedTheme: ShareCardThemeId;
  settings: Pick<ShareCardSettings, 'showSiteIcons' | 'showStreak' | 'siteLimit'>;
}) {
  const activeIndex = Math.max(0, SHARE_CARD_THEMES.findIndex((theme) => theme.id === selectedTheme));

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
                    resolveFaviconUrl={resolveFaviconUrl}
                    settings={settings}
                    theme={theme.id}
                  />
                </div>
              );
            })}
          </div>
        </div>
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

      <fieldset className="share-theme-picker" disabled={disabled}>
        <legend>样式</legend>
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
  resolveFaviconUrl,
  settings,
  theme,
}: {
  ref?: Ref<HTMLDivElement>;
  content: ShareCardContent;
  resolveFaviconUrl: WebsiteFaviconUrlResolver;
  settings: Pick<ShareCardSettings, 'showSiteIcons' | 'showStreak' | 'siteLimit'>;
  theme: ShareCardThemeId;
}) => {
  const visibleDomains = content.domains.slice(0, settings.siteLimit);

  return (
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
        <div className="share-card-preview__kicker">
          <p>今天计入</p>
          {settings.showStreak ? (
            <span
              className="share-card-preview__streak"
              aria-label={`连续打卡 ${content.streak} 天`}
            >
              <CalendarCheck2 aria-hidden="true" />
              <span>连续</span>
              <strong>{content.streak}</strong>
              <span>天</span>
            </span>
          ) : null}
        </div>
        <div className="share-card-preview__statement">
          <strong>{content.effectiveWords}</strong>
          <span>Words</span>
        </div>
      </div>

      <dl className="share-card-preview__metrics">
        <div><dt>有效时长</dt><dd>{content.readingTime}</dd></div>
        <div><dt>今日页面</dt><dd>{content.pages} 页</dd></div>
        <div><dt>学习词汇</dt><dd>{content.learningWords} 个</dd></div>
      </dl>

      <section className="share-card-preview__sites" aria-label="今日网站">
        <div className="share-card-preview__sites-heading">
          <span>今日网站</span>
          <small>{visibleDomains.length > 0 ? `${visibleDomains.length} 个来源` : '暂无来源'}</small>
        </div>
        {visibleDomains.length > 0 ? (
          <ul className={settings.showSiteIcons ? undefined : 'share-card-preview__site-list--plain'}>
            {visibleDomains.map((domain) => (
              <li key={domain}>
                {settings.showSiteIcons ? (
                  <SiteFavicon
                    className="share-card-preview__site-icon"
                    domain={domain}
                    resolveUrl={resolveFaviconUrl}
                  />
                ) : null}
                <strong title={domain}>{domain}</strong>
              </li>
            ))}
          </ul>
        ) : (
          <p className="share-card-preview__sites-empty">今天还没有网站记录</p>
        )}
      </section>
    </div>
  );
};
