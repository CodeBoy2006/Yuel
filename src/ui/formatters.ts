export type VocabularyStatus = 'new' | 'learning' | 'known' | 'ignored';

const countFormatter = new Intl.NumberFormat('zh-CN');
const dateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatCount(value: number): string {
  return countFormatter.format(Math.round(value));
}

export function formatVocabularyExposureCount(value: number): string {
  return countFormatter.format(Math.ceil(value));
}

export function formatWords(words: number): string {
  return `${formatCount(words)} 词`;
}

export function formatMinutes(minutes: number): string {
  if (minutes < 1 && minutes > 0) {
    return '不足 1 分钟';
  }

  return `${Math.round(minutes)} 分钟`;
}

export function formatDateTime(timestamp: number): string {
  return dateTimeFormatter.format(new Date(timestamp));
}

export function formatVocabularyStatus(status: VocabularyStatus): string {
  if (status === 'new') return '新词';
  if (status === 'learning') return '学习中';
  if (status === 'known') return '已掌握';
  return '已忽略';
}
