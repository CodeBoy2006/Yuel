import { describe, expect, it } from 'vitest';

import { matchPackRules, type YuelPack } from './packs';

const basePack: YuelPack = {
  manifest: {
    id: 'tech-english',
    name: 'Tech English',
    version: '0.1.0',
    schemaVersion: 1,
    language: 'en',
    kind: 'professional',
    verified: false,
  },
  lexicon: [
    { term: 'mitigate', weight: 0.82, tags: ['architecture'] },
    { term: 'overhead', weight: 0.72, tags: ['performance'] },
  ],
  phrases: [
    { text: 'fail gracefully', weight: 0.9, tags: ['resilience'] },
    { text: 'backward compatible', weight: 0.84, tags: ['release'] },
  ],
};

describe('matchPackRules', () => {
  it('matches lexicon terms and phrases from normalized English text', () => {
    const matches = matchPackRules(basePack, 'Mitigate memory overhead and fail gracefully during rollout.');

    expect(matches.map((match) => match.text)).toEqual(['mitigate', 'overhead', 'fail gracefully']);
    expect(matches[2].kind).toBe('phrase');
  });
});
