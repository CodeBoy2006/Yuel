import { analyzeEnglishText } from '../analysis/english';

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

export interface PackValidationResult {
  valid: boolean;
  errors: string[];
}

export interface PackMatch {
  kind: 'lexicon' | 'phrase';
  text: string;
  weight: number;
  tags: string[];
}

const FORBIDDEN_EXECUTABLE_FIELDS = new Set(['code', 'eval', 'function', 'remoteCode', 'script', 'scripts', 'wasmUrl']);

export function validatePack(pack: unknown): PackValidationResult {
  const errors: string[] = [];

  if (!isObject(pack)) {
    return { valid: false, errors: ['Pack must be an object'] };
  }

  for (const key of Object.keys(pack)) {
    if (FORBIDDEN_EXECUTABLE_FIELDS.has(key)) {
      errors.push(`Pack contains forbidden executable field: ${key}`);
    }
  }

  if (!isObject(pack.manifest)) {
    errors.push('Pack manifest is required');
  } else {
    if (pack.manifest.schemaVersion !== 1) errors.push('Pack manifest schemaVersion must be 1');
    if (pack.manifest.language !== 'en') errors.push('V0 only supports English packs');
  }

  if (!Array.isArray(pack.lexicon)) {
    errors.push('Pack lexicon must be an array');
  }

  if (!Array.isArray(pack.phrases)) {
    errors.push('Pack phrases must be an array');
  }

  return { valid: errors.length === 0, errors };
}

export function matchPackRules(pack: YuelPack, text: string): PackMatch[] {
  const analysis = analyzeEnglishText(text);
  const tokenSet = new Set(analysis.tokens);
  const normalizedText = ` ${analysis.tokens.join(' ')} `;
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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
