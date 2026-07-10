import { startReadingCollector, type CollectorController } from './collector';

const COLLECTOR_KEY = '__yuelReadingCollector';

export interface CollectorPageContext {
  [COLLECTOR_KEY]?: CollectorController;
}

export function startReadingCollectorOnce(
  pageContext: CollectorPageContext = globalThis as CollectorPageContext,
  startCollector = startReadingCollector,
): CollectorController {
  if (!pageContext[COLLECTOR_KEY]) {
    pageContext[COLLECTOR_KEY] = startCollector();
  }

  return pageContext[COLLECTOR_KEY];
}

export function stopReadingCollectorOnce(
  pageContext: CollectorPageContext = globalThis as CollectorPageContext,
): boolean {
  const controller = pageContext[COLLECTOR_KEY];
  if (!controller) return false;

  controller.stop();
  delete pageContext[COLLECTOR_KEY];
  return true;
}
