import { getDomain, hashText } from '../domain/events';
import { db, type SavedItemRecord } from './schema';

export interface SaveSelectedTextOptions {
  sourceUrl?: string;
  createdAt?: number;
}

export async function saveSelectedTextItem(
  selectedText: string,
  options: SaveSelectedTextOptions = {},
): Promise<SavedItemRecord | undefined> {
  const text = selectedText.trim();
  if (!text) {
    return undefined;
  }

  const createdAt = options.createdAt ?? Date.now();
  const record: SavedItemRecord = {
    id: `saved_${createdAt.toString(36)}_${hashText(text)}`,
    text,
    type: classifySavedText(text),
    sourceDomain: getDomain(options.sourceUrl ?? ''),
    tags: ['selection'],
    createdAt,
  };

  await db.savedItems.put(record);
  return record;
}

function classifySavedText(text: string): SavedItemRecord['type'] {
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  if (wordCount <= 1) {
    return 'word';
  }

  if (wordCount <= 8 && !/[.!?]/.test(text)) {
    return 'phrase';
  }

  if (wordCount <= 25) {
    return 'sentence';
  }

  return 'quote';
}
