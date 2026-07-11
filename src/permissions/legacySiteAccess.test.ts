import { describe, expect, it } from 'vitest';

import {
  LEGACY_DYNAMIC_CONTENT_SCRIPT_ID,
  LEGACY_ENABLED_SITE_ORIGINS_KEY,
  removeLegacySiteAccessState,
  type LegacySiteAccessRuntime,
} from './legacySiteAccess';

function createRuntime(registered: boolean): LegacySiteAccessRuntime & {
  removedStorageKeys: string[];
  unregisteredFilters: Array<{ ids: string[] }>;
} {
  const removedStorageKeys: string[] = [];
  const unregisteredFilters: Array<{ ids: string[] }> = [];

  return {
    removedStorageKeys,
    unregisteredFilters,
    scripting: {
      async getRegisteredContentScripts(filter) {
        expect(filter).toEqual({ ids: [LEGACY_DYNAMIC_CONTENT_SCRIPT_ID] });
        return registered ? [{ id: LEGACY_DYNAMIC_CONTENT_SCRIPT_ID }] : [];
      },
      async unregisterContentScripts(filter) {
        unregisteredFilters.push(filter);
      },
    },
    storage: {
      local: {
        async remove(key) {
          removedStorageKeys.push(key);
        },
      },
    },
  };
}

describe('removeLegacySiteAccessState', () => {
  it('removes the old dynamic content script and persisted site allowlist', async () => {
    const runtime = createRuntime(true);

    await removeLegacySiteAccessState(runtime);

    expect(runtime.unregisteredFilters).toEqual([{ ids: [LEGACY_DYNAMIC_CONTENT_SCRIPT_ID] }]);
    expect(runtime.removedStorageKeys).toEqual([LEGACY_ENABLED_SITE_ORIGINS_KEY]);
  });

  it('still removes obsolete storage when no dynamic script remains', async () => {
    const runtime = createRuntime(false);

    await removeLegacySiteAccessState(runtime);

    expect(runtime.unregisteredFilters).toEqual([]);
    expect(runtime.removedStorageKeys).toEqual([LEGACY_ENABLED_SITE_ORIGINS_KEY]);
  });
});
