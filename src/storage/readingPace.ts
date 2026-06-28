import {
  DEFAULT_READING_CONTENT_TYPE,
  DEFAULT_READING_LANGUAGE,
  createReadingPaceProfileId,
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
  sampleCount: number;
  source: ReadingPaceProfileSource;
  updatedAt?: number;
  hasProfile: boolean;
}

export interface ReadingPaceStore {
  readingPaceProfiles: {
    get: (id: string) => Promise<ReadingPaceProfileRecord | undefined>;
    put: (record: ReadingPaceProfileRecord) => Promise<unknown>;
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

  await store.readingPaceProfiles.put(nextProfile);
  return toReadingPaceSummary(nextProfile, nextProfile.language, nextProfile.contentType);
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
      sampleCount: 0,
      source: 'default',
      hasProfile: false,
    };
  }

  return {
    language: profile.language,
    contentType: profile.contentType,
    baseWordsPerMinute: resolveReadingPaceBaseWordsPerMinute(profile),
    sampleCount: profile.sampleCount,
    source: profile.source,
    updatedAt: profile.updatedAt,
    hasProfile: true,
  };
}
