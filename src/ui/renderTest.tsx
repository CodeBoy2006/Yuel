import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ReactElement } from 'react';
import { afterEach } from 'vitest';

const mountedRoots = new Map<HTMLElement, Root>();

afterEach(async () => {
  await cleanupSmokeRenders();
});

export async function renderForSmoke(element: ReactElement): Promise<HTMLElement> {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.set(container, root);

  try {
    await act(async () => {
      root.render(element);
    });

    for (let index = 0; index < 3; index += 1) {
      await act(async () => {
        await Promise.resolve();
      });
    }

    return container;
  } catch (error) {
    await cleanupSmokeRender(container);
    throw error;
  }
}

export async function cleanupSmokeRender(container: HTMLElement): Promise<void> {
  const root = mountedRoots.get(container);
  try {
    if (root) {
      mountedRoots.delete(container);
      await act(async () => {
        root.unmount();
      });
    }
  } finally {
    container.remove();
  }
}

export async function cleanupSmokeRenders(): Promise<void> {
  let firstError: unknown;
  for (const container of [...mountedRoots.keys()]) {
    try {
      await cleanupSmokeRender(container);
    } catch (error) {
      firstError ??= error;
    }
  }

  if (firstError) {
    throw firstError;
  }
}
