import type { TodayReadingSummary } from '../storage/readingStats';
import { formatCount, formatMinutes } from './formatters';

export interface ShareCardContent {
  date: string;
  effectiveWords: string;
  readingTime: string;
  pages: string;
  learningWords: string;
  domain: string;
  copyText: string;
}

export function createShareCardContent(summary: TodayReadingSummary): ShareCardContent {
  const content = {
    date: summary.date,
    effectiveWords: formatCount(summary.effectiveWords),
    readingTime: formatMinutes(summary.minutes),
    pages: formatCount(summary.readPages),
    learningWords: formatCount(summary.learningWords),
    domain: summary.topDomains[0] ?? '暂无今日网站',
  };

  return {
    ...content,
    copyText: [
      `阅量 · 今日英文阅读 · ${content.date}`,
      `今天计入 ${content.effectiveWords} Words`,
      `阅读时间：${content.readingTime}`,
      `页面：${content.pages} 页`,
      `学习中词汇：${content.learningWords} 个`,
      `今日网站：${content.domain}`,
    ].join('\n'),
  };
}
