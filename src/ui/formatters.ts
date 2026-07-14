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
  const normalizedMinutes = Math.max(0, minutes);
  if (normalizedMinutes < 1 && normalizedMinutes > 0) {
    return '不足 1 分钟';
  }

  const roundedMinutes = Math.round(normalizedMinutes);
  if (roundedMinutes < 60) {
    return `${roundedMinutes} 分钟`;
  }

  const hours = Math.floor(roundedMinutes / 60);
  const remainingMinutes = roundedMinutes % 60;
  return remainingMinutes > 0
    ? `${hours} 小时 ${remainingMinutes} 分钟`
    : `${hours} 小时`;
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
