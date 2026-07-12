import { describe, expect, it, vi } from 'vitest';

import {
  getReadingPaceSummary,
  resetReadingPaceCalibration,
  saveOnboardingReadingPaceCalibration,
  type ReadingPaceResetStore,
} from './readingPace';
import type { ReadingPaceProfileRecord } from './schema';

function createStore(existingProfile?: ReadingPaceProfileRecord): ReadingPaceResetStore {
  const records = new Map<string, ReadingPaceProfileRecord>();
  if (existingProfile) {
    records.set(existingProfile.id, existingProfile);
  }

  return {
    readingPaceProfiles: {
      get: vi.fn(async (id: string) => records.get(id)),
      put: vi.fn(async (record: ReadingPaceProfileRecord) => {
        records.set(record.id, record);
      }),
      delete: vi.fn(async (id: string) => {
        records.delete(id);
      }),
    },
    readingPaceEpisodes: {
      clear: vi.fn(async () => undefined),
    },
  };
}

describe('reading pace storage', () => {
  it('returns a default pace summary without creating a profile', async () => {
    const store = createStore();

    const summary = await getReadingPaceSummary(store);

    expect(summary).toEqual({
      language: 'en',
      contentType: 'general',
      baseWordsPerMinute: 220,
      sampleCount: 0,
      source: 'default',
      hasProfile: false,
    });
    expect(store.readingPaceProfiles.put).not.toHaveBeenCalled();
  });

  it('saves onboarding calibration as the active reading pace profile', async () => {
    const store = createStore();

    const summary = await saveOnboardingReadingPaceCalibration(
      {
        language: 'en-US',
        contentType: 'general',
        wordCount: 240,
        startedAt: 1_000,
        completedAt: 61_000,
        correctAnswers: 3,
        questionCount: 3,
      },
      store,
    );

    expect(store.readingPaceProfiles.put).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'en:general',
        language: 'en',
        contentType: 'general',
        sampleCount: 0,
        source: 'onboarding',
        updatedAt: 61_000,
      }),
    );
    expect(summary).toMatchObject({
      language: 'en',
      contentType: 'general',
      baseWordsPerMinute: expect.closeTo(227, 6),
      source: 'onboarding',
      hasProfile: true,
      calibrationAccepted: true,
    });
  });

  it('does not overwrite the active profile when comprehension is too weak', async () => {
    const existingProfile: ReadingPaceProfileRecord = {
      id: 'en:general',
      language: 'en',
      contentType: 'general',
      baseWordsPerMinute: 205,
      sampleCount: 4,
      source: 'adaptive',
      updatedAt: 500,
    };
    const store = createStore(existingProfile);

    const summary = await saveOnboardingReadingPaceCalibration(
      {
        language: 'en',
        contentType: 'general',
        wordCount: 240,
        startedAt: 1_000,
        completedAt: 61_000,
        correctAnswers: 1,
        questionCount: 3,
      },
      store,
    );

    expect(store.readingPaceProfiles.put).not.toHaveBeenCalled();
    expect(summary).toMatchObject({
      baseWordsPerMinute: 205,
      source: 'adaptive',
      hasProfile: true,
      calibrationAccepted: false,
    });
  });

  it('restores the default pace and clears unfinished adaptive episodes', async () => {
    const existingProfile: ReadingPaceProfileRecord = {
      id: 'en:general',
      language: 'en',
      contentType: 'general',
      baseWordsPerMinute: 248,
      sampleCount: 3,
      source: 'adaptive',
      updatedAt: 500,
    };
    const store = createStore(existingProfile);

    await expect(resetReadingPaceCalibration(store)).resolves.toEqual({
      language: 'en',
      contentType: 'general',
      baseWordsPerMinute: 220,
      sampleCount: 0,
      source: 'default',
      hasProfile: false,
    });
    expect(store.readingPaceProfiles.delete).toHaveBeenCalledWith('en:general');
    expect(store.readingPaceEpisodes.clear).toHaveBeenCalledOnce();
    await expect(getReadingPaceSummary(store)).resolves.toMatchObject({
      baseWordsPerMinute: 220,
      hasProfile: false,
    });
  });
});
