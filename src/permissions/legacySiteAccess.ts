import { browser } from 'wxt/browser';

export const LEGACY_DYNAMIC_CONTENT_SCRIPT_ID = 'yuel-enabled-sites';
export const LEGACY_ENABLED_SITE_ORIGINS_KEY = 'yuel.enabledSiteOrigins';

export interface LegacySiteAccessRuntime {
  scripting: {
    getRegisteredContentScripts: (filter: { ids: string[] }) => Promise<Array<{ id: string }>>;
    unregisterContentScripts: (filter: { ids: string[] }) => Promise<void>;
  };
  storage: {
    local: {
      remove: (key: string) => Promise<void>;
    };
  };
}

export async function removeLegacySiteAccessState(
  runtime: LegacySiteAccessRuntime = browser as LegacySiteAccessRuntime,
): Promise<void> {
  const registeredScripts = await runtime.scripting.getRegisteredContentScripts({
    ids: [LEGACY_DYNAMIC_CONTENT_SCRIPT_ID],
  });
  const unregisterTask = registeredScripts.some((script) => script.id === LEGACY_DYNAMIC_CONTENT_SCRIPT_ID)
    ? runtime.scripting.unregisterContentScripts({ ids: [LEGACY_DYNAMIC_CONTENT_SCRIPT_ID] })
    : Promise.resolve();

  await Promise.all([
    unregisterTask,
    runtime.storage.local.remove(LEGACY_ENABLED_SITE_ORIGINS_KEY),
  ]);
}
