import { pruneExpiredReadingEvents } from '../storage/repositories';

export const YUEL_MAINTENANCE_ALARM = 'yuel.rollup.hourly';

export interface ExtensionAlarm {
  name: string;
}

export interface MaintenanceDependencies {
  pruneExpiredReadingEvents: () => Promise<void>;
}

const defaultDependencies: MaintenanceDependencies = {
  pruneExpiredReadingEvents,
};

export async function handleMaintenanceAlarm(
  alarm: ExtensionAlarm,
  dependencies: MaintenanceDependencies = defaultDependencies,
): Promise<boolean> {
  if (alarm.name !== YUEL_MAINTENANCE_ALARM) {
    return false;
  }

  await dependencies.pruneExpiredReadingEvents();
  return true;
}
