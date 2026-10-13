export interface YuelPackManifest {
  id: string;
  name: string;
  version: string;
  schemaVersion: 1;
  language: 'en';
  kind: 'language' | 'exam' | 'professional' | 'academic' | 'card' | 'export';
  verified: boolean;
}

export interface PackLexiconEntry {
  term: string;
  weight: number;
  tags: string[];
}

export interface PackPhraseEntry {
  text: string;
  weight: number;
  tags: string[];
}

export interface YuelPack {
  manifest: YuelPackManifest;
  lexicon: PackLexiconEntry[];
  phrases: PackPhraseEntry[];
}

export interface PackMatch {
  kind: 'lexicon' | 'phrase';
  text: string;
  weight: number;
  tags: string[];
}

export function matchPackRules(pack: YuelPack, normalizedTokens: readonly string[]): PackMatch[] {
  const tokenSet = new Set(normalizedTokens);
  const normalizedText = ` ${normalizedTokens.join(' ')} `;
  const matches: PackMatch[] = [];

  for (const entry of pack.lexicon) {
    const term = entry.term.toLowerCase();
    if (tokenSet.has(term)) {
      matches.push({ kind: 'lexicon', text: entry.term, weight: entry.weight, tags: entry.tags });
    }
  }

  for (const entry of pack.phrases) {
    const phrase = entry.text.toLowerCase().replace(/[‐-‒–—―]/g, ' ');
    if (normalizedText.includes(` ${phrase} `)) {
      matches.push({ kind: 'phrase', text: entry.text, weight: entry.weight, tags: entry.tags });
    }
  }

  return matches;
}
