import { describe, expect, it } from 'vitest';

import { db } from './schema';

describe('Yuel database schema', () => {
  it('indexes PDF annotation links for reader highlight joins', () => {
    expect(db.verno).toBe(8);
    expect(
      db.savedItems.schema.indexes.map((index) => index.name),
    ).toContain('pdfAnnotationId');
  });
});
