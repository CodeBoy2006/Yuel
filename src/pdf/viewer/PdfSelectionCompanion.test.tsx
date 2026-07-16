import { act } from 'react';
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type {
  PdfCompanionTranslationSnapshot,
  PdfCompanionTranslationTask,
} from '../companion/localCompanion';
import {
  cleanupSmokeRender,
  renderForSmoke,
} from '../../ui/renderTest';
import {
  PdfSelectionCompanion,
  type PdfSelectionCompanionServices,
} from './PdfSelectionCompanion';

describe('PDF selection companion panel', () => {
  it('renders a local translation with page and privacy context', async () => {
    const task = new MutableTranslationTask({
      status: 'ready',
      translatedText: '本地 PDF 渲染',
    });
    const container = await renderForSmoke(
      <PdfSelectionCompanion
        onClose={vi.fn()}
        onRetry={vi.fn()}
        pageNumber={3}
        placement={{ spaceAbove: 260, spaceBelow: 420 }}
        rectHeight={18}
        services={createServices()}
        task={task}
        text="Local PDF rendering"
      />,
    );

    const dialog = container.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog?.getAttribute('aria-labelledby')).toBe(
      'pdf-reader-selection-companion-title',
    );
    expect(dialog?.dataset.side).toBe('below');
    expect(container.textContent).toContain('第 3 页 · 选区不保存');
    expect(container.textContent).toContain('Local PDF rendering');
    expect(container.textContent).toContain('本地 PDF 渲染');
    expect(container.textContent).toContain('本地');
  });

  it('announces bounded download progress and then the result', async () => {
    const task = new MutableTranslationTask({
      status: 'downloading',
      progress: 0.42,
    });
    const container = await renderForSmoke(
      <PdfSelectionCompanion
        onClose={vi.fn()}
        onRetry={vi.fn()}
        pageNumber={1}
        placement={{ spaceAbove: 420, spaceBelow: 120 }}
        rectHeight={18}
        services={createServices()}
        task={task}
        text="Prepare a local translation model"
      />,
    );

    const progress = container.querySelector<HTMLProgressElement>('progress');
    expect(progress?.value).toBe(42);
    expect(progress?.getAttribute('aria-label')).toBe('本地翻译模型下载进度');
    expect(container.querySelector<HTMLElement>('[role="dialog"]')?.dataset.side)
      .toBe('above');

    await act(async () => {
      task.setSnapshot({
        status: 'ready',
        translatedText: '准备本地翻译模型',
      });
    });

    expect(container.querySelector('progress')).toBeNull();
    expect(container.textContent).toContain('准备本地翻译模型');
  });

  it('toggles speech, retries failures, and closes with Escape', async () => {
    const onClose = vi.fn();
    const onRetry = vi.fn();
    const stop = vi.fn();
    const startSpeech = vi.fn((_text, callbacks) => {
      callbacks.onStart?.();
      return { stop };
    }) as PdfSelectionCompanionServices['startSpeech'];
    const task = new MutableTranslationTask({
      status: 'failed',
      reason: 'failed',
    });
    const container = await renderForSmoke(
      <PdfSelectionCompanion
        onClose={onClose}
        onRetry={onRetry}
        pageNumber={1}
        placement={{ spaceAbove: 300, spaceBelow: 300 }}
        rectHeight={18}
        services={{
          canSpeak: () => true,
          startSpeech,
        }}
        task={task}
        text="Read this selection"
      />,
    );

    const speechButton = findButton(container, '朗读所选英文');
    await click(speechButton);
    expect(startSpeech).toHaveBeenCalledWith(
      'Read this selection',
      expect.objectContaining({
        onEnd: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
    expect(speechButton.getAttribute('aria-pressed')).toBe('true');
    expect(speechButton.textContent).toContain('停止');

    await click(speechButton);
    expect(stop).toHaveBeenCalledOnce();
    expect(speechButton.getAttribute('aria-pressed')).toBe('false');

    await click(findButton(container, '重试翻译'));
    expect(onRetry).toHaveBeenCalledOnce();

    const dialog = container.querySelector<HTMLElement>('[role="dialog"]');
    await act(async () => {
      dialog?.dispatchEvent(new KeyboardEvent('keydown', {
        bubbles: true,
        key: 'Escape',
      }));
    });
    expect(onClose).toHaveBeenCalledOnce();

    await cleanupSmokeRender(container);
    expect(task.cancel).toHaveBeenCalledOnce();
  });
});

class MutableTranslationTask implements PdfCompanionTranslationTask {
  private snapshot: PdfCompanionTranslationSnapshot;
  private readonly listeners = new Set<() => void>();

  readonly cancel = vi.fn();

  constructor(snapshot: PdfCompanionTranslationSnapshot) {
    this.snapshot = snapshot;
  }

  readonly getSnapshot = () => this.snapshot;

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  setSnapshot(snapshot: PdfCompanionTranslationSnapshot) {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }
}

function createServices(): PdfSelectionCompanionServices {
  return {
    canSpeak: () => true,
    startSpeech: () => ({ stop: vi.fn() }),
  };
}

function findButton(container: HTMLElement, accessibleName: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
    .find((candidate) =>
      candidate.getAttribute('aria-label') === accessibleName
      || candidate.textContent?.trim() === accessibleName);
  if (!button) throw new Error(`Missing button: ${accessibleName}`);
  return button;
}

async function click(button: HTMLButtonElement): Promise<void> {
  await act(async () => {
    button.click();
  });
}
