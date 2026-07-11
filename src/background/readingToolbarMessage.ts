import { isReadingToolbarRefreshRequest } from '../messaging/contracts';
import { syncReadingToolbarIcon } from './readingToolbar';

export type ReadingToolbarIconSyncer = () => Promise<unknown>;

export interface ReadingToolbarMessageDependencies {
  syncToolbarIcon?: ReadingToolbarIconSyncer;
}

export interface ReadingToolbarMessageResponse {
  ok: boolean;
}

export function handleReadingToolbarRuntimeMessage(
  message: unknown,
  {
    syncToolbarIcon = syncReadingToolbarIcon,
  }: ReadingToolbarMessageDependencies = {},
): Promise<void> | undefined {
  if (!isReadingToolbarRefreshRequest(message)) {
    return undefined;
  }

  return syncToolbarIcon().then(() => undefined);
}

export function respondToReadingToolbarRuntimeMessage(
  message: unknown,
  sendResponse: (response: ReadingToolbarMessageResponse) => void,
  dependencies: ReadingToolbarMessageDependencies = {},
): true | undefined {
  const pending = handleReadingToolbarRuntimeMessage(message, dependencies);
  if (!pending) return undefined;

  void pending.then(
    () => sendResponse({ ok: true }),
    () => sendResponse({ ok: false }),
  );
  return true;
}
