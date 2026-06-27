import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { ReactElement } from 'react';

export async function renderForSmoke(element: ReactElement): Promise<HTMLElement> {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(element);
  });

  for (let index = 0; index < 3; index += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }

  return container;
}
