import type { TodayReadingSummary } from '../storage/readingStats';
import { formatCount, formatMinutes } from './formatters';

export interface ShareCardContent {
  date: string;
  effectiveWords: string;
  readingTime: string;
  pages: string;
  learningWords: string;
  streak: string;
  domain: string;
  domains: string[];
  copyText: string;
}

export interface ShareCardCopyOptions {
  siteLimit: number;
  showStreak: boolean;
}

const DEFAULT_SHARE_CARD_COPY_OPTIONS: ShareCardCopyOptions = {
  siteLimit: 3,
  showStreak: true,
};

export function createShareCardContent(summary: TodayReadingSummary): ShareCardContent {
  const domains = normalizeDomains(summary.topDomains);
  const content = {
    date: summary.date,
    effectiveWords: formatCount(summary.effectiveWords),
    readingTime: formatMinutes(summary.minutes),
    pages: formatCount(summary.readPages),
    learningWords: formatCount(summary.learningWords),
    streak: formatCount(summary.streak),
    domain: domains[0] ?? '暂无今日网站',
    domains,
  };

  return {
    ...content,
    copyText: createShareCardCopyText(content, DEFAULT_SHARE_CARD_COPY_OPTIONS),
  };
}

export function createShareCardCopyText(
  content: Omit<ShareCardContent, 'copyText'>,
  { siteLimit, showStreak }: ShareCardCopyOptions,
): string {
  const normalizedSiteLimit = Math.max(1, Math.floor(siteLimit));
  const visibleDomains = content.domains.slice(0, normalizedSiteLimit);
  const lines = [
    `阅量 · 今日英文阅读 · ${content.date}`,
    `今天计入 ${content.effectiveWords} Words`,
  ];

  if (showStreak) {
    lines.push(`连续打卡：${content.streak} 天`);
  }

  lines.push(
    `阅读时间：${content.readingTime}`,
    `页面：${content.pages} 页`,
    `学习中词汇：${content.learningWords} 个`,
    `今日网站：${visibleDomains.join('、') || '暂无今日网站'}`,
  );

  return lines.join('\n');
}

function normalizeDomains(domains: string[]): string[] {
  return Array.from(new Set(domains.map((domain) => domain.trim()).filter(Boolean)));
}
