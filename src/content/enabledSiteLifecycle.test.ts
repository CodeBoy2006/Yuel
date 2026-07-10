import { describe, expect, it, vi } from 'vitest';

import { ENABLED_SITE_ORIGINS_KEY } from '../permissions/contentScriptRegistration';
import { watchEnabledSiteAccess, type EnabledSiteLifecycleRuntime } from './enabledSiteLifecycle';

function createRuntime(initialOrigins: string[]) {
  let listener: ((changes: Record<string, { newValue?: unknown }>, areaName: string) => void) | undefined;
  const removeListener = vi.fn();
  const runtime: EnabledSiteLifecycleRuntime = {
    local: {
      async get() {
        return { [ENABLED_SITE_ORIGINS_KEY]: initialOrigins };
      },
    },
    onChanged: {
      addListener(nextListener) {
        listener = nextListener;
      },
      removeListener,
    },
  };
  return { emit: (origins: string[]) => listener?.({ [ENABLED_SITE_ORIGINS_KEY]: { newValue: origins } }, 'local'), removeListener, runtime };
}

describe('watchEnabledSiteAccess', () => {
  it('stops a manually enabled content collector when its origin is removed', async () => {
    const { emit, runtime } = createRuntime(['https://example.com/*']);
    const onDisabled = vi.fn();
    watchEnabledSiteAccess('https://example.com/article', onDisabled, runtime);
    await Promise.resolve();

    emit([]);

    expect(onDisabled).toHaveBeenCalledOnce();
  });

  it('stops immediately when a stale dynamic script starts after disablement', async () => {
    const { runtime } = createRuntime([]);
    const onDisabled = vi.fn();
    watchEnabledSiteAccess('https://example.com/article', onDisabled, runtime);
    await Promise.resolve();

    expect(onDisabled).toHaveBeenCalledOnce();
  });

  it('does not bind manual-origin lifecycle to a starter site', async () => {
    const { runtime } = createRuntime([]);
    const onDisabled = vi.fn();
    watchEnabledSiteAccess('https://developer.mozilla.org/en-US/docs/Web/API', onDisabled, runtime);
    await Promise.resolve();

    expect(onDisabled).not.toHaveBeenCalled();
  });
});
