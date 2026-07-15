import {
  DEFAULT_READING_CONTENT_TYPE,
  DEFAULT_READING_LANGUAGE,
  createReadingPaceProfileId,
  normalizeReadingPaceLanguage,
  resolveReadingPaceBaseWordsPerMinute,
  upsertOnboardingReadingPaceProfile,
  type OnboardingReadingPaceInput,
  type ReadingContentType,
  type ReadingPaceProfileSource,
} from '../domain/readingPace';
import { db, type ReadingPaceProfileRecord } from './schema';

export interface ReadingPaceSummary {
  language: string;
  contentType: ReadingContentType;
  baseWordsPerMinute: number;
  adaptiveSampleCount: number;
  source: ReadingPaceProfileSource | 'default';
  updatedAt?: number;
  calibrationAccepted?: boolean;
}

export interface ReadingPaceStore {
  readingPaceProfiles: {
    get: (id: string) => Promise<ReadingPaceProfileRecord | undefined>;
    put: (record: ReadingPaceProfileRecord) => Promise<unknown>;
  };
}

export interface ReadingPaceResetStore extends ReadingPaceStore {
  readingPaceProfiles: ReadingPaceStore['readingPaceProfiles'] & {
    delete: (id: string) => Promise<unknown>;
  };
  readingPaceEpisodes: {
    clear: () => Promise<unknown>;
  };
}

export async function getReadingPaceSummary(
  store: Pick<ReadingPaceStore, 'readingPaceProfiles'> = db,
  language = DEFAULT_READING_LANGUAGE,
  contentType = DEFAULT_READING_CONTENT_TYPE,
): Promise<ReadingPaceSummary> {
  const profileId = createReadingPaceProfileId(language, contentType);
  const profile = await store.readingPaceProfiles.get(profileId);

  return toReadingPaceSummary(profile, language, contentType);
}

export async function saveOnboardingReadingPaceCalibration(
  input: OnboardingReadingPaceInput,
  store: ReadingPaceStore = db,
): Promise<ReadingPaceSummary> {
  const contentType = input.contentType ?? DEFAULT_READING_CONTENT_TYPE;
  const profileId = createReadingPaceProfileId(input.language, contentType);
  const existingProfile = await store.readingPaceProfiles.get(profileId);
  const nextProfile = upsertOnboardingReadingPaceProfile(existingProfile, input);

  if (!nextProfile) {
    return {
      ...toReadingPaceSummary(existingProfile, input.language ?? DEFAULT_READING_LANGUAGE, contentType),
      calibrationAccepted: false,
    };
  }

  await store.readingPaceProfiles.put(nextProfile);
  return {
    ...toReadingPaceSummary(nextProfile, nextProfile.language, nextProfile.contentType),
    calibrationAccepted: true,
  };
}

export async function resetReadingPaceCalibration(
  store: ReadingPaceResetStore = db,
  language = DEFAULT_READING_LANGUAGE,
  contentType = DEFAULT_READING_CONTENT_TYPE,
): Promise<ReadingPaceSummary> {
  const profileId = createReadingPaceProfileId(language, contentType);
  const reset = async () => {
    await store.readingPaceProfiles.delete(profileId);
    await store.readingPaceEpisodes.clear();
  };
  const transaction = (store as unknown as {
    transaction?: (...args: unknown[]) => Promise<unknown>;
  }).transaction;

  if (typeof transaction === 'function') {
    await transaction.call(
      store,
      'rw',
      store.readingPaceProfiles,
      store.readingPaceEpisodes,
      reset,
    );
  } else {
    await reset();
  }

  return toReadingPaceSummary(undefined, normalizeReadingPaceLanguage(language), contentType);
}

function toReadingPaceSummary(
  profile: ReadingPaceProfileRecord | undefined,
  language: string,
  contentType: ReadingContentType,
): ReadingPaceSummary {
  if (!profile) {
    return {
      language,
      contentType,
      baseWordsPerMinute: resolveReadingPaceBaseWordsPerMinute(undefined),
      adaptiveSampleCount: 0,
      source: 'default',
    };
  }

  return {
    language: profile.language,
    contentType: profile.contentType,
    baseWordsPerMinute: resolveReadingPaceBaseWordsPerMinute(profile),
    adaptiveSampleCount: Math.max(0, Math.floor(profile.adaptiveSampleCount ?? 0)),
    source: profile.source,
    updatedAt: profile.updatedAt,
  };
}
