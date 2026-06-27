import { describe, expect, it, vi } from 'vitest';

import { handleMaintenanceAlarm, YUEL_MAINTENANCE_ALARM } from './maintenance';

describe('handleMaintenanceAlarm', () => {
  it('prunes expired raw reading events for the Yuel maintenance alarm', async () => {
    const pruneExpiredReadingEvents = vi.fn();

    const handled = await handleMaintenanceAlarm(
      { name: YUEL_MAINTENANCE_ALARM },
      {
        pruneExpiredReadingEvents,
      },
    );

    expect(handled).toBe(true);
    expect(pruneExpiredReadingEvents).toHaveBeenCalledOnce();
  });

  it('ignores unrelated extension alarms', async () => {
    const pruneExpiredReadingEvents = vi.fn();

    const handled = await handleMaintenanceAlarm(
      { name: 'unrelated.alarm' },
      {
        pruneExpiredReadingEvents,
      },
    );

    expect(handled).toBe(false);
    expect(pruneExpiredReadingEvents).not.toHaveBeenCalled();
  });
});
