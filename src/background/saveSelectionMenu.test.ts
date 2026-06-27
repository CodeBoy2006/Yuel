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
      title: 'Save selection to Yuel',
      contexts: ['selection'],
    });
    expect(runtime.contextMenus.onClicked.addListener).not.toHaveBeenCalled();
  });

  it('registers a click handler for selection menu saves', () => {
    const runtime = createRuntime();

    registerSaveSelectionClickHandler({ runtime });

    expect(runtime.contextMenus.onClicked.addListener).toHaveBeenCalledOnce();
  });

  it('saves clicked selection text with the source page URL', async () => {
    const saveSelection = vi.fn().mockResolvedValue(undefined);

    await handleSaveSelectionMenuClick(
      {
        menuItemId: SAVE_SELECTION_CONTEXT_MENU_ID,
        selectionText: '  mitigate memory overhead  ',
        pageUrl: 'https://github.com/example/repo',
      },
      undefined,
      { saveSelection },
    );

    expect(saveSelection).toHaveBeenCalledWith('mitigate memory overhead', {
      sourceUrl: 'https://github.com/example/repo',
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
