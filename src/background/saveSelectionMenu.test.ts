import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SAVE_SELECTION_CONTEXT_MENU_ID,
  handleSaveSelectionMenuClick,
  registerSaveSelectionClickHandler,
  registerSaveSelectionContextMenu,
  type SaveSelectionMenuRuntime,
} from './saveSelectionMenu';

function createRuntime(): SaveSelectionMenuRuntime {
  return {
    contextMenus: {
      create: vi.fn(),
      remove: vi.fn().mockResolvedValue(undefined),
      onClicked: {
        addListener: vi.fn(),
      },
    },
  };
}

describe('save selection context menu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers a selection-only context menu item', async () => {
    const runtime = createRuntime();

    await registerSaveSelectionContextMenu({ runtime });

    expect(runtime.contextMenus.remove).toHaveBeenCalledWith(SAVE_SELECTION_CONTEXT_MENU_ID);
    expect(runtime.contextMenus.create).toHaveBeenCalledWith({
      id: SAVE_SELECTION_CONTEXT_MENU_ID,
      title: '保存到阅量摘录',
      contexts: ['selection'],
      documentUrlPatterns: ['http://*/*', 'https://*/*'],
    });
    expect(runtime.contextMenus.onClicked.addListener).not.toHaveBeenCalled();
  });

  it('registers a click handler and reports successful saves to the source tab', async () => {
    const runtime = createRuntime();
    const saveSelection = vi.fn().mockResolvedValue({
      id: 'saved-1',
    });
    const notifySelectionFeedback = vi.fn().mockResolvedValue(undefined);

    registerSaveSelectionClickHandler({
      runtime,
      saveSelection,
      notifySelectionFeedback,
    });

    expect(runtime.contextMenus.onClicked.addListener).toHaveBeenCalledOnce();
    const listener = vi.mocked(runtime.contextMenus.onClicked.addListener).mock.calls[0]?.[0];
    listener?.({
      menuItemId: SAVE_SELECTION_CONTEXT_MENU_ID,
      selectionText: 'resilience',
      pageUrl: 'https://example.com/article',
    }, {
      id: 12,
      title: 'Resilient systems',
    });

    await vi.waitFor(() => {
      expect(notifySelectionFeedback).toHaveBeenCalledWith(12, {
        type: 'yuel.savedSelectionFeedback',
        status: 'saved',
      });
    });
  });

  it('reports a failed save without mistaking feedback delivery for persistence', async () => {
    const runtime = createRuntime();
    const saveError = new Error('IndexedDB unavailable');
    const saveSelection = vi.fn().mockRejectedValue(saveError);
    const notifySelectionFeedback = vi.fn().mockResolvedValue(undefined);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    registerSaveSelectionClickHandler({
      runtime,
      saveSelection,
      notifySelectionFeedback,
    });

    const listener = vi.mocked(runtime.contextMenus.onClicked.addListener).mock.calls[0]?.[0];
    listener?.({
      menuItemId: SAVE_SELECTION_CONTEXT_MENU_ID,
      selectionText: 'resilience',
      pageUrl: 'https://example.com/article',
    }, {
      id: 12,
      title: 'Resilient systems',
    });

    await vi.waitFor(() => {
      expect(notifySelectionFeedback).toHaveBeenCalledWith(12, {
        type: 'yuel.savedSelectionFeedback',
        status: 'failed',
      });
    });
    expect(consoleError).toHaveBeenCalledWith(
      'Failed to save selected text to Yuel',
      saveError,
    );
    consoleError.mockRestore();
  });

  it('saves clicked selection text with the source page URL', async () => {
    const saveSelection = vi.fn().mockResolvedValue(undefined);

    await handleSaveSelectionMenuClick(
      {
        menuItemId: SAVE_SELECTION_CONTEXT_MENU_ID,
        selectionText: '  mitigate memory overhead  ',
        pageUrl: 'https://github.com/example/repo',
      },
      {
        title: 'Repository overview',
      },
      { saveSelection },
    );

    expect(saveSelection).toHaveBeenCalledWith('mitigate memory overhead', {
      sourceUrl: 'https://github.com/example/repo',
      sourceTitle: 'Repository overview',
      createdAt: expect.any(Number),
    });
  });

  it('ignores unrelated menu clicks and empty selections', async () => {
    const saveSelection = vi.fn().mockResolvedValue(undefined);

    await handleSaveSelectionMenuClick(
      { menuItemId: 'other-menu', selectionText: 'resilience', pageUrl: 'https://example.com' },
      undefined,
      { saveSelection },
    );
    await handleSaveSelectionMenuClick(
      { menuItemId: SAVE_SELECTION_CONTEXT_MENU_ID, selectionText: '   ', pageUrl: 'https://example.com' },
      undefined,
      { saveSelection },
    );

    expect(saveSelection).not.toHaveBeenCalled();
  });
});
